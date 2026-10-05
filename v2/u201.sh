#!/bin/sh
set -eu
PIN='29dca254dc53a3457ad24e1e588d3afdd912b25e'
BASE='https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui'
SRC="$BASE/$PIN"

fetch(){ src="$1"; dst="$2"; tmp="$dst.new"; mkdir -p "$(dirname "$dst")"; wget -q -T 30 -O "$tmp" "$SRC/$src" || { rm -f "$tmp"; echo "ERROR: $src"; exit 1; }; mv "$tmp" "$dst"; }

echo '=== Router Home 2.0.1 update ==='
fetch 'v2/files/usr/libexec/rpcd/router.home' '/usr/libexec/rpcd/router.home'
fetch 'v2/files/usr/share/rpcd/acl.d/router-home.json' '/usr/share/rpcd/acl.d/router-home.json'
fetch 'v2/www/index.html' '/www/router/index.html'
fetch 'v2/www/style.css' '/www/router/style.css'
fetch 'v2/www/app.js' '/www/router/app.js'
chmod +x /usr/libexec/rpcd/router.home
cp /www/router/index.html /www/index.html
printf '%s
' "$PIN" > /www/router/PIN
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
echo 'Done. Refresh 192.168.31.1'
