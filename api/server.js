// Liberty Tool Company API (ltc-api on Render)
// Keeps third-party secrets server-side. No npm dependencies: Node 20+ built-ins only.

const http = require("node:http");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 10000;
const CAL_BASE = process.env.CAL_BASE_URL || "https://api.cal.com/v2";
const CAL_API_KEY = process.env.CAL_API_KEY || "";
const CAL_WEBHOOK_SECRET = process.env.CAL_WEBHOOK_SECRET || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Cal.com pins a version per endpoint family. Missing this header = 404 or old behavior.
const CAL_VERSIONS = {
  eventTypes: "2024-06-14",
  slots: "2024-09-04",
  bookings: process.env.CAL_BOOKINGS_VERSION || "2026-02-25",
};

// The public "Book A Call" event on libertytoolcompany.com
// https://liberty-tool-company.cal.com/brandon/website-outreach
const WEBSITE_EVENT = {
  slug: process.env.CAL_EVENT_SLUG || "website-outreach",
  username: process.env.CAL_USERNAME || "brandon",
  orgSlug: process.env.CAL_ORG_SLUG || "liberty-tool-company",
};
const SALES_TZ = "America/Los_Angeles"; // the site shows times in Pacific

// ---------- helpers ----------

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      Vary: "Origin",
    };
  }
  return {};
}

