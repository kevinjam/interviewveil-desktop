# Tauri auto-updater signing (optional)

Installer releases (`.dmg` / `.exe` → R2) do **not** require updater signing. CI disables updater artifacts unless you opt in.

## Error: `Missing comment in secret key`

The bundler runs **after** NSIS/MSI when `createUpdaterArtifacts` is true and `TAURI_SIGNING_PRIVATE_KEY` is set. The secret must be the **entire** output of:

```bash
npm run tauri signer generate
```

That includes lines like:

```
# ...
comment: "interviewveil-updater"
```

If you pasted only the base64 block or truncated the key, decoding fails with “Missing comment in secret key”. Regenerate, copy the whole private key file into the GitHub secret, and set the password secret to match.

## Enable updater signing in CI

1. `npm run tauri signer generate` — save public key to `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
2. Set `plugins.updater.endpoints` to `https://github.com/kevinjam/interviewveil-desktop/releases/latest/download/latest.json` (or your repo).
3. Set `bundle.createUpdaterArtifacts` to `true` in `tauri.conf.json`.
4. GitHub secrets: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
5. Repository variable: **`TAURI_UPDATER_SIGNING`** = `true`.

Until step 5 is set, release workflow passes `--config {"bundle":{"createUpdaterArtifacts":false}}` and does not export `TAURI_SIGNING_*` env vars.
