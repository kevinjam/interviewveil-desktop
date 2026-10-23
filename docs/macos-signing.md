# macOS code signing & notarization

## Website download vs Mac App Store

InterviewVeil is distributed like TechScreen: **`.dmg` from your site / CDN**, not the Mac App Store.

| | What you need | What you skip |
|---|----------------|---------------|
| **Direct download** (R2, GitHub Release) | Apple **Developer Program** ($99/yr), **Developer ID Application** cert, **notarization** | App Store Connect listing, review, Mac App Store certificates |
| **Mac App Store** | Different cert (“Mac App Distribution”), sandbox, review | Not used for this project |

**Notarization** is Apple scanning your signed app so Gatekeeper trusts downloads—it is **not** publishing to the App Store.

---

## Step-by-step setup (first time)

Do this on your Mac with your Apple ID.

### 1. Join the Apple Developer Program

1. Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll).
2. Sign in with your **Apple ID** (personal or company).
3. Pay **$99/year** and complete enrollment (can take hours to a day for approval).

### 2. Note your Team ID

1. [developer.apple.com/account](https://developer.apple.com/account) → **Membership details**.
2. Copy **Team ID** (10 characters, e.g. `AB12CD34EF`) → GitHub secret **`APPLE_TEAM_ID`**.

### 3. Create a Developer ID Application certificate

1. **Certificates, Identifiers & Profiles** → **Certificates** → **+**.
2. Under **Software**, choose **Developer ID Application** (not “Apple Development”, not “Mac App Distribution”).
3. Follow the flow to create a **Certificate Signing Request (CSR)** on your Mac:
   - **Keychain Access** → menu **Keychain Access** → **Certificate Assistant** → **Request a Certificate From a Certificate Authority…**
   - Email: your Apple ID email, Common Name: e.g. `InterviewVeil Signing`, **Saved to disk**.
4. Upload the `.certSigningRequest` to Apple, download the `.cer`, double‑click to install in Keychain.

Verify:

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

Copy the full quoted name → GitHub secret **`APPLE_SIGNING_IDENTITY`**  
Example: `Developer ID Application: Kevin Jam (AB12CD34EF)`

### 4. Export a `.p12` for GitHub Actions

1. **Keychain Access** → **My Certificates**.
2. Expand **Developer ID Application: …** and select **both** the certificate **and** its private key.
3. Right‑click → **Export 2 items…** → format **Personal Information Exchange (.p12)**.
4. Set an export password (remember it) → GitHub secret **`APPLE_CERTIFICATE_PASSWORD`**.

Base64 for CI (no line breaks):

```bash
base64 -i ~/Desktop/DeveloperID.p12 | tr -d '\n' | pbcopy
```

Paste into GitHub secret **`APPLE_CERTIFICATE`**.

**Test the `.p12` locally (no base64 file needed)** — use the file you exported from Keychain:

```bash
# Replace with the path and password you chose when exporting .p12
security import ~/Desktop/DeveloperID.p12 -P 'YOUR_P12_PASSWORD' -T /usr/bin/codesign

security find-identity -v -p codesigning | grep "Developer ID Application"
```

If import succeeds, you see your **Developer ID Application** identity. That’s what CI needs.

**Optional — verify the GitHub secret encoding** (only if you already copied base64 into a file):

```bash
base64 -d -i apple-cert.b64 -o /tmp/from-b64.p12
security import /tmp/from-b64.p12 -P 'YOUR_P12_PASSWORD' -T /usr/bin/codesign
```

To create that file from your `.p12` before pushing to GitHub:

```bash
base64 -i ~/Desktop/DeveloperID.p12 | tr -d '\n' > apple-cert.b64
# decode test (above), then pbcopy for the secret:
base64 -i ~/Desktop/DeveloperID.p12 | tr -d '\n' | pbcopy
```

### 5. App-specific password (notarization only)

Apple ID login for notarization must use an **app-specific password**, not your normal password.

1. [appleid.apple.com](https://appleid.apple.com) → **Sign-In and Security** → **App-Specific Passwords**.
2. Generate one (e.g. label `InterviewVeil CI`) → GitHub secret **`APPLE_PASSWORD`**.
3. Your Apple ID email → **`APPLE_ID`**.

### 6. Configure `interviewveil-desktop` on GitHub

**Settings → Secrets and variables → Actions**

**Secrets:**

| Secret | Value |
|--------|--------|
| `APPLE_CERTIFICATE` | Base64 `.p12` (step 4) |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` export password |
| `APPLE_SIGNING_IDENTITY` | Full identity string from `security find-identity` |
| `APPLE_ID` | Apple ID email |
| `APPLE_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | 10-char Team ID |

**Variables** (tab **Variables**):

| Variable | Value |
|----------|--------|
| `MACOS_CODE_SIGNING` | `true` |
| `MACOS_NOTARIZATION_SKIP_WAIT` | `true` for **first** signed release (recommended), then remove |

Remove or fix any **old placeholder** `APPLE_*` secrets from earlier attempts.

### 7. Run a signed release

1. **Actions** → **Desktop release** → **Run workflow** (or push a `v*` tag).
2. Open the **macos-latest** job → confirm **Build release (macOS signed)** ran (not “unsigned”).
3. **First notarization:** set `MACOS_NOTARIZATION_SKIP_WAIT=true` so CI finishes in ~minutes instead of waiting on Apple for hours (see below).
4. Download the new `.dmg` from the release or R2 and install—Gatekeeper should accept it without “damaged”.

## How CI notarizes now (explicit wait + retry + staple)

The **Desktop release** workflow no longer lets `tauri-action` notarize inline (that `--wait` had **no timeout and no retry**, so a slow first submission blocked until GitHub cancelled the job at its 6-hour cap → the opaque `Error: The operation was canceled.`).

Instead, `tauri-action` only **signs** (it is given the `APPLE_CERTIFICATE*` secrets but **not** `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID`). A dedicated **`Notarize + staple macOS`** step then:

1. Submits the signed `.dmg` with `xcrun notarytool submit … --output-format json` **once** and keeps the submission id.
2. Waits with `xcrun notarytool wait <id> --timeout 40m`, up to **3 attempts** (re-waiting the **same** submission, never blindly re-uploading).
3. Checks `notarytool info <id>` for status **`Accepted`**; on anything else it pulls `notarytool log` into the run and fails with the diagnostic.
4. Staples the ticket into the `.dmg` (`xcrun stapler staple`) and validates it (`xcrun stapler validate`).

Guard rails: the job has **`timeout-minutes: 240`** and the notarize step **`timeout-minutes: 150`** — sized so the build plus **all three 40-minute wait attempts actually fit** (an earlier `90`-minute job cap was *shorter* than the wait budget, so GitHub cancelled the run mid-wait with `The operation was canceled.`). The signed `.dmg` is also uploaded as the **`InterviewVeil-mac-signed-pre-notarize`** artifact **before** waiting, so a failed or cancelled notarization never loses the build — download it and staple manually if Apple accepts the submission later (`xcrun notarytool info <id>` then `xcrun stapler staple`). A credential **preflight** (`Release signing flags`) computes `mac_notarize` from `MACOS_CODE_SIGNING=true` **and** all three notary secrets; if any secret is missing you get a loud `::warning::` and a signed-but-not-notarized `.dmg` rather than a cryptic failure.

Apple reports most notarizations finish in **minutes**; a **first** submission for a brand-new Developer ID / bundle id can take longer. If it is pathologically slow, set variable **`MACOS_NOTARIZATION_SKIP_WAIT`** = **`true`** and re-run: the step then **submits without waiting or stapling** (you track status in [App Store Connect → notary history](https://appstoreconnect.apple.com/)). Unset it afterwards so normal releases are **stapled**.

## “Apple could not verify … is free of malware”

Gatekeeper shows this when the app is **not accepted as notarized** (or notarization failed / never finished). A **Developer ID signature alone is not enough** on current macOS for downloaded apps.

| Symptom | Likely cause |
|--------|----------------|
| “Could not verify … malware” | Notarization missing, failed, or CI exited with `--skip-stapling` before Apple **Accepted** |
| “Damaged” | Usually unsigned + browser quarantine |

**Check the build you installed** (mount the `.dmg`, then):

```bash
APP="/Volumes/InterviewVeil/InterviewVeil.app"   # adjust volume name if different
codesign -dv --verbose=4 "$APP" 2>&1 | head -20
spctl -a -vv "$APP" 2>&1
xcrun stapler validate "$APP" 2>&1
```

- **`spctl` rejected / no Team ID** → unsigned or wrong cert  
- **Signed but `spctl` says not notarized** → re-run release and wait for notarization to **succeed** (see below)  
- **`stapler validate` failed** → not stapled; can still work **online** if notarization succeeded—if not, fix notarization first  

**Fix for customers:** ship a release where the macOS job logs show notarization **Accepted**, then either waited for staple or re-run without `MACOS_NOTARIZATION_SKIP_WAIT` so the ticket is stapled into the `.app` / `.dmg`.

**Your testing only (not for end users):** if you trust the build, **Right‑click → Open** once, or remove quarantine after install:

```bash
xattr -dr com.apple.quarantine ~/Applications/InterviewVeil.app
```

You do **not** create an App Store Connect app record or submit for review for this flow.

---

## Why users see “damaged and can’t be opened”

That dialog is **Gatekeeper**, not a broken installer. It usually means:

1. The app was built **without** a valid **Developer ID** signature and **notarization** (current default CI path uses `--no-sign` so releases could ship to R2).
2. The file was **downloaded** (Edge, Chrome, etc.), so macOS attached the **quarantine** flag. Unsigned + quarantined apps often show **“damaged”** instead of the milder “unidentified developer” message.

**What actually fixes trust for customers:** sign with **Developer ID Application**, enable **hardened runtime**, **notarize** with Apple, and staple the ticket. After that, a normal download opens like any commercial Mac app.

**Not a substitute for signing:** `xattr -dr com.apple.quarantine` or Right‑click → Open — only for your own testing.

---

## Production checklist (required before marketing macOS downloads)

1. **Apple Developer Program** ($99/year) — [developer.apple.com](https://developer.apple.com/programs/)
2. **Developer ID Application** certificate (not “Apple Development” only).
3. Export cert as **`.p12`** from Keychain Access (include private key).
4. **App-specific password** for notarization — [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords.
5. GitHub repo **`interviewveil-desktop`** secrets and variable (below).
6. Set repository variable **`MACOS_CODE_SIGNING`** = `true`.
7. Tag or run **Desktop release** again; re-upload replaces R2 `InterviewVeil-mac.dmg`.

`src-tauri/Entitlements.plist` already includes microphone + JIT entitlements needed under hardened runtime.

---

## GitHub secrets & variable

| Name | Example / notes |
|------|------------------|
| `APPLE_CERTIFICATE` | Base64 of `.p12` (no line breaks): `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Password you set when exporting `.p12` |
| `APPLE_SIGNING_IDENTITY` | Exact name, e.g. `Developer ID Application: Your Name (XXXXXXXXXX)` — from `security find-identity -v -p codesigning` |
| `APPLE_ID` | Apple ID email used for the developer account |
| `APPLE_PASSWORD` | App-specific password (not your Apple ID password) |
| `APPLE_TEAM_ID` | 10-character Team ID from Apple Developer → Membership |
| **Variable** `MACOS_CODE_SIGNING` | `true` |

`tauri-apps/tauri-action` imports the cert, signs the universal binary, notarizes, and staples when these are set and the **Build release (macOS signed)** job runs.

---

## Validate your `.p12` before CI

On your Mac:

```bash
# Decode what you plan to paste into APPLE_CERTIFICATE
base64 -d -i apple-cert.b64 -o /tmp/test.p12
security import /tmp/test.p12 -k ~/Library/Keychains/login.keychain-db -P 'YOUR_P12_PASSWORD' -T /usr/bin/codesign
security find-identity -v -p codesigning | grep "Developer ID Application"
```

If `security import` fails locally, CI will fail with `SecKeychainItemImport`. Fix the export (correct password, include private key, Developer ID cert).

---

## CI behavior

| `MACOS_CODE_SIGNING` | macOS release job |
|----------------------|-------------------|
| unset / not `true` | **Unsigned** (`--no-sign`, no `APPLE_*` env) — **do not ship to end users** |
| `true` + `APPLE_CERTIFICATE*` + all three notary secrets | Signed → **notarized + stapled** `.dmg` |
| `true` but a notary secret missing | Signed but **not notarized** — CI warns; Gatekeeper will block |

Windows SmartScreen is separate; see README (OV / Azure Trusted Signing).

---

## Error: `failed to import keychain certificate`

- Invalid base64 in `APPLE_CERTIFICATE`
- Wrong `APPLE_CERTIFICATE_PASSWORD`
- Placeholder secrets still in the repo
- Using an **Apple Development** cert instead of **Developer ID Application**

Remove bad secrets or leave `MACOS_CODE_SIGNING` unset until the `.p12` validates locally.
