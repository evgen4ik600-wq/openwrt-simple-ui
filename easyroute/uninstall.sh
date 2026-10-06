#!/bin/sh
set -eu

rm -f /www/luci-static/resources/view/network/easyroute.js
rm -f /usr/share/luci/menu.d/easyroute.json
rm -f /usr/share/rpcd/acl.d/easyroute.json

# Удаляем только правила, созданные EasyRoute. Сам PBR и AWG не трогаем.
for s in $(uci -q show pbr 2>/dev/null | sed -n "s/^pbr\.\([^.=]*\)\.easyroute='1'$/\1/p"); do
	uci -q delete "pbr.$s" || true
done
uci commit pbr 2>/dev/null || true

# Удаляем только firewall-секции, которые EasyRoute создавал сам.
for s in $(uci -q show firewall 2>/dev/null | sed -n "s/^firewall\.\([^.=]*\)\.easyroute='1'$/\1/p"); do
	uci -q delete "firewall.$s" || true
done
uci commit firewall 2>/dev/null || true
/etc/init.d/firewall reload >/dev/null 2>&1 || true

rm -f /tmp/luci-indexcache 2>/dev/null || true
rm -rf /tmp/luci-modulecache 2>/dev/null || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/pbr restart >/dev/null 2>&1 || true

echo 'EasyRoute удалён. AWG, pbr и dnsmasq-full оставлены без изменений.'