function send(req, res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders(req) });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function cal(path, { method = "GET", version, body } = {}) {
  if (!CAL_API_KEY || CAL_API_KEY.startsWith("PASTE_")) {
    const err = new Error("CAL_API_KEY is not set on the server");
    err.status = 503;
    throw err;
  }
  const r = await fetch(`${CAL_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${CAL_API_KEY}`,
      "cal-api-version": version,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error?.message || `Cal.com error ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

// ---------- website event ----------

let websiteEventId = null; // resolved once, then cached
let websiteFields = null; // the event's booking questions

async function loadWebsiteFields(id) {
  if (websiteFields || !id) return websiteFields || [];
  try {
    const ev = await cal(`/event-types/${id}`, { version: CAL_VERSIONS.eventTypes });
    websiteFields = (ev.data && ev.data.bookingFields) || [];
    console.log(
      "[cal] booking fields:",
      JSON.stringify(websiteFields.map((f) => ({ slug: f.slug || f.name, type: f.type, required: f.required, hidden: f.hidden, options: f.options })))
    );
  } catch (e) {
    console.warn("[cal] booking fields lookup failed:", e.message);
  }
  return websiteFields || [];
}

// Answer any required custom questions on the event from what the site form collected.
const STANDARD_FIELDS = new Set(["name", "email", "attendeePhoneNumber", "notes", "guests", "rescheduleReason", "location", "title", "attendeeName", "attendeeEmail"]);
const TOPIC_WORDS = {
  "crew tools": ["crew", "installer", "contractor", "tool", "flooring", "myself"],
  "become a dealer": ["dealer", "retail", "store", "distribut", "stock", "resell", "supplier"],
  "company account / po": ["company", "enterprise", "account", "po", "business", "corporate", "purchas"],
  ambassador: ["ambassador", "affiliate", "influencer", "creator", "partner"],
};
function optionText(o) {
  return typeof o === "string" ? o : (o && (o.value || o.label)) || "";
}
function bestOption(options, topic) {
  const list = (options || []).map(optionText).filter(Boolean);
  if (!list.length) return null;
  const t = topic.toLowerCase();
  const words = TOPIC_WORDS[t] || t.split(/\W+/).filter((w) => w.length > 2);
  let best = null, score = 0;
  for (const o of list) {
    const ol = o.toLowerCase();
    const sc = (ol === t ? 100 : 0) + words.filter((w) => ol.includes(w)).length;
    if (sc > score) (best = o), (score = sc);
  }
  return best || list.find((o) => /other/i.test(o)) || list[0];
}
function customResponses(fields, info) {
  const out = {};
  for (const f of fields) {
    const slug = f.slug || f.name;
    if (!slug || STANDARD_FIELDS.has(slug) || !f.required || f.hidden) continue;
    const label = `${f.label || ""} ${slug}`.toLowerCase();
    const summary = [info.topic, info.company].filter(Boolean).join(" · ") || info.name;
    switch (f.type) {
      case "select":
      case "radio": {
        const v = bestOption(f.options, info.topic || "");
        if (v) out[slug] = v;
        break;
      }
      case "multiselect":
      case "checkbox": {
        const v = bestOption(f.options, info.topic || "");
        if (v) out[slug] = [v];
        break;
      }
      case "boolean":
        out[slug] = true;
        break;
      case "phone":
        if (info.phone) out[slug] = info.phone;
        break;
      case "email":
        out[slug] = info.email;
        break;
      case "number":
        out[slug] = 1;
        break;
      default:
        out[slug] = /compan|business|organi/.test(label) && info.company ? info.company : summary;
    }
  }
  return out;
}

async function resolveWebsiteEvent() {
  if (websiteEventId) return websiteEventId;
  // 1) Event types owned by the API key's account
  try {
    const own = await cal("/event-types", { version: CAL_VERSIONS.eventTypes });
    const hit = (own.data || []).find((e) => e.slug === WEBSITE_EVENT.slug);
    if (hit) return (websiteEventId = hit.id);
  } catch (e) {
    console.warn("[cal] own event-types lookup failed:", e.message);
  }
  // 2) Public lookup by username + slug (+ organization)
  try {
    const qs = new URLSearchParams({
      username: WEBSITE_EVENT.username,
      eventSlug: WEBSITE_EVENT.slug,
      orgSlug: WEBSITE_EVENT.orgSlug,
    });
    const pub = await cal(`/event-types?${qs}`, { version: CAL_VERSIONS.eventTypes });
    const d = Array.isArray(pub.data) ? pub.data[0] : pub.data;
    if (d && d.id) return (websiteEventId = d.id);
  } catch (e) {
    console.warn("[cal] public event-type lookup failed:", e.message);
  }
  return null; // fall back to slug-based calls
}

function websiteEventParams(id) {
  return id
    ? { eventTypeId: id }
    : {
        eventTypeSlug: WEBSITE_EVENT.slug,
        username: WEBSITE_EVENT.username,
        organizationSlug: WEBSITE_EVENT.orgSlug,
      };
}

// US numbers -> E.164; anything unclear is left out of phoneNumber (still kept in notes)
function toE164(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return null;
}

// Light spam guard: 5 bookings per IP per 10 minutes
const hits = new Map();
function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

function originAllowed(req) {
  const o = req.headers.origin;
  return !o || ALLOWED_ORIGINS.includes(o);
}

// TODO (Clerk): verify the signed-in user's session token here once Clerk is set up.
// Until then, booking creation is open to anyone who can reach the allowed origins.
async function requireUser(_req) {
  return true;
}

// ---------- routes ----------

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname, searchParams } = url;

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }

  // Health check for Render
  if (req.method === "GET" && pathname === "/health") {
    return send(req, res, 200, { ok: true, calConfigured: !!CAL_API_KEY && !CAL_API_KEY.startsWith("PASTE_") });
  }

  // ----- Website "Book A Call" (public, Website Outreach event) -----

  // Open times grouped by Pacific date: /api/cal/website/slots?days=14
  if (req.method === "GET" && pathname === "/api/cal/website/slots") {
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 14, 1), 30);
    const start = new Date();
    const end = new Date(start.getTime() + days * 86400000);
    const id = await resolveWebsiteEvent();
    const qs = new URLSearchParams({
      ...websiteEventParams(id),
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: SALES_TZ,
    });
    const data = await cal(`/slots?${qs}`, { version: CAL_VERSIONS.slots });
    // Normalize to [{ date: "2026-11-19", slots: ["2026-11-19T16:00:00.000Z", ...] }]
    const out = Object.keys(data.data || {})
      .sort()
      .map((date) => ({
        date,
        slots: (data.data[date] || [])
          .map((s) => new Date(s.start || s.time || s).toISOString())
          .filter((iso) => new Date(iso) > start),
      }))
      .filter((d) => d.slots.length);
    return send(req, res, 200, { timeZone: SALES_TZ, days: out });
  }

  // Book it. Body: { start, name, email, phone?, company?, topic?, notes?, timeZone?, website? (honeypot) }
  if (req.method === "POST" && pathname === "/api/cal/website/bookings") {
    if (!originAllowed(req)) return send(req, res, 403, { error: "Origin not allowed" });
    if (rateLimited(req)) return send(req, res, 429, { error: "Too many requests. Please call or text 239-744-8403." });
    let b;
    try {
      b = JSON.parse((await readBody(req, 20000)).toString("utf8"));
    } catch {
      return send(req, res, 400, { error: "Invalid JSON" });
    }
    if (b && b.website) return send(req, res, 200, { ok: true }); // bot filled the hidden field
    const name = String(b.name || "").trim().slice(0, 120);
    const email = String(b.email || "").trim().slice(0, 200);
    const start = String(b.start || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || isNaN(Date.parse(start))) {
      return send(req, res, 400, { error: "Name, a valid email and a time are required." });
    }
    const company = String(b.company || "").trim().slice(0, 160);
    const topic = String(b.topic || "").trim().slice(0, 80);
    const phoneRaw = String(b.phone || "").trim().slice(0, 40);
    const phone = toE164(phoneRaw);
    const notesText = [
      topic && `Topic: ${topic}`,
      company && `Company: ${company}`,
      phoneRaw && `Cell: ${phoneRaw}`,
      String(b.notes || "").trim().slice(0, 2000),
    ]
      .filter(Boolean)
      .join("\n");
    let tz = String(b.timeZone || SALES_TZ);
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { tz = SALES_TZ; }

    const id = await resolveWebsiteEvent();
    const fields = await loadWebsiteFields(id);
    const extra = customResponses(fields, { topic, company, name, email, phone });
    const metadata = { source: "libertytoolcompany.com" };
    if (topic) metadata.topic = topic;
    if (company) metadata.company = company;
    const data = await cal("/bookings", {
      method: "POST",
      version: CAL_VERSIONS.bookings,
      body: {
        ...websiteEventParams(id),
        start: new Date(start).toISOString(),
        attendee: { name, email, timeZone: tz, language: "en", ...(phone ? { phoneNumber: phone } : {}) },
        bookingFieldsResponses: { ...extra, ...(notesText ? { notes: notesText } : {}) },
        metadata,
      },
    });
    const bk = data.data || {};
    console.log("[website booking]", bk.uid, bk.start, topic || "-");
    return send(req, res, 201, { ok: true, uid: bk.uid, start: bk.start || start });
  }

  // List the account's event types (e.g. "Partner Intro Call")
  if (req.method === "GET" && pathname === "/api/cal/event-types") {
    const data = await cal("/event-types", { version: CAL_VERSIONS.eventTypes });
    const items = (data.data || []).map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      lengthInMinutes: e.lengthInMinutes,
      description: e.description,
    }));
    return send(req, res, 200, { data: items });
  }

  // Available slots: /api/cal/slots?eventTypeId=123&start=2026-11-20&end=2026-11-27&timeZone=America/New_York
  if (req.method === "GET" && pathname === "/api/cal/slots") {
    const eventTypeId = searchParams.get("eventTypeId");
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (!eventTypeId || !start || !end) {
      return send(req, res, 400, { error: "eventTypeId, start and end are required" });
    }
    const qs = new URLSearchParams({ eventTypeId, start, end });
    const tz = searchParams.get("timeZone");
    if (tz) qs.set("timeZone", tz);
    const data = await cal(`/slots?${qs}`, { version: CAL_VERSIONS.slots });
    return send(req, res, 200, data);
  }

  // Create a booking
  // Body: { eventTypeId, start (ISO UTC), name, email, timeZone, phone?, notes? }
  if (req.method === "POST" && pathname === "/api/cal/bookings") {
    await requireUser(req);
    const raw = await readBody(req);
    let b;
    try {
      b = JSON.parse(raw.toString("utf8"));
    } catch {
      return send(req, res, 400, { error: "Invalid JSON" });
    }
    const { eventTypeId, start, name, email, timeZone, phone, notes } = b || {};
    if (!eventTypeId || !start || !name || !email || !timeZone) {
      return send(req, res, 400, { error: "eventTypeId, start, name, email and timeZone are required" });
    }
    const data = await cal("/bookings", {
      method: "POST",
      version: CAL_VERSIONS.bookings,
      body: {
        eventTypeId: Number(eventTypeId),
        start,
        attendee: { name, email, timeZone, ...(phone ? { phoneNumber: phone } : {}) },
        ...(notes ? { bookingFieldsResponses: { notes } } : {}),
      },
    });
    return send(req, res, 201, data);
  }

  // Cal.com webhook (booking created / cancelled / rescheduled)
  if (req.method === "POST" && pathname === "/api/cal/webhook") {
    const raw = await readBody(req);
    if (CAL_WEBHOOK_SECRET) {
      const expected = crypto.createHmac("sha256", CAL_WEBHOOK_SECRET).update(raw).digest("hex");
      const got = String(req.headers["x-cal-signature-256"] || "");
      const ok =
        got.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
      if (!ok) return send(req, res, 401, { error: "Bad signature" });
    }
    const event = JSON.parse(raw.toString("utf8") || "{}");
    // TODO: store in the LTC database / notify sales once those exist.
    console.log("[cal webhook]", event.triggerEvent, event.payload?.uid);
    return send(req, res, 200, { received: true });
  }

  return send(req, res, 404, { error: "Not found" });
}

http
  .createServer((req, res) => {
    route(req, res).catch((err) => {
      console.error(err);
      send(req, res, err.status && err.status < 600 ? err.status : 500, { error: err.message || "Server error" });
    });
  })
  .listen(PORT, () => {
    console.log(`ltc-api listening on ${PORT}`);
    // Startup check, visible in the Render logs
    if (!CAL_API_KEY || CAL_API_KEY.startsWith("PASTE_")) return console.warn("[startup] CAL_API_KEY not set");
    resolveWebsiteEvent()
      .then(async (id) => (await loadWebsiteFields(id), id))
      .then((id) =>
        console.log(
          id
            ? `[startup] Cal.com OK: "${WEBSITE_EVENT.slug}" event id ${id}`
            : `[startup] Cal.com key works, but "${WEBSITE_EVENT.slug}" was not found by id; using slug lookup`
        )
      )
      .catch((e) => console.warn("[startup] Cal.com check failed:", e.message));
  });
