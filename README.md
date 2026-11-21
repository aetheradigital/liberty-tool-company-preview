# Liberty Tool Company — Client Preview Portal

Static preview of libertytoolcompany.com and the launch materials, for client review only (pages are `noindex`).

- `/` — Preview portal (start here)
- `/option-1/` — Homepage, Option 1 (Classic)
- `/option-2/` — Homepage, Option 2 (Fun / Logo Blue)
- `/approvals/` — Social Posting Calendar (Nov 2, 2026 – Jan 1, 2027, 61 posts incl. Sunday silent how-to videos, one-click copy for every post and platform) for LTC to post from and mark posts as posted. Progress saves in the browser (localStorage).
- `/partner-portal/option-2/` — Partner portal mockup for distributors and enterprise buyers (sign-in with invite links, password resets, lockout and Account Admin password tools; Distributor Agreement e-signing on first sign-in with the signed copy in Files; phone layout with a hamburger menu; orders incl. multi-store, order approvals, change and cancel requests, returns and claims with photos, billing with invoices, statements and pay, reports with CSV export, profile and notification settings, files, messages, booking, price sheet). `/partner-portal/option-1/` redirects here.
- `/admin/option-1/`, `/admin/option-2/` — LTC admin mockup (order queue, partner logins with reset links, temporary passwords and unlock, requests for order changes, cancels, returns and claims, billing, accounts, pricing, messages, calendar, files). Shares data with the partner portal through the browser's localStorage, so orders placed in the portal appear in the admin on the same browser.

Plain HTML, no build step. `public/runtime.js` renders each page's template and runs the interactive pieces. Forms, booking, Quote List and checkout are front-end only until wired to HighLevel and Shopify.

Deploy: Render static site, publish directory `public`.

## Preview and release sites

All LTC services are in the **Liberty Tool Company** Render workspace.

- **Preview** — https://ltc-preview-weii.onrender.com (Render `ltc-preview`) deploys every push to `main`. Keep using it for client review.
- **Release** — https://ltc-release-yq66.onrender.com (Render `ltc-release`) deploys the `release` branch only. Custom domains (libertytoolcompany.com, partner.libertytoolcompany.com) attach to this site.
- To publish what's on `main` to the release site: `tools/publish_release.sh`. It runs `tools/make_release.py` on a copy of `main` and force-pushes the result to `release`: the website becomes the home page at `/` (and `/option-2/` forwards there), the preview bar is removed, `partner.*` visitors to `/` go to the partner portal, the reviews section is left out while it still holds placeholder quotes, and Google Tag Manager (`GTM-N4DHV9J6`) is added to the website, privacy, terms and ambassador-terms pages (release only, not on partner.*; GA4 is configured inside the GTM container).
- SEO/AI search (release only): `make_release.py` sets the title ("Liberty Tool Company | Jobsite Tools for Installers"), meta description, Open Graph/Twitter tags (share image `assets/og-home.jpg`) and Organization/WebSite JSON-LD, and writes `llms.txt`. Then `tools/prerender.mjs` renders the home page in headless Chrome so crawlers and AI assistants get the full text without JavaScript (runtime.js hydrates over it), moves the template into a `<script type="text/template">` so no `{{...}}` text shows, and adds FAQPage and Product JSON-LD from the page's `FAQS` and `TOOLS`. Publishing needs Playwright and Chrome/Chromium (`CHROME_PATH` to point at one); it stops if they're missing rather than ship an empty page.
- The Where We Ship map draws real state outlines from us-atlas (jsDelivr, `states-albers-10m.json`); if that file can't load, the state tile grid shows instead.

## Backend API (`api/`)

- **Service** — Render web service `ltc-api` (https://ltc-api-z2o9.onrender.com), Node 20+, no npm dependencies. Deploys every push to `main`; build `cd api && npm install`, start `cd api && npm start`. Health check: `/health`.
- **Why it exists** — static sites can't hold secrets. Every third-party key (Cal.com now; Stripe, Clerk, Twilio, R2, Postmark, R&L later) lives only in `ltc-api`'s Render environment, never in `public/`.
- **Environment** — `CAL_API_KEY` (paste in the Render dashboard; never commit it), `CAL_WEBHOOK_SECRET` (optional), `ALLOWED_ORIGINS` (comma-separated sites allowed to call the API; currently the preview and release sites plus libertytoolcompany.com and www.libertytoolcompany.com). Optional overrides: `CAL_EVENT_SLUG` (default `website-outreach`), `CAL_USERNAME` (default `brandon`), `CAL_ORG_SLUG` (default `liberty-tool-company`), `CAL_BOOKINGS_VERSION` (default `2026-02-25`).
- **Website Book A Call** — the `#schedule` section on the main site (`public/option-2/`) loads real open times for the Cal.com **Website Outreach** event (https://liberty-tool-company.cal.com/brandon/website-outreach) and books through the API. Times show in Pacific. If the API can't be reached, the section tells visitors to call or text 239-744-8403. On startup the API logs `[startup] Cal.com OK` once the key can see the event.
  - `GET /api/cal/website/slots?days=14` — open times grouped by Pacific date
  - `POST /api/cal/website/bookings` — `{ start, name, email, phone?, company?, topic?, notes?, timeZone? }`; 5 per visitor per 10 minutes, hidden spam field, allowed sites only
- **Cal.com endpoints (general)**
  - `GET /api/cal/event-types` — list event types
  - `GET /api/cal/slots?eventTypeId=&start=&end=&timeZone=` — open times
  - `POST /api/cal/bookings` — `{ eventTypeId, start, name, email, timeZone, phone?, notes? }`
  - `POST /api/cal/webhook` — Cal.com webhook target; verifies `X-Cal-Signature-256` when `CAL_WEBHOOK_SECRET` is set
- **To do** — require a Clerk session on booking creation once Clerk is set up.
