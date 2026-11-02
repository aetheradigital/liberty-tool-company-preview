# Liberty Tool Company — Client Preview Portal

Static preview of libertytoolcompany.com and the launch materials, for client review only (pages are `noindex`).

- `/` — Preview portal (start here)
- `/option-1/` — Homepage, Option 1 (Classic)
- `/option-2/` — Homepage, Option 2 (Fun / Logo Blue)
- `/approvals/` — Social Approval Board (Nov 2 – Dec 1, 26 posts). Decisions save in the reviewer's browser (localStorage).
- `/ads/` — Ad creative (5 feed ads)
- `/partner-portal/option-1/`, `/partner-portal/option-2/` — Partner portal mockup for distributors and enterprise buyers (orders incl. multi-store, files, messages, booking, price sheet)
- `/admin/option-1/`, `/admin/option-2/` — LTC admin mockup (order queue, accounts, pricing, messages, calendar, files). Shares data with the partner portal through the browser's localStorage, so orders placed in the portal appear in the admin on the same browser.

Plain HTML, no build step. `public/runtime.js` renders each page's template and runs the interactive pieces. Forms, booking, Quote List and checkout are front-end only until wired to HighLevel and Shopify.

Deploy: Render static site, publish directory `public`.
