# AAMM application API

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
| `POST /auth/admin-login` | `{phone,password}`; requires configured administrator values. Returns `{user,isAdmin:true}` and a session cookie. |
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

- `GET /admin/overview`: real product/customer/order/enquiry/exchange counts, known inventory counts, verified captured revenue; no fabricated sales statistics.
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
