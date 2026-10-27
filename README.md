# InterviewVeil desktop app (`desktop/`)

An AI interview practice coach for macOS and Windows, built with Tauri 2 and React 19. You get a question, answer it out loud or by typing, and get feedback. You can also capture a practice problem on screen to study it.

The app talks to the InterviewVeil API for sign-in, tokens and AI. It never holds API keys.

## Requirements

- Node.js 22+
- Rust 1.77+ ([rustup](https://rustup.rs))
- macOS 13+ or Windows 10+

## Develop

```bash
cp .env.example .env      # VITE_API_URL / VITE_WEB_URL (defaults: localhost:8787 / localhost:5173)
npm install
npm run tauri:dev
```

Run the API (`../backend`) and the website (`../landing`) too, then open the island menu → **Profile** → **Sign in with browser**.

## Shortcuts (default)

Shortcuts are global, so they work while InterviewVeil is hidden or another app is focused. Change any of them in **Settings → Edit shortcuts**: click a shortcut, press the new keys (Esc cancels, ⌫ clears). Conflicts and combinations the OS refuses are flagged on the row.

| Group | Action | macOS | Windows |
|-------|--------|-------|---------|
| Practice | Explain screen | `⌘2` | `Ctrl+2` |
| | Answer aloud (start/stop) | `⌘3` | `Ctrl+3` |
| | New question | `⌘4` | `Ctrl+4` |
| | Get feedback | `⌘5` | `Ctrl+5` |
| | Clear screenshots | `⌘⌥⌫` | `Ctrl+Alt+Backspace` |
| Chat | Scroll up / down | `⌘⌥↑` / `⌘⌥↓` | `Ctrl+Alt+↑` / `↓` |
| | Clear chat | `⌘⌥K` | `Ctrl+Alt+K` |
| Window | Hide / show | `⌘1` | `Ctrl+1` |
| | Move chat left / right | `⌘⌥←` / `⌘⌥→` | `Ctrl+Alt+←` / `→` |
| | Quit | `⌘⌥Q` | `Ctrl+Alt+Q` |

## Native modules (`src-tauri/src`)

| Module | Purpose |
|--------|---------|
| `audio/microphone.rs` | Microphone capture via cpal |
| `audio/segmenter.rs` | Downmix, resample to 16 kHz, voice-activity segmentation, WAV encoding (unit-tested) |
| `capture/screenshot.rs` | Screenshot of the display InterviewVeil is on |
| `hotkeys/mod.rs` | Global shortcuts |
| `window/` | Island menu, window placement, opacity |

## Permissions

- **macOS:** Microphone (spoken answers) and Screen Recording (Explain screen).
- **Windows:** Microphone.

## Release

**Desktop CI** (green on every `main` push) only type-checks the app. It does **not** build installers or upload to R2.

**Desktop release** is what builds `.dmg` / `.exe`, creates a GitHub Release, and copies installers to **Cloudflare R2** (when R2 secrets are set). You will not see a release run until you start it:

### Option A — tag (recommended)

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Option B — manual

GitHub → **Actions** → **Desktop release** → **Run workflow** → branch `main` → version `v0.1.0` → Run.

Then open the run log → job **build** → step **Publish installer to Cloudflare R2** (should say `Uploading installer to s3://…`).

### Option C — local production build (macOS)

Build a shippable `.dmg` from your own Mac. Release builds **always** use the committed [`.env.production`](.env.production) (`VITE_API_URL=https://api.interviewveil.com`, `VITE_WEB_URL=https://interviewveil.com`) — `vite build` loads it automatically in production mode; the gitignored `.env` (localhost) is dev-only.

```bash
# 1. One-time: store notary credentials (Apple ID + app-specific password + team ID).
#    Typed in your Terminal — never committed, never in CI logs.
xcrun notarytool store-credentials "interviewveil" \
  --apple-id "you@example.com" --password "<app-specific password>" --team-id "S48V9LQKCT"

# 2. Build + sign (universal: arm64 + Intel, hardened runtime, entitlements).
export APPLE_SIGNING_IDENTITY="Developer ID Application: Maxwell Zilvester (S48V9LQKCT)"
npm run tauri:build -- --target universal-apple-darwin
# → src-tauri/target/universal-apple-darwin/release/bundle/dmg/InterviewVeil_<version>_universal.dmg

# 3. Notarize + staple — without this, Gatekeeper blocks the app for every user.
DMG=src-tauri/target/universal-apple-darwin/release/bundle/dmg/InterviewVeil_0.1.0_universal.dmg
xcrun notarytool submit "$DMG" --keychain-profile interviewveil --wait
xcrun stapler staple "$DMG" && xcrun stapler validate "$DMG"

# 4. Verify before sharing: expect "accepted", not "rejected".
hdiutil attach -nobrowse -readonly "$DMG"
spctl -a -vv -t exec /Volumes/InterviewVeil/InterviewVeil.app
hdiutil detach /Volumes/InterviewVeil
```

Full signing/notarization troubleshooting: [`docs/macos-signing.md`](docs/macos-signing.md).

Releases are built by [`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml):

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The workflow builds a universal macOS `.dmg` and a Windows installer and attaches them to a GitHub Release. It also uploads copies with fixed names.

**Website downloads (TechScreen-style CDN):** configure Cloudflare R2 and set `VITE_DOWNLOAD_CDN_BASE` on the landing site. Full steps: [`docs/cloudflare-downloads.md`](docs/cloudflare-downloads.md).

```text
https://cdn.interviewveil.com/v1/InterviewVeil-mac.dmg
https://cdn.interviewveil.com/v1/InterviewVeil-windows-setup.exe
```

**Fallback:** GitHub `releases/latest/download/...` URLs via `VITE_DOWNLOAD_MAC_URL` / `VITE_DOWNLOAD_WINDOWS_URL`.

**Before the first release:**
1. **Auto-updater (optional).** Installer-only releases work without this. When ready: run `npm run tauri signer generate`, set `plugins.updater.pubkey` and fix `plugins.updater.endpoints`, set `bundle.createUpdaterArtifacts` to `true` in `tauri.conf.json`, add secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (paste the **full** generated key including the `comment:` line), and set repo variable `TAURI_UPDATER_SIGNING=true`.
2. **Production env (committed, not variables).** Release URLs come from [`.env.production`](.env.production) — do **not** pass `VITE_API_URL`/`VITE_WEB_URL` as workflow env vars: an empty GitHub variable would override the file with `""`. Local dev keeps using the gitignored `.env`.
3. **macOS signing (required for public downloads).** Unsigned CI builds (`MACOS_CODE_SIGNING` unset) are for internal/R2 testing only — Gatekeeper will show **“damaged”** or block the app. For customers: Apple Developer ID + notarize; set `MACOS_CODE_SIGNING=true` and `APPLE_*` secrets. See [`docs/macos-signing.md`](docs/macos-signing.md).
4. **Windows signing (recommended).** Use Azure Trusted Signing or an OV certificate, to avoid SmartScreen warnings.
