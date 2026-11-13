# AAMM 2.0 feature status

This document compares the implementation in this repository with the owner's 30-section master brief. It describes source behavior and development checks, not a claim that every acceptance criterion or external service is production-verified. The GitHub update preserves the existing Node/Express/SQLite application, logo and catalogue and adds the redesigned customer experience, including the requested light-mode button.

## Implemented application behavior

- Responsive dark and light themes, persistent theme/language choice, mobile navigation, the original AAMM logo, and neutral product-image placeholders.
- Actual product reads, combined search and filters, typo tolerance, sorting, pagination, product detail pages, category counts and recorded brands only. Missing prices, stock, brands and compatibility stay unknown.
- Browser-persistent cart, wishlist, recently viewed parts and a saved vehicle reference. Catalogue vehicle filtering does not claim manufacturer/model/year fitment verification.
- Persistent cart order enquiries, spare-part enquiries, old-part exchange requests and contact enquiries, with server validation and real references. WhatsApp opens a prepared enquiry; it does not confirm a sale or prove delivery of a message.
- Private guest tracking using an order reference plus a randomly issued receipt token; signed-in customers can see their own profile, orders, requests, quotations, exchange valuations and in-app notifications.
- Configurable real Twilio Verify sign-in, separate administrator authentication, server-stored expiring sessions, owner/admin access checks, request limits, restricted static file access and audit records.
- A working administrator interface for products, recorded brand/category fields, inventory and stock movements, orders and internal status updates, customers, enquiry quotations, exchange valuations, notifications, activity logs and provider configuration status.
- Real optional OpenAI assistance grounded in retrieved catalogue rows. With no AI key, the same interface explicitly identifies its response as catalogue search.
- Optional Razorpay order creation, browser checkout, backend signature and captured-payment verification, signed webhooks, idempotent stock/sales updates and a protected full-refund API. These require merchant credentials and the eligibility checks described below.
- Additive SQLite initialization/migration, an automatic pre-v2 backup, integrity checks and preservation of the supplied database and existing identifiers. Local tests use disposable copies.

## Comparison with the master brief

