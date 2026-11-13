# AAMM installation and deployment

## Local installation

Use a supported Node.js LTS release (Node 22 or 24) and npm. SQLite's native module must install successfully on the target OS.

```sh
npm ci
cp .env.example .env
node --env-file=.env server.js
```

The application does not automatically load `.env`. The example above uses Node's built-in environment-file support. On Render, enter values in the service environment settings instead. `npm start` uses environment variables already supplied to the process.

Open `http://localhost:3000`. No frontend build is required. Keep `NODE_ENV=development` when testing over plain HTTP locally; production secure session cookies require HTTPS.

## Existing data: back up before starting the updated service

The original server deletes and reseeds products on startup. Stop that version before taking the final production backup or starting the replacement. Do not run it against any preserved copy.

A backup of the checked-in database was verified during development; the current Render database must be backed up separately. Prefer SQLite's backup API or the SQLite CLI `.backup` command. Avoid copying an open SQLite database without including its journal/WAL state.

Example, after stopping the old application and replacing the example paths with actual server paths:

```sh
sqlite3 /path/to/current/database.db '.backup /secure-backups/aamm-before-update.db'
sqlite3 /secure-backups/aamm-before-update.db 'PRAGMA integrity_check;'
sqlite3 /secure-backups/aamm-before-update.db 'SELECT COUNT(*) FROM products; SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM orders;'
```

Check for `ok`, retain the record counts, and keep the backup outside the checkout and public assets. Test the new application with a separate restored copy first. Do not overwrite the live database with the repository copy: the live database may contain newer orders or customers.

The updated startup verifies SQLite integrity and creates a consistent `backups/aamm-before-v2-*.db` snapshot before its first v2 migration. This automatic snapshot is a fallback, not a replacement for the verified off-server backup. It then uses additive initialization and migrations. It preserves nonempty product tables and existing identifiers instead of deleting records. Review migrations before release. Keep a verified backup until the upgraded service and restart tests pass. New writes made after release must be reconciled before restoring an older backup.

## Render service configuration

The repository does not include access to the current Render account or its service settings. Its disk attachment, instance plan, environment variables, deploy hooks and production backup history were not verified.

Configure a Node web service with:

| Setting | Value |
| --- | --- |
| Build command | `npm ci` |
| Start command | `npm start` |
| `NODE_ENV` | `production` |
| `DB_PATH` | An absolute filename on an attached persistent disk, e.g. `/var/data/aamm/database.db` |
| `APP_ORIGIN` | Exact HTTPS origin used by customers, e.g. `https://aamm-6rvg.onrender.com` |
| `PORT` | Use the value supplied by Render |

Attach a Render persistent disk at `/var/data` on a plan that supports it. SQLite in the deployment checkout is not durable application storage. Arrange retention and off-server backups of the disk database. If the selected Render plan cannot provide persistent storage, move to a suitable persistent service/database architecture before relying on the application for new business records.

After stopping the old service, restore the verified current database to the persistent disk **once**, verify integrity and counts, then point `DB_PATH` at it. Do not add a startup command that copies the repository database on every deployment. The application must not reset an existing database on start.

When production starts without an absolute `DB_PATH`, the application warns rather than breaking the existing deployment. `/health` reports `persistence_configuration: "not_verified"`; an absolute configured path reports `"explicit_path_configured"`. Neither response proves the volume is durable: verify the actual disk and restart behavior. A missing configured destination may receive the checked-in database only once; restore the latest production backup there first so older repository data cannot become the live source.

SQLite is intended for a single application instance on this persistent volume. Do not horizontally scale separate instances with private SQLite copies. A shared managed database requires a deliberate migration and adapter, not changing only `DB_PATH`.

## Authentication and secrets

Set `ADMIN_PHONE` and a unique `ADMIN_PASSWORD` of at least 12 characters in the deployment secret manager. Do not reuse the old hardcoded password. Admin authentication uses server-side authorization; browser-local flags must never grant admin access.

