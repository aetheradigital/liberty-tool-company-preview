# Liberty Tool Company — Client Preview Portal

Static preview of libertytoolcompany.com and the launch materials, for client review only (pages are `noindex`).

- `/` — Preview portal (start here)
- `/option-1/` — Homepage, Option 1 (Classic)
- `/option-2/` — Homepage, Option 2 (Fun / Logo Blue)
- `/approvals/` — Social Posting Calendar (Nov 2, 2026 – Jan 1, 2027, 61 posts incl. Sunday silent how-to videos, one-click copy for every post and platform) for LTC to post from and mark posts as posted. Progress saves in the browser (localStorage).
- `/partner-portal/option-2/` — Partner portal mockup for distributors and enterprise buyers (orders incl. multi-store, order approvals, change and cancel requests, returns and claims with photos, billing with invoices, statements and pay, reports with CSV export, profile and notification settings, files, messages, booking, price sheet). `/partner-portal/option-1/` redirects here.
- `/admin/option-1/`, `/admin/option-2/` — LTC admin mockup (order queue, requests for order changes, cancels, returns and claims, billing, accounts, pricing, messages, calendar, files). Shares data with the partner portal through the browser's localStorage, so orders placed in the portal appear in the admin on the same browser.

Plain HTML, no build step. `public/runtime.js` renders each page's template and runs the interactive pieces. Forms, booking, Quote List and checkout are front-end only until wired to HighLevel and Shopify.

Deploy: Render static site, publish directory `public`.
