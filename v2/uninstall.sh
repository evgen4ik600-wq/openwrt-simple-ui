#!/bin/sh
set -u
if [ -f /root/router-home-backup/index.html ]; then cp -f /root/router-home-backup/index.html /www/index.html; fi
rm -rf /www/router
rm -f /usr/libexec/rpcd/router.home /usr/share/rpcd/acl.d/router-home.json
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/uhttpd restart >/dev/null 2>&1 || true
echo 'Router Home shell removed; previous root page restored.'
