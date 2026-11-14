# Alagar Automobiles application API

JSON requests and same-origin browser calls are required. Errors return `{ "error": "message" }` with an appropriate HTTP status. Administrator/customer sessions use an HttpOnly, SameSite=Lax cookie, with Secure enabled in production. Personal responses are not cached. Customer credentials, payment secrets, OTPs and administrator passwords are never returned.

## Catalogue and configuration

| Method / path | Behavior |
| --- | --- |
| `GET /health` | Database connectivity plus `persistence_configuration`; explicit paths are configuration, not proof of durable storage. |
| `GET /api/config` | Public business links, provider capability flags and honest integration status. |
| `GET /products` | Array of actual active products. Combine `category`, `subcategory`, `vehicle`, `brand`, `search`/`q`, `min_price`, `max_price`, `availability=in_stock/out_of_stock/unknown` and `sort=price_asc/price_desc/name`. |
| `GET /products/:id` | An actual active product, or 404. |
| `GET /products/categories` | Distinct categories. |
| `GET /products/subcategories?category=...` | Distinct subcategories. |
| `GET /products/vehicles?category=...&subcategory=...` | Existing catalogue vehicle labels, excluding unknown/Various; labels do not imply verified compatibility. |
| `GET /products/brands` | Only explicitly recorded brands. |
| `GET /products/top-selling` | Featured catalogue picks, labelled `featured:true`; historical orphaned sales are not promoted as verified best sellers. |

Product fields preserve the legacy records and add optional `sku`, `brand`, `stock_quantity`, `compatibility_verified`, `updated_at`, `image:null`, `availability` and `compatibility_status`. Search accepts at most one inserted, removed or substituted letter for alphabetic tokens of four or more characters; numeric part numbers and short words do not use fuzzy matching. Unknown stock/prices/fitment remain unknown. No generated photographs or inferred brand/fitment values are supplied.

## Authentication and customer records

| Method / path | Payload or response |
| --- | --- |
| `POST /auth/admin-login` | `{identifier,password}`; accepts the configured administrator ID or phone. Legacy `phone` or `id` fields remain accepted. Requires a strong configured password. Returns `{user,isAdmin:true}` and a session cookie. |
| `POST /auth/admin-otp/request` | `{identifier}`; sends only to the configured administrator phone through real Twilio Verify; 503 until configured. |
| `POST /auth/admin-otp/verify` | `{identifier,code}`; only an approved verification for that exact administrator phone can create an administrator session. Ordinary customer OTP never grants administrator access. |
| `POST /auth/login` or `/auth/otp/request` | `{phone}`; sends a real Twilio Verify code when configured. Returns `{status:'pending',resend_after:60}`; otherwise 503. |
| `POST /auth/otp/verify` | `{phone,code}`; only a valid approved provider verification creates a customer session. |
| `GET /auth/me` | Authenticated `{user,isAdmin}`; 401 otherwise. |
| `POST /auth/logout` | Revokes the server session and clears the cookie. |
| `GET /users/:phone` | Owner/admin only; public profile fields without password. |
| `PUT /users/:phone` | Owner/admin only; `{name,address,delivery_pref,email}`. |
| `GET /my/requests` | Owner's `{enquiries,exchanges}` with statuses/quotations/valuations; excludes internal notes. |
| `GET /notifications` | Owner's recorded in-app notifications; no claims of external delivery. |
| `PATCH /notifications/:id` | Marks the owner's notification read. |

## Enquiries, order receipts and tracking

`POST /enquiries` accepts `{name,phone,part_name,vehicle?,message?}`. `POST /exchange-requests` accepts the same fields and optional `condition`. Both persist records and return 201 `{id,reference,status:'New'}`. Administrator valuation is required; no automatic exchange value is promised.

`POST /orders` accepts `{name,phone,address,delivery,items:[{id,qty}],idempotency_key?}`. Delivery address is required except for pickup/collect. The server checks actual catalogue prices, quantities and any known stock; submitted client totals/prices are ignored. A null price requires a quotation. The resulting record is an **enquiry** until the business confirms it, with no fake payment or sale.

