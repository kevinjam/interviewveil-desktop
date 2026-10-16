#!/bin/bash
# Rustc linker wrapper: rewrite Swift's @rpath concurrency dylib to the OS copy.
# A second toolchain copy of libswift_Concurrency.dylib duplicates ObjC classes.
set -euo pipefail

out=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "-o" ]]; then
    out="$arg"
  fi
  prev="$arg"
done

cc "$@"

if [[ -n "${out:-}" && -f "$out" ]]; then
  install_name_tool -change \
    "@rpath/libswift_Concurrency.dylib" \
    "/usr/lib/swift/libswift_Concurrency.dylib" \
    "$out" 2>/dev/null || true

  # Ad-hoc sign so System Settings can list this debug binary for Screen + Mic.
  # Must run after install_name_tool or the signature is invalid.
  if file -b "$out" | grep -q "Mach-O"; then
    ENT="$(cd "$(dirname "$0")/.." && pwd)/Entitlements.plist"
    if [[ -f "$ENT" ]]; then
      codesign --force --sign - \
        --identifier com.interviewveil.app \
        --entitlements "$ENT" \
        "$out" >/dev/null 2>&1 || true
    fi
  fi
fi
