#!/bin/sh
set -eu

PIN='a3b06128a9e0c7d139ca8b09194f302049bb7543'
BASE='https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui'
ROOT='/www/router'

echo '=== Router Home v2 shell preview ==='
mkdir -p "$ROOT"

fetch() {
  src="$1"; dst="$2"; tmp="$dst.new"
  wget -q -T 30 -O "$tmp" "$BASE/$PIN/$src" || { rm -f "$tmp"; echo "ERROR: $src"; exit 1; }
  mv "$tmp" "$dst"
}

fetch 'v2/www/index.html' "$ROOT/index.html"
fetch 'v2/www/style.css' "$ROOT/style.css"
fetch 'v2/www/app.js' "$ROOT/app.js"

# Keep normal LuCI untouched as emergency fallback.
echo "$PIN" > "$ROOT/PIN"

echo 'Installed safely without replacing LuCI.'
echo 'Open: http://192.168.31.1/router/'
echo 'Fallback remains: http://192.168.31.1/cgi-bin/luci/'