Creation returns 201 `{id,reference,status:'Enquiry submitted',payment_status:'not_requested',total,subtotal,delivery_charges:null,items,whatsapp_url,tracking_token}`. The token is a one-time random 256-bit receipt secret; only its SHA-256 hash is stored. An idempotent retry returns the existing enquiry with 200, without exposing or rotating the original token. Preserve the original browser receipt.

| Method / path | Access and response |
| --- | --- |
| `GET /orders/:phone` | Authenticated owner/admin; actual order history. |
| `POST /tracking` | Authenticated owner/admin `{reference}`; real internal status timeline. |
| `POST /tracking-guest` | `{reference,token}`; rate-limited, constant-time receipt verification. Returns status/payment status/items/timestamps and genuine courier fields when recorded; excludes customer name/phone/address/WhatsApp URL. Missing/incorrect secrets do not expose an order. |

## Administrator operations

All `/admin/*` routes and product writes require the server session's administrator role.

- `GET /admin/overview`: real product/customer/order/enquiry/exchange counts, known inventory counts, received-credit total in `verified_revenue` (provider-captured plus owner-confirmed UPI credits); no fabricated sales statistics.
- `GET /admin/products`, `/admin/orders`, `/admin/enquiries`, `/admin/exchanges`, `/admin/customers`, `/admin/audit`, `/admin/inventory`, `/admin/notifications`: protected business records. Passwords and guest receipt hashes are not returned.
- `POST /products`: `{display_name,category,subcategory?,vehicle?,price?,description?,sku?,brand?,stock_quantity?,compatibility_verified?}`.
- `PUT /products/:id`: partial edits with the same fields; stock changes accept `stock_reason` and record movement history atomically.
- `DELETE /products/:id`: archives the product without deleting historical order references.
- `PATCH /admin/orders/:id`: `{status,courier?,tracking_number?,estimated_delivery?}` records previous/new status, administrator, timestamp and an in-app notification. Unverified refund status changes are rejected.
- `PATCH /admin/enquiries/:id`: `{status,notes?,quotation_amount?}`; New / Reviewed / Quotation Sent / Closed.
- `PATCH /admin/exchanges/:id`: `{status,notes?,valuation?}`; New / Under Review / Inspection Required / Offer Provided / Approved / Exchange Completed / Rejected.

## Provider-backed payment and assistance

`POST /assistant` accepts `{message,history?}` and retrieves actual catalogue rows. Without an AI key it returns explicit `mode:'catalogue_search'`, never simulated AI. With a configured key it uses the actual OpenAI Responses API and retrieved catalogue context, excludes private customer data and preserves unverified-fitment caveats.

`POST /payments/create {reference}` requires an authenticated owner/admin and configured Razorpay account. The order must be business-confirmed, store pickup, with unchanged actual prices and known sufficient inventory. The response contains only the public key ID, provider order ID, paise amount, currency and reference.

`POST /payments/verify {order_id,payment_id,signature}` also accepts Razorpay-prefixed field names. It verifies the payment HMAC, then retrieves the actual provider payment and matches order, INR amount and captured state. Atomic/idempotent capture updates inventory and records sales only after verification. `POST /payments/webhook` verifies the raw-body signature before the same provider capture check. A valid browser callback alone is insufficient.

No inventory reservation exists while payment is pending. If stock changes before capture, the persisted `captured_review_required` state notifies the customer and requires business fulfillment/refund review instead of overstating available inventory. `POST /admin/payments/:id/refund` requests a full genuine provider refund and records actual pending/processed status; asynchronous pending refunds still need reconciliation. Test-mode and live merchant verification remain deployment requirements.


## Administrator setup and nonsecret account configuration

