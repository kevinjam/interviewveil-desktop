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

Releases are built by GitHub Actions ([`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml)) when you push a tag:

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
1. **Updater keys.** Run `npm run tauri signer generate`.
   - Put the public key in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
   - Replace `OWNER/REPO` in `plugins.updater.endpoints`.
   - Add the private key and its password as the repo secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Builds fail without them, because updater artifacts are enabled.
2. **Repository variables.** Set `VITE_API_URL` and `VITE_WEB_URL`.
3. **macOS signing.** Needs an Apple Developer account. Add these secrets: `APPLE_CERTIFICATE` (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`. Without them, Gatekeeper blocks the app. `src-tauri/Entitlements.plist` already grants microphone access under the hardened runtime.
4. **Windows signing (recommended).** Use Azure Trusted Signing or an OV certificate, to avoid SmartScreen warnings.
