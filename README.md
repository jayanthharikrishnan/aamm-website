# Alagar Automobiles

The existing automotive spare-parts application, updated with a simple responsive interface, light mode by default, an optional dark theme, the original logo symbol and preserved SQLite catalogue. The sticky Tamil switch stays visible on narrow screens. Customer catalogue, cart, enquiries, exchange requests, tracking and account screens connect to the Express backend; a separate protected administration interface manages the business records.

## Run locally

Use Node.js 22 or newer and npm:

```sh
npm ci
cp .env.example .env
node --env-file=.env server.js
```

Open <http://localhost:3000>. No frontend build is required. `npm start` runs the service using environment variables already supplied by your host; it does not automatically load `.env`. Use `npm run dev` for Node's watch mode when your environment is already configured.

Before running against business data, back up the actual deployed database and follow [DEPLOYMENT.md](docs/DEPLOYMENT.md). Set an absolute `DB_PATH` on persistent storage in production. Do not repeatedly copy the repository database over a live database.

The owner-selected administrator ID is `9344898473`. Set a unique `ADMIN_PASSWORD` of at least 12 characters in the host secret settings to enable password access at `/admin.html`; an ID alone grants no access. Real administrator OTP additionally requires the configured owner phone and Twilio Verify. Customer Google sign-in requires a Web application OAuth client ID in `GOOGLE_CLIENT_ID`; see [Google setup](docs/GOOGLE_SIGN_IN.md). Optional phone sign-in requires a configured Twilio Verify account. Confirmation creates an immutable customer commercial invoice; a verified captured payment creates its receipt. Optional transactional SMS uses a separate configured sender/outbox and provider-reported delivery status. Optional OpenAI and Razorpay credentials are described in `.env.example`; missing providers are not simulated.

## Check the application

```sh
npm test
npm run test:browser
```

The first command runs backend and provider-contract tests with disposable data. The optional browser suite requires Playwright plus Chromium installed in your development environment. It starts its own test server/database and checks themes, responsive pages and customer workflows, then checks configured OTP/Razorpay UI behavior using explicit provider fixtures rather than real transactions, and the component guide interactions. Set `CHROMIUM_PATH` if needed. Browser tooling is not required by the deployed server.

## Project layout

- `server.js`: Express APIs, server-side authorization, SQLite initialization/migration and application startup.
- `lib/integrations.js`: Twilio Verify, OpenAI and Razorpay provider helpers and verification.
- `*.html`, `style.css`, `script.js`: responsive customer interface and shared UI behavior.
- `admin.html`, `admin.js`: authenticated administration interface.
- `images/logo.jpeg`: original logo symbol, inverted in light mode; product photo areas intentionally use placeholders.
- `part-location.js`, `part-location.css`: optional educational component-location guides with reduced-motion support (94 catalogue records mapped; 43 ask for confirmation).
- `lib/billing.js`, `lib/billing-store.js`, `lib/sms.js`: immutable commercial invoices/verified payment receipts and provider-backed transactional SMS.
- `test/`: automated backend, integration and optional browser checks.
- `docs/`: audit, API contracts, deployment and feature status.

## Documentation and limits

- [Four owner setup steps](docs/NEXT_STEPS.md)
- [Existing application audit and migration plan](docs/AUDIT.md)
- [API contracts](docs/API.md)
- [Installation, persistent storage and deployment](docs/DEPLOYMENT.md)
- [Feature status against the full development brief](docs/FEATURE_STATUS.md)

The light/dark button remembers the visitor's choice in their browser. Catalogue prices and existing records are retained; unknown brands, stock and compatibility are not invented. WhatsApp submissions remain enquiries until the business confirms them.

Render is connected and the existing main-branch service was verified. Its current free plan has no persistent disk; owner ID/origin settings are configured, while provider secrets and durable storage still require setup. Real provider transactions and production persistence have not been verified. The complete master brief includes additional workflows beyond this source update; their exact status and payment/refund limitations are documented in the feature-status report.

Customer accounts use stable server-side user IDs. Entering a delivery phone does not verify or merge a phone account. Buy now checks out the selected part and quantity while preserving the saved cart.
