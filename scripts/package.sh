#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
out="dist/ffn-upload-helper-$version.zip"
mkdir -p dist
rm -f "$out"
zip -q -r "$out" manifest.json options.html icons src vendor LICENSE PRIVACY.md -x '*.DS_Store'
echo "$out"