Customer phone verification needs all three Twilio Verify values in `.env.example`. Configure a legitimate Twilio Verify service and account, then test sending, expiry, invalid codes, resend limits and successful verification against actual devices. With no provider credentials, OTP remains unavailable and must return a configuration error rather than a fake code.

Never commit `.env`, database backups, provider keys or real customer exports. The original database remains in Git history from the existing repository. Blocking its HTTP route prevents current direct web downloads but does not remove historical Git exposure. The business owner should review repository visibility and remove sensitive historical data using an agreed cleanup procedure before treating the repository as a secure data store.

## Optional services and honest readiness

- **WhatsApp:** The inherited click-to-chat number is `919344898473`. Opening a WhatsApp message is an enquiry, not proof of message delivery or order confirmation. Automated WhatsApp Business notifications require a separate approved integration.
- **AI:** `OPENAI_API_KEY` enables the implemented optional assistant provider. Without it, any catalogue-search fallback must identify itself as search. AI must use retrieved catalogue data and must not invent stock, prices or compatibility.
- **Payments:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` configure the implemented server order/signature/capture verification and signed webhook flow. Use test-mode keys first. Payment initiation requires a signed-in owner, a business-confirmed order, known inventory, unchanged catalogue prices and store pickup; delivery fees remain subject to business confirmation. The browser success callback alone cannot mark payment captured: the server retrieves Razorpay's payment and checks the exact order, INR amount and captured state. Inventory/sales update atomically once. Inventory is not reserved during pending payment; changed stock is recorded as `captured_review_required` and needs staff fulfillment/refund review. Full refunds use the actual provider result; asynchronous pending refund finalization still needs reconciliation. Live provider tests and merchant configuration are unverified.
- **Courier:** No live courier credentials were supplied. Internal staff status updates must be labelled as such; do not imply GPS or live courier tracking.
- **Email, SMS and automated WhatsApp notifications:** Provider delivery cannot be claimed without confirmed responses. Keep actual queued/failed statuses.
- **Images and attachments:** Product placeholders are intentional. Keep uploads unavailable until validation, storage and access controls exist. Do not substitute invented product photography.

The full master brief is broader than credentials-free UI development. Treat unresolved integrations and unverified production storage as explicit release limitations.

## Release checks

Run the repository's automated checks and verify these workflows on a database copy before release:

1. Real catalogue/category reads, combined search/filtering and product details.
2. Dark/light toggle, saved preference after reload, mobile layout and keyboard use.
3. Cart, wishlist and recently viewed persistence with missing-image placeholders.
4. Server-side enquiry and exchange validation/persistence, with no fake confirmation.
5. Missing-provider responses, invalid login rejection and protected admin access.
6. Requests for `/database.db`, `/server.js`, `/.env` and Git metadata do not serve files.
7. Restart the app twice and compare original product IDs/counts; verify new enquiries remain.
8. Confirm logs contain no secrets and the service accepts Render's assigned port.

Then deploy the selected commit, inspect the health endpoint and customer/admin workflows, restart once and verify durability on the persistent disk. Source changes do not establish that Render auto-deployment is enabled; inspect the actual Render deploy result. Retain the prior source commit and verified database backup for rollback.

## Guest receipts and customer request privacy

A new WhatsApp order enquiry returns a one-time 256-bit `tracking_token` alongside its reference. The application stores only its SHA-256 hash; keep the returned receipt in the customer's browser. Idempotent retries retain the original secret and do not return it again. `POST /tracking-guest` takes `{reference, token}` in the request body, uses constant-time verification and returns the actual internal status history without customer name, phone, address or WhatsApp message. Possessing only a reference or phone is insufficient. A lost guest token requires verified account access or help from AAMM.

Authenticated `GET /my/requests` returns only the signed-in phone's enquiries/exchanges, statuses and quoted amounts. Internal administrator notes are excluded. Account, receipt, tracking and notification responses use `Cache-Control: no-store`. See [API.md](API.md) for endpoint contracts.
