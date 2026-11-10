#!/bin/sh
# Vanta installer for macOS and Linux.
#
#   curl -fsSL https://tryvanta.dev/install.sh | sh
#
# Downloads the right VantaInstaller for your system from the latest GitHub release, checks it against the
# release's SHA256SUMS, and runs it. Downloading with curl (not a browser) means macOS doesn't quarantine it,
# so there's no "can't be checked for malware" prompt. Extra arguments go to the installer, e.g. `sh -s -- -uninstall`.
set -eu

REPO="praisezu/Vanta"
BASE="https://github.com/$REPO/releases/latest/download"

os=$(uname -s)
arch=$(uname -m)
case "$os" in
    Darwin)
        case "$arch" in
            arm64) asset="VantaInstaller-macos" ;;
            x86_64) asset="VantaInstaller-macos-intel" ;;
            *) echo "Vanta: unsupported Mac ($arch)."; exit 1 ;;
        esac ;;
    Linux)
        case "$arch" in
            x86_64|amd64) asset="VantaInstaller-linux" ;;
            *) echo "Vanta: only 64-bit Intel/AMD Linux is supported right now (this is $arch)."; exit 1 ;;
        esac ;;
    *) echo "Vanta: this script is for macOS and Linux. On Windows, download VantaInstaller.exe from https://tryvanta.dev/download/"; exit 1 ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $asset…"
curl -fsSL "$BASE/$asset" -o "$tmp/$asset"
curl -fsSL "$BASE/SHA256SUMS" -o "$tmp/SHA256SUMS"

# Refuse to run anything that doesn't match the release's checksum
want=$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)
if command -v sha256sum >/dev/null 2>&1; then got=$(sha256sum "$tmp/$asset" | cut -d' ' -f1)
else got=$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1); fi
if [ -z "$want" ] || [ "$want" != "$got" ]; then
    echo "Vanta: the download doesn't match the release checksum, so it won't be run."
    exit 1
fi

chmod +x "$tmp/$asset"
if [ "$#" -eq 0 ]; then set -- -install; fi
"$tmp/$asset" "$@"
