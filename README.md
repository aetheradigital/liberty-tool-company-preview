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

- **Preview** — https://ltc-preview.onrender.com (Render `ltc-preview`) deploys every push to `main`. Keep using it for client review.
- **Release** — https://ltc-release.onrender.com (Render `ltc-release`) deploys the `release` branch only. Custom domains (libertytoolcompany.com, partner.libertytoolcompany.com) attach to this site.
- To publish what's on `main` to the release site: `tools/publish_release.sh`. It runs `tools/make_release.py` on a copy of `main` and force-pushes the result to `release`: the website becomes the home page at `/` (and `/option-2/` forwards there), the preview bar is removed, `partner.*` visitors to `/` go to the partner portal, and the reviews section is left out while it still holds placeholder quotes.
- The Where We Ship map draws real state outlines from us-atlas (jsDelivr, `states-albers-10m.json`); if that file can't load, the state tile grid shows instead.
