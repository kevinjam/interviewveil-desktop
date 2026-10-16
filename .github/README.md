# Desktop GitHub Actions

Workflow definitions live here:

- [`workflows/desktop-release.yml`](workflows/desktop-release.yml) — Tauri release builds on version tags.

GitHub only runs workflows from the repository root `.github/workflows/` directory. The repo keeps **symlinks** there pointing at this file so Actions still picks up the workflow while the source of truth stays under `desktop/`.
