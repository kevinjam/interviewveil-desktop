# Cloudflare R2 downloads (TechScreen-style CDN)

InterviewVeil serves desktop installers from **stable URLs** on your own domain (e.g. `https://cdn.interviewveil.com/v1/InterviewVeil-mac.dmg`). Each release **overwrites** the same object keys so the landing page never changes.

GitHub Releases remain the source of truth for version history and the Tauri updater (`latest.json`). R2 is for fast, branded download links on the marketing site.

**Landing images & demo media** (`landing/public/`) sync to the same bucket under `site/` on every push — see [`landing/docs/r2-assets.md`](../../landing/docs/r2-assets.md).

## 1. Create R2 bucket

1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `interviewveil-downloads`).
2. **Settings** → **CORS** (optional; only needed if you ever fetch installers from the browser with JS). Direct `window.location` downloads do not require CORS.

## 2. Public access via custom domain

1. R2 bucket → **Settings** → **Custom Domains** → connect `cdn.interviewveil.com` (or a subdomain you prefer).
2. Cloudflare DNS will add the records; wait until the domain shows **Active**.

Objects are then available at:

```text
https://cdn.interviewveil.com/v1/InterviewVeil-mac.dmg
https://cdn.interviewveil.com/v1/InterviewVeil-windows-setup.exe
```

Upload with prefix `v1/` (configurable via `R2_DOWNLOAD_PREFIX`).

## 3. API token for CI

Configure these on **`kevinjam/interviewveil-desktop`** (the desktop app repo). Secrets on another repo (backend, landing, monorepo) are **not** visible to the desktop release workflow.

1. **R2** → **Manage R2 API Tokens** → Create token with **Object Read & Write** on this bucket.
2. Add GitHub repository **secrets** (Settings → Secrets and variables → Actions):
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_ACCOUNT_ID` (Cloudflare account ID)
3. Add repository **variables**:
   - `R2_BUCKET` = bucket name (e.g. `interviewveil-downloads`)
   - `R2_DOWNLOAD_PREFIX` = `v1` (optional; defaults to `v1` in the workflow)

On tag push (or manual **Desktop release** dispatch), `desktop-release.yml` uploads each installer to R2 **after** the Tauri build succeeds.

**Important:** **Desktop CI** succeeding on `main` does not upload anything to R2. You must run **Desktop release** (push a `v*` tag or use **Run workflow** in Actions).

```bash
# from a clean main, after CI is green:
git tag v0.1.0
git push origin v0.1.0
```

Pushing `main` without a tag does **not** run the release workflow.

**Verify wiring:** Actions → **R2 smoke test** → Run workflow. You should see `OK` for each secret/variable. Re-run after adding secrets (old runs do not pick up new values).

**Troubleshooting**

| Symptom | Cause |
|--------|--------|
| Workflow file invalid / never runs | Push fixed `desktop-release.yml` to `main` |
| `R2 not configured` in logs | Secrets/vars on wrong repo, or run started before secrets existed — re-run |
| R2 step never appears | Build failed earlier (e.g. missing `TAURI_SIGNING_*` secrets) |
| Upload skipped on push to `main` | Release workflow only runs on `v*` tags or workflow_dispatch |
| `failed to import keychain certificate` on macOS | Invalid `APPLE_*` secrets — leave `MACOS_CODE_SIGNING` unset for unsigned builds; see [`macos-signing.md`](macos-signing.md) |

## 4. Landing site (Vercel)

Set **one** base URL; filenames match the release workflow:

```env
VITE_DOWNLOAD_CDN_BASE=https://cdn.interviewveil.com/v1
```

Optional overrides:

```env
VITE_DOWNLOAD_MAC_FILE=InterviewVeil-mac.dmg
VITE_DOWNLOAD_WINDOWS_FILE=InterviewVeil-windows-setup.exe
```

Or explicit URLs (bypasses CDN base):

```env
VITE_DOWNLOAD_MAC_URL=https://cdn.interviewveil.com/v1/InterviewVeil-mac.dmg
VITE_DOWNLOAD_WINDOWS_URL=https://cdn.interviewveil.com/v1/InterviewVeil-windows-setup.exe
```

Redeploy the landing after changing env vars.

## 5. Manual upload (first test)

With [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html):

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export R2_ACCOUNT_ID=...
BUCKET=interviewveil-downloads

aws s3 cp InterviewVeil-mac.dmg \
  "s3://${BUCKET}/v1/InterviewVeil-mac.dmg" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --content-type application/octet-stream \
  --content-disposition 'attachment; filename="InterviewVeil-mac.dmg"'
```

Open the custom-domain URL in a browser to confirm the download starts.

## 6. Analytics

The landing page sends a `sendBeacon` to `POST /public/download` on your API when a user clicks Download (platform + page path). Check API logs for `download` events.