The owner-confirmed ID/mobile `9344898473` is recorded in server-only `config/business.json`. `ADMIN_ID` and `ADMIN_PHONE` environment values override that nonsecret identity. The file contains no password, OTP credential, token or session secret. It grants no access by itself. Set a unique `ADMIN_PASSWORD` of at least 12 characters, or configure legitimate Twilio Verify for the authorized phone.

`GET /api/config` includes only `admin.password_configured` and `admin.otp_configured` booleans. `GET /admin/setup` requires the administrator session and reports booleans, missing environment-variable **names**, commercial-billing capability and unverified storage status. It never returns secret values.

## Automatic commercial invoices and verified receipts

`PATCH /admin/orders/:id` with `status:'Order Confirmed'` atomically reviews totals and creates one immutable commercial invoice. Pickup charges are known zero; delivery orders require explicit non-negative `delivery_charges`. The response includes `{ok:true,invoice}`. Invoice and receipt numbers are unique sequential values such as `AA-INV-2026-000001`, with separate annual counters. Numbering and the document snapshot are committed in the same database transaction. Issued documents have database triggers rejecting edits/deletion; later catalogue prices cannot change them. Changes to billed delivery charges are rejected. No GST rate, GST amount or tax-credit entitlement is invented; documents state **Not a GST tax invoice**.

| Method / path | Behavior |
| --- | --- |
| `GET /admin/bills` | Protected list of document metadata. |
| `POST /admin/orders/:id/invoice` | Creates an invoice for an already confirmed/reviewed order, or returns the existing invoice. 201 new / 200 existing; 409 before confirmation or if reviewed totals are incomplete. |
| `GET /my/bills` | Signed-in customer's own invoice/receipt metadata. |
| `GET /bills/:id/print` | Owner/admin-only escaped printable HTML with English/Tamil controls; no public static document file. |
| `POST /billing/guest` | `{reference,token,type:'invoice'|'receipt'}`; same constant-time receipt-secret verification as tracking, rate-limited, no-store. Returns printable HTML only for that order's already issued document. |

Guest tracking includes a `bills` metadata list without billing names, addresses, phone or snapshot contents. A verified receipt secret is required to retrieve the private printable bill. Tokens remain in POST bodies, never URL parameters. A missing/unconfirmed payment has no receipt. Actual Razorpay capture verification automatically creates an immutable provider-labelled receipt alongside payment/inventory bookkeeping. The separate direct-UPI confirmation route can issue an owner-confirmed bank-credit receipt. A browser callback, submitted reference or ordinary order-status edit cannot create a paid receipt. A later refund is recorded separately and does not rewrite the original receipt.

## Optional transactional SMS outbox