| Brief sections | Current implementation and remaining scope |
| --- | --- |
| 1. Project overview and initial inspection | Original source, live homepage/public catalogue and supplied SQLite records were inspected. Findings and preservation evidence are in [AUDIT.md](AUDIT.md). Render account settings were unavailable. |
| 2. Primary objectives | The application connects customer catalogue/enquiry/account screens to backend APIs and a central admin interface. The credential-dependent and advanced limitations below remain; this is not blanket completion of all 28 objectives. |
| 3. Brand and design system | Original logo, premium dark styling and persistent light-mode toggle are implemented. Product imagery remains neutral and uploads are disabled. |
| 4. Homepage and navigation | Real catalogue/category counts, featured products, recently viewed parts, about/contact content, working destinations and inherited business links are present. No fabricated ratings, sales claims, addresses or social accounts. Google Maps opens the owner-supplied location link; no verified address/embed data was supplied. |
| 5. Catalogue and search | Product fields, SKU/recorded brands, combined category/type/vehicle/price/availability filters, typo-tolerant search, search history, pagination, detail pages, cart and wishlist are implemented. Categories/subcategories/brands are editable product fields, not separate normalized management entities. |
| 6. Vehicle compatibility | Vehicle-reference filtering and browser-local saved vehicle are implemented. Admin can explicitly mark a product's recorded fitment verified. There are no normalized manufacturer/model/variant/year associations, multiple fitment records per product or bulk compatibility imports. A year entered in the finder is an enquiry reference, not a compatibility filter. |
| 7. Customer authentication/profile | Real configurable Twilio Verify flow, cooldown, request limits, sessions, logout and editable profile are implemented. Each profile has one address and delivery preference; no multi-address book, account deletion interface or multi-admin provisioning. Customer OTP has not been tested with a live provider account. |
| 8. Cart and checkout | Persistent cart and server-calculated product amounts/known-stock checks are implemented. Submission creates an enquiry pending business confirmation and delivery costs. Eligible business-confirmed pickup orders can be paid from the signed-in dashboard when configured. |
| 9. Payments | Razorpay API and checkout integration verify signatures and actual provider captured state before recording a sale. Signed webhooks and full-refund API are implemented. Live/test merchant transactions were not run; delivery-fee checkout, reservations and asynchronous pending-refund reconciliation remain limited. |
| 10. WhatsApp ordering | Prepared order-enquiry messages use server-validated items/prices and the inherited number. Idempotency prevents duplicate records on a retried submission. Opening WhatsApp does not verify that the message was sent or accepted. |
| 11. Tracking | Guest secret-token and authenticated-owner tracking show actual internal status history; admin can record courier/tracking/date fields. No live courier API, location feed, GPS or invented ETA. |
| 12. Admin dashboard | Protected product create/edit/archive, inventory/history, order status, customers, enquiries, valuations, notifications and activity logs work against SQLite. Overview uses actual counts and captured payments. It does not include the complete chart/report/export analytics suite or granular configurable permission roles. |
| 13. AI assistant | Configured OpenAI Responses integration uses retrieved catalogue context; missing credentials use labelled catalogue search. No AI access to private customer/order data, image identification, or authenticated AI order lookup. Use the secure account/tracking screens for order information. Provider responses have not been live-verified. |
| 14. English/Tamil | Customer navigation and major customer-facing content support saved English/Tamil selection. Original catalogue names, provider/server errors, several status/option labels and the administration interface remain English; this is not complete professional localization of every string. |
| 15. Spare-part requests | Persistent requests, references, admin review/status/notes and quoted amounts, plus authenticated customer visibility and in-app updates are implemented. Customer quote acceptance and automatic quotation-to-order conversion are not implemented. |
| 16. Old-parts exchange | Persistent request, condition details, staff review/status/notes/valuation, customer visibility and in-app updates are implemented. Valuation is manual. Photograph uploads and completed exchange accounting are outside the current workflow. |
| 17. Notifications | Actual in-app records, timestamps, references and read/unread handling are implemented and visible in account/admin screens. No provider-backed email/SMS/WhatsApp notifications, channel preferences, external delivery logs or automatic delivery retries. OTP SMS is a separate authentication service. |
| 18. Central business modules | Inventory, orders, enquiries, exchange requests, customers, notifications and activity logs share the same backend/admin interface. No full enquiry-conversion analytics or normalized vehicle hierarchy module. |
| 19. Motion/interactions | Lightweight hover, theme, navigation, form feedback, assistant and loading states are implemented with reduced-motion support. Complex animation sequences are not a separate business requirement. |
| 20. Responsive design | Customer and admin layouts are responsive. Browser checks cover desktop and 390px mobile layouts in both themes; this is not a claim of testing every physical Android/iPhone model. |
| 21. Backend/database | Express/SQLite retained, original IDs/data preserved, additive v2 schema/indexes, pre-migration snapshot and transaction handling implemented. Schema/migration logic lives in `server.js`; there is no separate general migration CLI or recurring off-server backup service. |
| 22. Security | Server role/ownership checks, opaque hashed sessions, secure production cookies, same-origin mutation checks, validation, parameterized SQL, rate limits, restricted static routes and payment verification implemented. No external penetration test or enterprise access-control system. Historical database exposure in Git history requires owner review. |
| 23. Performance/SEO | Buildless pages, semantic structure, page titles/descriptions, basic social metadata, robots.txt, sitemap.xml, responsive layouts and indexed backend lookups are present. No structured product schema, measured SEO campaign or comprehensive performance benchmark. |
| 24. Testing | Backend/integration tests and an optional browser suite cover real application behavior with copied databases; see the commands below. Real external SMS/payment/AI/courier transactions and Render durability were not verified. |
| 25. Deployment | Existing `npm start` deployment shape and Render-supplied port are supported; health and configuration status are exposed. Persistent disk, actual Render deployment, restart durability, production credentials and off-server backups require verification in the Render account. |
| 26. External services | Configuration template and actual Twilio/OpenAI/Razorpay integration code are present. Courier, messaging providers and image storage are not configured or simulated. |
| 27. Phased execution | Audit/planning, implementation and development verification artifacts are included. Source updates do not by themselves prove the production-deployment phase passed. |
| 28. Non-negotiable rules | Catalogue/identity preserved, original DB unchanged during development, placeholders used, no fake payment/tracking/fitment claims, and unavailable services are explicit. Remaining master-brief features are recorded here rather than represented as completed. |
| 29. Deliverables | Updated source, inline schema/migrations, environment template, audit, API documentation, deployment instructions, feature-status report and reproducible test entry points are included. The verified development backup is outside the web root; a current production backup must be made separately. |
| 30. Acceptance criteria | Core source workflows have development checks. Full acceptance still depends on business data completion, provider testing, remaining workflows and verified persistent production deployment. |

