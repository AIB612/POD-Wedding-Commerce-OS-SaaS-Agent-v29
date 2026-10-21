# Quick login — "Continue with Google" and "Continue with Shop"

Passwordless sign-in with no registration form. The first successful sign-in creates the customer account
(`customer_accounts`, linked to the CRM `customers` row), and later sign-ins with the same Google `sub`, Shop customer id or e-mail
reuse that account. Both flows are server-side OAuth 2.0 authorization-code flows with **state + nonce + PKCE (S256)**.
The server verifies the ID token (signature against the provider JWKS, `iss`, `aud`, `exp`, `nonce`) and then sets the
`pod_session` cookie (HttpOnly, SameSite=Lax, Secure in production / on an https `PUBLIC_BASE_URL`, 30 days).

If a provider's keys are missing, `/api/auth/providers` reports `configured:false`, the button renders disabled with a
"not configured" tag, and `/api/auth/<provider>/start` answers `503 not_configured` (JSON) or redirects to `/?login_error=not_configured`. Nothing crashes.

## Endpoints

| Route | Purpose |
|---|---|
| `GET /api/auth/providers` | `{ google:{configured}, shop:{configured} }` |
| `GET /api/auth/google/start?return_to=/path` | Redirect to Google (sets the signed, 10-min `pod_oauth` state cookie, path `/api/auth`) |
| `GET /api/auth/google/callback` | Google redirect URI |
| `GET /api/auth/shop/start?return_to=/path` | Redirect to Shopify customer login (Shop / e-mail code) |
| `GET /api/auth/shop/callback` | Shopify callback URI |
| `GET /api/auth/me` | Current user (`id, email, name, avatar_url, providers`) |
| `GET /api/account/profile` | E-mail, name, saved shipping address (checkout prefill, own data only) |
| `POST /api/auth/logout` | Ends the session server-side; cross-site `Origin` / `Sec-Fetch-Site` is rejected (CSRF) |

`return_to` only accepts same-site relative paths (`/…`); anything else falls back to `/`.

## Environment

```
PUBLIC_BASE_URL=https://www.example.com        # used to build the default callback URLs
SESSION_SECRET=<openssl rand -hex 32>           # required in production; signs the OAuth state cookie
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=…
GOOGLE_REDIRECT_URI=                            # optional override
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID=…
SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET=         # only for a Confidential client
SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI=          # optional override
```

In development without `SESSION_SECRET` a random per-process secret is used (pending sign-ins are lost on restart).

## 1. Google (Google Cloud console)

1. https://console.cloud.google.com → select/create a project.
2. **Google Auth Platform → Branding** (formerly "OAuth consent screen"): app name, support e-mail, logo, home page,
   privacy policy and terms URLs, **Authorized domains**: your production domain (e.g. `example.com`).
3. **Audience**: User type **External**. While "Testing", only listed test users can sign in — click **Publish app**
   for production. Scopes used: `openid`, `email`, `profile` (non-sensitive, no verification review needed).
4. **Clients → Create client → Application type: Web application**.
   - **Authorized JavaScript origins**: `http://localhost:3000`, `https://www.example.com`
   - **Authorized redirect URIs** (exact match, no trailing slash):
     - `http://localhost:3000/api/auth/google/callback`
     - `https://www.example.com/api/auth/google/callback`
5. Copy **Client ID** → `GOOGLE_CLIENT_ID`, **Client secret** → `GOOGLE_CLIENT_SECRET`.
6. Set `PUBLIC_BASE_URL` to the same origin you registered (it builds the redirect URI), restart, and the button is enabled.

## 2. Shop (Shopify Customer Account API, headless)

Our storefront is not hosted by Shopify, so we use the **Headless** sales channel's Customer Account API (OAuth 2.0 / OIDC).
Shopify's hosted login page offers **Sign in with Shop** plus the e-mail one-time code; the shop's customers are created
automatically on first login. Endpoints are discovered at runtime from
`https://SHOPIFY_SHOP_DOMAIN/.well-known/openid-configuration` and `/.well-known/customer-account-api`.

1. Shopify admin → **Settings → Customer accounts**: choose **Customer accounts** (the new, passwordless accounts — not "legacy").
   Shop sign-in is shown on that login page (Settings → Customer accounts → sign-in methods, where available).
2. Install the **Headless** sales channel (Shopify App Store → "Headless"), **Create storefront**.
3. In the storefront → **Customer Account API → Manage / Settings**:
   - **Client type**: *Confidential* (recommended for this Express back-end; copy the secret) or *Public* (PKCE only). We send PKCE in both cases.
   - **Credentials**: copy **Client ID** → `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID` (and secret → `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET` for Confidential).
   - **Permissions**: customer data read access (name, e-mail, addresses; orders optional).
   - **Application setup → Callback URI(s)**: `https://www.example.com/api/auth/shop/callback`
     (and your dev tunnel, e.g. `https://<id>.ngrok-free.app/api/auth/shop/callback`).
   - **JavaScript origin(s)**: `https://www.example.com` (and the tunnel origin).
   - **Logout URI** (optional): `https://www.example.com/`.
4. `SHOPIFY_SHOP_DOMAIN`: `your-store.myshopify.com` (or the shop's primary domain).
5. **Local development**: Shopify rejects `http://` and `localhost` callbacks. Run a tunnel (`ngrok http 3000`), set
   `PUBLIC_BASE_URL=https://<id>.ngrok-free.app`, and register that callback/origin above. Google can keep using localhost.

Scopes requested: `openid email customer-account-api:full`. After the token exchange we read the customer's name and
default address from the Customer Account API GraphQL endpoint (header `Authorization: <access token>`) to prefill checkout.

## Front-end

* `account-auth.js` (shared, served from the static allowlist) mounts the account icon next to the cart in the homepage,
  studio and checkout headers, renders the sign-in modal and the signed-in menu (avatar/initial → My orders, Sign out).
  Strings are `auth.*` / `co.*` keys in `i18n.js` (en/de/zh).
* Checkout step 1 shows **Sign in for faster checkout** with both buttons above the guest form; when signed in it shows
  "Signed in as …" and prefills e-mail/name/address (empty fields only). Guest checkout is unchanged.
* The previous e-mail-code/password endpoints remain on the server for API compatibility but the UI no longer shows a registration form.

## Tests

`npm run test:auth` — not-configured behaviour, state/nonce/PKCE generation, rejected callbacks (missing / wrong /
tampered / expired / cross-provider state), real RS256 ID-token checks against a mocked JWKS (bad nonce, audience,
issuer, expiry, signature), account auto-creation, session cookie flags, Shop profile prefill, CSRF-protected logout.
