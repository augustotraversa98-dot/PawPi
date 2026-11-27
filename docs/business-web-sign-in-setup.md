# Business sign-in on the website: turning on Apple and Microsoft

The code is ready and both buttons stay hidden until their values exist on Railway (service **PawPi**). Google is
already on. Never paste a secret into chat, a document or the repository.

Do the code first (merge and deploy), then the steps below.

## Apple

Where: <https://developer.apple.com/account> → Certificates, Identifiers & Profiles → Identifiers.

1. Press **+**, choose **Services IDs**, then Continue.
2. Description: `PawPi Web`. Identifier: `info.pawpi.web`. Register.
3. Open it, tick **Sign in with Apple**, press **Configure**:
   - Primary App ID: `com.pawpi.app`
   - Domains and Subdomains: `www.pawpi.info`
   - Return URLs: `https://www.pawpi.info/api/auth/callback/apple`
4. Save, Continue, Save.
5. On Railway add `AUTH_APPLE_WEB_ID` = `info.pawpi.web`.

No new secret is needed: the website signs with the same Apple key the server already has
(`AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY`). If the Apple button does not appear after this,
one of those three is missing. Leave `AUTH_APPLE_ID` as it is: the iPhone app uses it.

## Microsoft

Where: <https://entra.microsoft.com> → Applications → **App registrations**. (If Microsoft says you need a directory
first, create the one it offers.)

1. **New registration**. Name: `PawPi`.
2. Supported account types: **any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Web**, `https://www.pawpi.info/api/auth/callback/microsoft-entra-id`. Register.
4. Copy the **Application (client) ID**.
5. **Token configuration** → Add optional claim → ID → `email`.
6. **Certificates & secrets** → New client secret. Copy the **Value** right away: it is shown once.
7. On Railway add `AUTH_MICROSOFT_ID` (the client ID) and `AUTH_MICROSOFT_SECRET` (the secret value).

The secret expires on the date you pick. Put a reminder to make a new one before then, or Microsoft sign-in stops.

To allow only one company's Microsoft accounts, also set `AUTH_MICROSOFT_ISSUER` to
`https://login.microsoftonline.com/<directory-id>/v2.0` and choose the single-directory account type in step 2.

## Check

1. <https://www.pawpi.info/api/auth/providers> lists `google`, `apple` and `microsoft-entra-id`.
2. On <https://www.pawpi.info/account/signin>, sign in once with each button.
3. With Apple, use the same Apple account as in the iPhone app: you should reach the same PawPi account.

## How accounts match up

- Google and Apple join an existing PawPi account with the same email.
- Microsoft never does, because the administrator of a Microsoft work directory can put any address on their users.
  Someone who already has a PawPi account sees "sign in the way you did the first time".
