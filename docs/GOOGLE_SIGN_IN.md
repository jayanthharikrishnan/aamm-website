# Google sign-in for Alagar Automobiles

The website uses Google Identity Services for customer authentication. It needs a real **Web application OAuth client ID** belonging to the business owner's Google Cloud project. An installed Gmail/Drive app or a Render connection does not create that OAuth client.

## One-time Google setup

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview), then create or select your project. Use a production project for the customer-facing website.
2. In **Branding**, use **Alagar Automobiles**, choose a monitored support/developer email, and supply these links:

   | Setting | Value |
   | --- | --- |
   | Homepage | `https://aamm-6rvg.onrender.com/` |
   | Privacy policy | `https://aamm-6rvg.onrender.com/policies.html#privacy` |
   | Optional terms | `https://aamm-6rvg.onrender.com/policies.html#ordering` |
   | Authorized domain, if requested | `aamm-6rvg.onrender.com` |

3. Set the customer audience to **External**. Request only the ordinary identity information needed for login: `openid`, `email`, and `profile`. Do not add Gmail, Drive, contacts, or other API permissions. Follow any branding/domain verification requirements shown in your Console before publishing the customer app.
4. In [Clients](https://console.cloud.google.com/auth/clients), create a **Web application** client. Add this exact **Authorized JavaScript origin**:

   ```text
   https://aamm-6rvg.onrender.com
   ```

   Origins contain the scheme and hostname, without a path or trailing slash. This implementation receives the Google credential through a JavaScript callback and sends it to the backend; it does not require an OAuth redirect URI or a client secret. Do not add an invented redirect endpoint.
5. Copy the real public client ID, which ends in `.apps.googleusercontent.com`, into Render's `GOOGLE_CLIENT_ID` environment setting. Preserve all other service settings. Save the change and wait for the service deployment to finish. Do not commit a credential export, client secret, or Google token to GitHub. This flow does not require a client secret.

Google's current setup and verification instructions are the source of truth: [GIS setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [brand verification](https://developers.google.com/identity/verification/authentication-verification), and [app audience](https://support.google.com/cloud/answer/15549945?hl=en).

## Render domain and Google verification

`onrender.com` is listed in the [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat). The top private domain for this site is therefore `aamm-6rvg.onrender.com`; it is not necessary to claim ownership of all `onrender.com`. Google may ask for Search Console ownership verification of the site and review of the app's displayed name/logo. Follow the actual Console requirement; do not assume that buying a custom domain is required. If Google supplies a verification HTML file or meta token, add only that public verification material to the website through the normal source workflow.

The login's basic identity scopes are separate from sensitive/restricted Google API access. Production branding requirements and Google Workspace administrator policies can still apply. A working development login is not proof that all public production-branding requirements have passed.

## Account and challenge behavior

Customer sign-in uses Google Identity Services' credential callback. The browser first calls `POST /auth/google/challenge`; the backend returns a nonce and creates a five-minute, HttpOnly, SameSite=Lax challenge cookie scoped to `/auth/google`. Production cookies are Secure. The nonce is passed to Google's button configuration. The returned credential is sent to `POST /auth/google` in the request body, never a URL.

The backend atomically consumes the browser-bound challenge before checking the credential, so an invalid attempt also needs a new challenge. Replaying a completed credential or using a credential from another browser challenge cannot create a session. Google's official server library verifies the signature and audience; the application additionally enforces issuer, expiry/issue time, verified email, subject and exact nonce. Only a verified result creates the normal expiring HttpOnly application session.

Each Google subject has its own durable customer ID. Names, email addresses and entered delivery phones never merge it into an existing phone account. Google customers use `/me`, `/my/orders`, `/my/requests`, `/my/bills` and `/notifications`; record ownership follows the customer ID, including order tracking, payment verification and invoice printing. Legacy phone routes remain restricted to verified phone accounts.

A saved `contact_phone` is delivery contact information and stays unverified by Google login. It cannot unlock previous orders, claim another customer's notifications, enable privileged SMS delivery, or grant administrator access. Guest orders submitted before sign-in retain their private receipt-token tracking flow; they are not silently claimed by matching an entered phone or email.

## How to verify activation

- The site reports Google sign-in configured when `GOOGLE_CLIENT_ID` has the expected Web client ID format. This configuration flag does not prove that Google accepts the client or origin; complete the real sign-in checks below.
- Open the customer account page and choose the Google-rendered sign-in button. Google must show this app's correct identity and return a genuine credential.
- Confirm that the customer dashboard opens, survives a normal reload, and signs out correctly.
- Sign in with another Google account and confirm the first customer's orders, invoices, notifications and addresses remain private.
- An entered delivery phone is contact information; Google sign-in does not verify ownership of that number or grant access to pre-existing phone-based accounts.
- Administrator access remains separate. A Google customer matching an owner's name, email or delivery phone must never become an administrator automatically.

Google ID tokens must be checked server-side, including signature, intended audience, issuer and expiry. The Google `sub` identifier is the durable identity; a name, email string or entered phone number is not sufficient to establish ownership. See [Google's backend verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

`node --test test/google-auth.test.js` exercises the real routes on disposable database copies. It generates temporary RS256 keys and overrides only Google's remote certificate lookup inside a child test process; Google's official signature/audience/issuer/time verification still runs. No verifier bypass or alternate certificate service is added to production code.

The suite checks bad signatures/claims, browser binding, expiry, one-use and concurrent nonce attempts, same-email/different-subject isolation, changed-email/same-subject continuity, unverified contact phones, administrator separation, order/request/notification/tracking/invoice/payment boundaries and session revocation. Provider payment calls use explicit local fixtures; the tracked source database must remain byte-identical.

These tests do not establish that a real Google Cloud client exists or that an actual customer completed Google's sign-in UI. Until that live test succeeds, activation remains unverified.
