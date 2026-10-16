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

1. **R2** → **Manage R2 API Tokens** → Create token with **Object Read & Write** on this bucket.
2. Add GitHub repository **secrets**:
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_ACCOUNT_ID` (Cloudflare account ID)
3. Add repository **variables**:
   - `R2_BUCKET` = bucket name (e.g. `interviewveil-downloads`)
   - `R2_DOWNLOAD_PREFIX` = `v1` (optional; defaults to `v1` in the workflow)

On tag push, `desktop-release.yml` uploads each installer to R2 after attaching it to the GitHub Release.

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
