#!/bin/sh
set -eu

PIN='29dca254dc53a3457ad24e1e588d3afdd912b25e'
BASE='https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui'
SRC="$BASE/$PIN"
ROOT='/www/router'
BACK='/root/router-home-backup'

echo '=== Router Home 2.0.1 ==='

release="$(ubus call system board 2>/dev/null | jsonfilter -e '@.release.version' 2>/dev/null || true)"
case "$release" in 25.12.*) : ;; *) echo "ERROR: рассчитано на OpenWrt 25.12.x, найдено: $release"; exit 1;; esac

mkdir -p "$ROOT" "$BACK" /usr/libexec/rpcd /usr/share/rpcd/acl.d
if [ -f /www/index.html ] && [ ! -f "$BACK/index.html" ]; then cp -p /www/index.html "$BACK/index.html"; fi

fetch() {
  src="$1"; dst="$2"; tmp="$dst.new"
  mkdir -p "$(dirname "$dst")"
  wget -q -T 30 -O "$tmp" "$SRC/$src" || { rm -f "$tmp"; echo "ERROR downloading $src"; exit 1; }
  mv "$tmp" "$dst"
}

echo '[1/4] Installing Router Home backend...'
fetch 'v2/files/usr/libexec/rpcd/router.home' '/usr/libexec/rpcd/router.home'
fetch 'v2/files/usr/share/rpcd/acl.d/router-home.json' '/usr/share/rpcd/acl.d/router-home.json'
chmod +x /usr/libexec/rpcd/router.home

echo '[2/4] Installing standalone web shell...'
fetch 'v2/www/index.html' "$ROOT/index.html"
fetch 'v2/www/style.css' "$ROOT/style.css"
fetch 'v2/www/app.js' "$ROOT/app.js"
mkdir -p "$ROOT/downloads"
printf '%s\n' "$PIN" > "$ROOT/PIN"

# Root page becomes Router Home. The low-level OpenWrt web stack remains installed
# only as a recovery backend and is not linked from Router Home.
cp "$ROOT/index.html" /www/index.html

echo '[3/4] Restarting RPC and web server...'
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart

cat > "$BACK/RECOVERY.txt" <<'EOF'
Router Home recovery:
1. SSH to the router.
2. Restore previous root page:
   cp /root/router-home-backup/index.html /www/index.html
3. Restart web server:
   /etc/init.d/uhttpd restart
The original low-level administration endpoint remains installed for recovery.
EOF

echo '[4/4] Done.'
echo 'Open: http://192.168.31.1/'
echo 'Router Home now owns the root web interface.'
