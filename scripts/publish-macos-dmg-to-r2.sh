#!/usr/bin/env bash
# Upload a notarized + stapled macOS .dmg to Cloudflare R2 as InterviewVeil-mac.dmg
# (stable URL for the landing site: …/v1/InterviewVeil-mac.dmg).
#
# Prereqs on your Mac:
#   - aws CLI (brew install awscli)
#   - DMG passes: spctl -a -vv -t install Your.dmg  →  accepted
#   - Optional: xcrun stapler validate Your.dmg
#
# Env (same as GitHub Actions — do not commit):
#   export R2_ACCOUNT_ID=...
#   export R2_ACCESS_KEY_ID=...
#   export R2_SECRET_ACCESS_KEY=...
#   export R2_BUCKET=interviewveil-downloads
#   export R2_PREFIX=v1
#
# Usage:
#   ./scripts/publish-macos-dmg-to-r2.sh /path/to/InterviewVeil-mac.dmg

set -euo pipefail

DMG="${1:?Usage: $0 /path/to/notarized.dmg}"

for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  if [[ -z "${!v:-}" ]]; then
    echo "Missing env $v (set R2 credentials — see docs/cloudflare-downloads.md)"
    exit 1
  fi
done

PREFIX="${R2_PREFIX:-v1}"
DEST="InterviewVeil-mac.dmg"
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "==> Gatekeeper check (must say accepted + notarized)..."
spctl -a -vv -t install "$DMG" || {
  echo "Gatekeeper rejected this DMG. Do not upload — fix signing/notarization first."
  exit 1
}

if xcrun stapler validate "$DMG" 2>/dev/null; then
  echo "==> Stapler ticket present."
else
  echo "==> Warning: no stapled ticket (may still work online if notarized)."
fi

echo "==> Uploading to s3://${R2_BUCKET}/${PREFIX}/${DEST}"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION=auto \
  aws s3 cp "$DMG" "s3://${R2_BUCKET}/${PREFIX}/${DEST}" \
    --endpoint-url "$ENDPOINT" \
    --content-type application/octet-stream \
    --content-disposition "attachment; filename=\"${DEST}\"" \
    --cache-control "public, max-age=3600"

echo "==> Done. Public URL (if custom domain is wired):"
echo "    https://cdn.interviewveil.com/${PREFIX}/${DEST}"
