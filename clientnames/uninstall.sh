#!/bin/sh
set -eu
rm -f /usr/libexec/rpcd/luci.clientnames
rm -f /usr/share/rpcd/acl.d/luci-clientnames.json
rm -f /www/luci-static/resources/view/status/include/61_clientnames.js
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache 2>/dev/null || true
rm -f /tmp/luci-modulecache/* 2>/dev/null || true
echo 'Client Names удалён. /etc/config/clientnames оставлен, чтобы сохранить ваши имена.'
