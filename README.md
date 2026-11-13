# AAMM — Alagar Automobiles

The existing automotive spare-parts application, updated with a responsive dark/light interface, the original AAMM logo and preserved SQLite catalogue. Customer catalogue, cart, enquiries, exchange requests, tracking and account screens connect to the Express backend; a separate protected administration interface manages the business records.

## Run locally

Use Node.js 22 or newer and npm:

```sh
npm ci
cp .env.example .env
node --env-file=.env server.js
```

Open <http://localhost:3000>. No frontend build is required. `npm start` runs the service using environment variables already supplied by your host; it does not automatically load `.env`. Use `npm run dev` for Node's watch mode when your environment is already configured.

Before running against business data, back up the actual deployed database and follow [DEPLOYMENT.md](docs/DEPLOYMENT.md). Set an absolute `DB_PATH` on persistent storage in production. Do not repeatedly copy the repository database over a live database.

Configure `ADMIN_PHONE` and a unique `ADMIN_PASSWORD` of at least 12 characters to enable administrator access at `/admin.html`. Customer phone sign-in requires a configured Twilio Verify account. Optional OpenAI and Razorpay credentials are described in `.env.example`; missing providers are not simulated.

## Check the application

```sh
npm test
npm run test:browser
```

The first command runs backend and provider-contract tests with disposable data. The optional browser suite requires Playwright plus Chromium installed in your development environment. It starts its own test server/database and checks themes, responsive pages and customer workflows, then checks configured OTP/Razorpay UI behavior using explicit provider fixtures rather than real transactions. Set `CHROMIUM_PATH` if needed. Browser tooling is not required by the deployed server.

## Project layout

- `server.js`: Express APIs, server-side authorization, SQLite initialization/migration and application startup.
- `lib/integrations.js`: Twilio Verify, OpenAI and Razorpay provider helpers and verification.
- `*.html`, `style.css`, `script.js`: responsive customer interface and shared UI behavior.
- `admin.html`, `admin.js`: authenticated administration interface.
- `images/logo.jpeg`: original AAMM identity; product photo areas intentionally use placeholders.
- `test/`: automated backend, integration and optional browser checks.
- `docs/`: audit, API contracts, deployment and feature status.

## Documentation and limits

- [Existing application audit and migration plan](docs/AUDIT.md)
- [API contracts](docs/API.md)
- [Installation, persistent storage and deployment](docs/DEPLOYMENT.md)
- [Feature status against the full development brief](docs/FEATURE_STATUS.md)

The light-mode button remembers the visitor's choice in their browser. Catalogue prices and existing records are retained; unknown brands, stock and compatibility are not invented. WhatsApp submissions remain enquiries until the business confirms them.

Real provider transactions, Render deployment settings and production persistence have not been verified. The complete master brief includes additional workflows beyond this source update; their exact status and payment/refund limitations are documented in the feature-status report.
