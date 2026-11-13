# AAMM existing application audit and migration plan

Audit date: 13 November 2026. Source baseline: `3361834994abe3f806a24d306e3bd6975480c1de` in `jayanthharikrishnan/aamm-website`.

## Existing system and verified business information

AAMM is the existing Alagar Automobiles spare-parts catalogue and WhatsApp ordering application. The baseline uses static HTML, CSS and browser JavaScript served by Express 5, with the `sqlite3` package. It does not require a frontend framework or build process. `npm start` runs `node server.js`.

The existing deployed homepage at <https://aamm-6rvg.onrender.com/> returned HTTP 200 during the audit. Its response was byte-identical to the cloned `index.html`. The live public catalogue endpoint returned 137 product records, and `/products/categories` returned `Alternator (Dynamo)` and `Self Motor`. These read-only checks did not create orders or alter the live database.

The existing source links the call action to `9600715822` and WhatsApp to `919344898473`; these are inherited business contact details, not independent verification of phone ownership. The owner supplied this location link: <https://maps.app.goo.gl/2G5aei6qZseprHf38>. No street address, opening hours, certifications, customer reviews or delivery guarantees were verified. The existing logo is `images/logo.jpeg`.

## Database preservation baseline

The checked-in `database.db` was opened read-only before any application startup. `PRAGMA integrity_check` returned `ok`.

| Table | Existing rows |
| --- | ---: |
| `products` | 137 |
| `sales` | 18 |
| `users` | 1 |
| `orders` | 6 |

The product catalogue contains 49 alternator records and 88 self-motor records. Three records have no price; those must retain a price-on-request flow. Existing non-null prices range from ₹25 to ₹1,400. The existing product IDs span 138–274; all 18 sales rows reference product IDs no longer present in the product table. This confirms historical ID drift already exists. Preserve these records for review; do not guess their intended product mappings or count them as verified product performance. There are no foreign-key constraints in the original schema. There are no stock quantities, product SKU fields, normalized brands or independently verified vehicle compatibility records in the original product schema. The `vehicle` string is inherited catalogue metadata and must not be promoted into a verified fitment guarantee.

A consistent SQLite backup was created using SQLite's backup API at `/workspace/work/aamm-database-before-redesign.db`. Its own integrity check returned `ok`; table counts matched the source. It is deliberately outside the web root and repository. Operators must additionally back up the actual deployed database before deploying migration changes: the checked-in database is not proof of a current production backup.

- Original file SHA-256: `48a2fe89969a819fc497a960ec40b909d311e1ebd3f28179f1174e7c35a618a1`.
- Backup SHA-256: `c2f7bd50ac5b1987b59dd2f6be9fdaa828001e1aef86da6d241df092f91c265f`.

SQLite backup files need not have identical bytes to the source; integrity and record preservation were verified separately. No customer names, phone numbers, addresses, credentials or order payloads are reproduced here.

## Baseline functionality

- Product listing, category/subcategory/vehicle filters, alias-based text search and product detail UI.
- Recently viewed products and shopping cart stored in the browser.
- Existing WhatsApp order-message generation, telephone links and logo.
- Database product creation, sales recording, basic customer records and order records.
- A top-selling API that falls back to a curated selection when sales are absent.

The original pages also contain incomplete destinations, including `profile.html`, and placeholder navigation links. Login and dashboard pages do not provide a complete secure account or administration workflow.

## Critical findings in the original code

| Finding | Evidence and consequence |
| --- | --- |
| Catalogue reset on every startup | `server.js` explicitly runs `DELETE FROM products` and reinserts a fixed list. Admin changes are lost and autoincrement IDs drift, breaking historical product references. |
| Repository root publicly served | `express.static(__dirname)` makes the database and source files downloadable unless explicitly blocked. Database contents include personal information. |
| Authentication is not verification | Ordinary customers can sign in using only a phone number. Admin access depends on hardcoded credentials. Browser-local flags are not authorization. |
| Missing API authorization | Product creation, sale insertion, user reads/updates and order history are not protected by server-side sessions. |
| Client controls order amounts | `/orders` accepts the browser-supplied `total` and items without validating catalogue prices or stock. |
| Unconfirmed enquiries recorded as sales | Order submission creates sales records before business confirmation or verified payment. Historical sales are not reliable verified revenue. |
| Wide-open CORS | The baseline sends `Access-Control-Allow-Origin: *` without a business requirement. |
| Unsupported brand claims | Product detail pages offer hardcoded brands that have no product/brand relationship in the database. |
| Incomplete fulfilment data | No order-status history, payment verification, courier integration or actual stock model exists. |
| Configuration and durability unclear | No Render configuration, persistent disk declaration, backup schedule or service credentials are supplied. SQLite persistence across Render deployments is unverified. |

## Safe architecture and migration plan

1. **Preserve and inspect:** Keep existing product IDs and customer/order records. Back up the actual deployed database while the old service is stopped or using SQLite's backup API. Verify integrity and counts. Do not start the original server against the backup because its startup code reseeds products.
2. **Retain the deployment shape:** Continue using Node/Express/SQLite and existing `.html` routes for this update. Use a restricted public-file allowlist instead of serving the checkout root. No framework migration is necessary for the requested responsive UI and light-mode button.
3. **Use additive schema changes:** Record migration versions and add new fields/tables only when absent. Keep unknown stock, compatibility and payment values explicitly unknown. Seed only an empty new database. Never reset or silently overwrite existing records.
4. **Secure the boundary:** Replace hardcoded admin access with environment-configured credentials, hashed verification and server-side expiring sessions. Protect customer and admin records server-side. Limit request sizes and repeated authentication attempts. Recalculate commerce amounts on the server.
5. **Connect customer workflows:** Make catalogue, search, filters, product detail, cart, wishlist, recently viewed, enquiry and exchange screens use actual records. Treat WhatsApp submission as an enquiry until confirmed by staff. Remember the light/dark preference in browser storage and apply it before rendering.
6. **Gate external integrations:** Customer OTP, Razorpay, AI generation, courier tracking and automated notifications require configured legitimate providers. Do not simulate success. Keep contact/enquiry alternatives available when a provider is absent.
7. **Validate a copy first:** Start the updated app with `DB_PATH` pointing at a copy. Check read APIs, mutation validation, protected admin routes, database/source-file blocking, catalogue stability after restart, enquiry persistence and responsive user interactions. Compare counts after changes.
8. **Deploy with durable storage:** On Render, use a persistent disk and an absolute `DB_PATH`, then copy a verified live database to that disk once. Confirm backups and restart persistence. A source push alone cannot verify storage or external credentials.

## Acceptance limits

This audit establishes the available source, checked-in records and observed public catalogue. It is not a penetration test, an independent business verification, proof that deployed data matches the checked-in database, or a production-readiness certification. The complete brief additionally requests service-backed OTP, verified payments, AI, couriers, notifications and sophisticated inventory/quotation operations; those must be tested with configured providers and real business rules before being described as operational.
