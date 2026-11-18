// Liberty Tool Company API (ltc-api on Render)
// Keeps third-party secrets server-side. No npm dependencies: Node 20+ built-ins only.

const http = require("node:http");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 10000;
const CAL_BASE = "https://api.cal.com/v2";
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
  bookings: process.env.CAL_API_VERSION || "2024-08-13",
};

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
  .listen(PORT, () => console.log(`ltc-api listening on ${PORT}`));