## Payment limits that affect operation

Online payment initiation requires configured Razorpay credentials, a signed-in owner/admin, a business-confirmed order, store pickup, known sufficient inventory and unchanged catalogue prices. Unconfirmed delivery costs are never silently treated as free delivery.

Inventory is not reserved while payment is pending. If availability changes before capture is verified, the application records `captured_review_required`, notifies the customer and requires staff to arrange fulfilment or a verified refund. It does not deduct nonexistent stock. Refund requests use the genuine provider response; a provider-pending refund remains pending until separately reconciled. The implementation has no automatic pending-refund completion job.

These paths require real merchant testing, including interrupted checkout, duplicate callbacks, webhook retries, capture failure, changed stock and refunds, before live use.

## Business information and legal content

The business has not supplied approved privacy, returns, warranty or contractual terms. `policies.html` explains the implemented enquiry/storage behavior and directs customers to confirm applicable terms with AAMM; it must not be treated as a reviewed commercial legal policy. Street address, opening hours, delivery guarantees, certifications and social account ownership remain unverified. The site does not invent them.

## Development verification evidence

Checks reported during this update on 13 November 2026:

| Check | Observed result and scope |
| --- | --- |
| Backend/provider tests | 24/24 passed using disposable database copies and provider-contract fixtures. |
| Customer browser suite | 13/13 groups passed, including 16 pages at 1440px desktop and 390px mobile widths in dark and light themes; no page JavaScript errors or horizontal overflow. Covers theme persistence, Tamil selection, combined filters/pagination, product links, wishlist/cart, actual enquiry submissions, private guest tracking, saved vehicle and internal links. |
| Configured OTP/payment UI | Passed with explicitly intercepted API/provider fixtures. Covers invalid/approved codes, resend cooldown, profile/notification actions, Razorpay create/verify/failure/dismiss callbacks and signout. These are UI behavior checks, not live SMS or payment transactions. |
| Admin browser checks | Passed against a real local backend and copied database: secure login, product create/edit/archive, inventory/history, enquiry quotation, exchange valuation, configuration/activity views, mobile layout and logout. |
| Original database preservation | Original SHA-256 remained `48a2fe89969a819fc497a960ec40b909d311e1ebd3f28179f1174e7c35a618a1`; integrity remained `ok`. |
| Production/providers | Render configuration/deployment/durability and live OTP/Razorpay/OpenAI calls were not verified; owner credentials were not supplied. |

## Reproducing checks

```sh
npm ci
npm test
npm run test:browser
```

`npm test` uses Node's built-in runner and disposable database copies. `npm run test:browser` runs both `frontend-browser.cjs` and the explicitly mocked configured-provider UI suite, `account-provider-ui.cjs`. The optional browser suite requires Playwright and Chromium installed in the development environment; neither is a production dependency. `CHROMIUM_PATH` may select an existing executable and `AAMM_ARTIFACT_DIR` selects screenshot output. See the test files for their assertions and [DEPLOYMENT.md](DEPLOYMENT.md) for release checks. Provider mocks verify protocol/validation behavior, not live provider readiness.
