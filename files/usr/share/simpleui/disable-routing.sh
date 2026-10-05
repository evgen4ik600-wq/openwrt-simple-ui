#!/bin/sh
# Remove only routing state created by OpenWrt Simple UI.
while ip -4 rule del priority 11000 2>/dev/null; do :; done
while ip -6 rule del priority 11000 2>/dev/null; do :; done
ip -4 route flush table 51820 2>/dev/null || true
ip -6 route flush table 51820 2>/dev/null || true
nft delete table inet simpleui 2>/dev/null || true
rm -f /tmp/dnsmasq.d/simpleui.conf
/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
exit 0
