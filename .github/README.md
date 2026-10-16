# GitHub Actions (`interviewveil-desktop`)

| Workflow | When it runs | Purpose |
|----------|----------------|---------|
| **Desktop CI** | Every push / PR to `main` | `npm run build` + `cargo check` (no installers) |
| **Desktop release** | Tag `v*` **or** manual run with version input | Signed Tauri build → GitHub Release → optional R2 upload |
| **R2 smoke test** | Manual only | Confirms secrets/variables are visible to Actions |

## What is *not* automatic

- **Pushing `main` does not** build `.dmg` / `.exe` or upload to R2. That only happens in **Desktop release**.
- **R2 secrets** are not “picked up” until you start a **new** workflow run after saving them. Use **R2 smoke test** to verify.

## First release checklist

1. Run **R2 smoke test** → all `OK`.
2. Add `TAURI_SIGNING_PRIVATE_KEY` + password (required for updater artifacts).
3. Set repo variables `VITE_API_URL`, `VITE_WEB_URL`.
4. Either push `git tag v0.1.0 && git push origin v0.1.0`, or **Actions → Desktop release → Run workflow** and enter `v0.1.0`.

The red **Desktop release #1** on a normal code push usually means the release workflow was run manually (or an old workflow file triggered on `main`). Use **Desktop CI** for day-to-day pushes.
