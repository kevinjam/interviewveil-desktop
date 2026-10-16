# macOS code signing in CI

## Error: `failed to import keychain certificate`

GitHub Actions tried to import your **Apple `.p12` certificate** and failed. Common causes:

- `APPLE_CERTIFICATE` is not valid base64 of a `.p12` file
- Wrong `APPLE_CERTIFICATE_PASSWORD`
- Placeholder or partial secrets saved in the repo

## Ship to R2 without signing (default)

By default, **Desktop release** builds an **unsigned** macOS `.dmg` so you can upload to R2 and test downloads.

1. Do **not** set repository variable `MACOS_CODE_SIGNING` (or set it to anything other than `true`).
2. You can **delete** all `APPLE_*` secrets until you have a real Developer ID cert — they are ignored unless signing is enabled.

Users will see Gatekeeper “app can’t be opened” until you sign/notarize; they can right‑click → Open for internal testing.

## Enable signing later

1. Create a **Developer ID Application** certificate in Apple Developer, export as `.p12`.
2. Base64-encode the file (no newlines):

   ```bash
   base64 -i YourCert.p12 | pbcopy   # paste into GitHub secret APPLE_CERTIFICATE
   ```

3. Add repository **secrets**: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` (e.g. `Developer ID Application: Your Name (TEAMID)`), `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`.
4. Set repository **variable** `MACOS_CODE_SIGNING` = `true`.
5. Re-run **Desktop release**.
