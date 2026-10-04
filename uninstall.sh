#!/bin/sh
set -eu

echo "=== OpenWrt Simple UI uninstall ==="

rm -f /usr/share/luci/menu.d/luci-app-simpleui.json
rm -f /usr/share/rpcd/acl.d/luci-app-simpleui.json
rm -rf /www/luci-static/resources/view/simpleui

rm -f /tmp/luci-indexcache 2>/dev/null || true
rm -rf /tmp/luci-modulecache/* 2>/dev/null || true

/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart

echo "OpenWrt Simple UI removed."
echo "Standard LuCI settings were not changed."