Twilio Verify OTP and transactional message sending have separate configuration. SMS notifications require `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, plus `TWILIO_MESSAGING_SERVICE_SID` **or** `TWILIO_FROM_NUMBER`. Without a sender, only the actual in-app notification is recorded.

When configured, application events enqueue a persistent SMS outbox entry in the same transaction as the in-app notification. A worker submits genuine Twilio Messages requests and stores the actual provider SID/status. `queued`, `sent` and `delivered` remain distinct; delivery is never inferred from request creation. Interrupted sends without a provider reference become `delivery_unknown` and are not automatically resent, avoiding duplicate claims/messages.

`GET /admin/sms` lists delivery logs without provider credentials. `POST /admin/sms/:id/refresh` retrieves the exact stored message from Twilio and updates only its genuine reported status. No live SMS test or provider activation has been established without account credentials.

New references use `AA-`. Existing database references remain unchanged; an `AA-` display alias can resolve an old `AAMM-` record only if no exact current reference exists. Receipts, invoices and outgoing message branding display Alagar Automobiles.

Transactional SMS is restricted to customer phones verified by the legitimate OTP provider. Unauthenticated guest form submissions do not enqueue SMS; they retain the in-app record and private guest receipt. Staff-confirmed order/invoice updates and verified-payment updates can enqueue SMS for a verified customer once the sender is configured. This avoids sending paid messages to arbitrary numbers submitted through public forms.

## Google customer identity (schema v4)

- `POST /auth/google/challenge` issues `{nonce, expires_in:300}` with a private HttpOnly SameSite challenge cookie. `POST /auth/google` accepts `{credential}` and consumes that browser-bound challenge before verifying the official Google ID token. A real Web client ID is required in `GOOGLE_CLIENT_ID`; no client secret is used.
- `GET /auth/me` retains `{user,isAdmin}`. `GET /me` / `PUT /me` operate on the authenticated profile. A Google customer has no verified phone identity; `contact_phone` is editable delivery contact only, and the verified Google email is read-only.
- `GET /my/orders`, `/my/requests`, `/my/bills` and `/notifications` enforce stable customer ownership. Owned tracking, bill printing and payments use the same authorization. Legacy phone routes require an actually phone-verified session or an administrator. An entered phone/email never merges accounts.
- Original data and IDs remain intact; v4 uses additive identity/ownership columns and expiring one-use challenge records.

## Direct UPI for this shop

Direct UPI is a manual bank-credit workflow, separate from Razorpay. `UPI_ID` and optional `UPI_PAYEE_NAME` come from host environment settings; the receiving VPA is not hardcoded. Public `direct_upi` configuration reports `configured`, `payee_name`, `contact_phone` and `confirmation:"owner_bank_check"`; configuration checks VPA format and does not verify it with a bank. An entered phone number is contact information, not a payment address or an ownership credential.

| Method / path | Authorization and behavior |
| --- | --- |
| `POST /payments/upi/details` | `{reference,token?}`. Requires the signed-in order owner, an administrator, or the order's private guest token. Creates/reuses a `manual_pending` intent from the confirmed immutable invoice and known stock. Returns the exact amount, payee, UPI intent and QR; no stock/sales/receipt is created. |
| `POST /payments/upi/submit` | `{reference,token?,transaction_reference}` with a 12-digit UPI reference. Same ownership checks. Records `manual_submitted` for staff review; no stock deduction, sale or paid receipt is created from this assertion. |
| `POST /admin/orders/:id/upi/confirm` | Administrator only: `{transaction_reference,amount,received:true}`. `amount` is an integer in **paise**, matched to the immutable invoice. `received:true` attests that the owner checked actual credit in the receiving bank account. A browser reference alone is insufficient. |
| `POST /admin/orders/:id/upi/reject` | Administrator only: `{reason}` rejects a pending submission with an auditable reason. It is not a refund or reversal of a bank transfer. |

Details return `{reference,amount,currency,payment_status,claim,upi_id,payee_name,upi_uri,qr_data_url}`. `amount` is integer paise; the UPI URI formats it in rupees. `claim.status` uses `pending`, `submitted`, `rejected`, `verified` or `verified_review_required`; order `payment_status` prefixes these with `manual_`. The QR is generated locally and contains the payment intent, never the guest token. Private payment responses use `Cache-Control: no-store`.

Creating a direct-UPI intent selects that method for the order; an existing provider attempt prevents switching to UPI, and an existing manual intent prevents opening Razorpay. A new order or staff reconciliation is needed when changing methods. Unconfirmed reference claims are not proof of receipt; a **confirmed** reference is globally unique across direct-UPI orders.

Confirmation records the owner, timestamp and unique transaction reference and atomically updates payment, stock/sales and the accurately labelled receipt. A repeated confirmation is idempotent. If inventory changed after payment, `manual_verified_review_required` preserves the confirmed credit for staff fulfillment/refund review instead of deducting unavailable stock; ordinary confirmation uses `manual_verified`.

Manual receipts identify **owner-confirmed bank credit**, never provider/API verification. The application does not poll the bank or infer success from an app-open callback, screenshot or customer-supplied reference. A Razorpay refund endpoint cannot refund a direct UPI transfer. Any bank refund must be handled through the actual bank/payment app and reconciled separately. Provider and manual routes must not create a second paid receipt, sale or stock deduction for one order.
