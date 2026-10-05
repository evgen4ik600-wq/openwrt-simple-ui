#!/bin/sh
set -u

/etc/init.d/simpleui-routing stop >/dev/null 2>&1 || true
/etc/init.d/simpleui-routing disable >/dev/null 2>&1 || true
/usr/share/simpleui/disable-routing.sh >/dev/null 2>&1 || true

rm -f /etc/init.d/simpleui-routing /etc/hotplug.d/iface/95-simpleui
rm -rf /usr/share/simpleui /www/luci-static/resources/view/simpleui
rm -f /usr/libexec/rpcd/luci.simpleui /usr/share/luci/menu.d/luci-app-simpleui.json /usr/share/rpcd/acl.d/luci-app-simpleui.json /www/luci-static/resources/simpleui.css
rm -f /etc/config/simpleui

uci -q delete firewall.simpleui_forward || true
uci -q delete firewall.simpleui_vpn || true
uci commit firewall 2>/dev/null || true
/etc/init.d/firewall restart >/dev/null 2>&1 || true

if [ -f /etc/crontabs/root ]; then
    grep -v '/usr/share/simpleui/update-rules.sh' /etc/crontabs/root > /tmp/simpleui-cron || true
    cat /tmp/simpleui-cron > /etc/crontabs/root
    /etc/init.d/cron restart >/dev/null 2>&1 || true
fi

rm -f /tmp/dnsmasq.d/simpleui.conf
if [ -f /etc/simpleui/original-dnsmasq-confdir ]; then
    old="$(cat /etc/simpleui/original-dnsmasq-confdir 2>/dev/null || true)"
    if [ -n "$old" ]; then uci set dhcp.@dnsmasq[0].confdir="$old"; else uci -q delete dhcp.@dnsmasq[0].confdir; fi
    uci commit dhcp
fi
rm -rf /etc/simpleui

/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache 2>/dev/null || true
rm -rf /tmp/luci-modulecache/* 2>/dev/null || true
/etc/init.d/uhttpd restart >/dev/null 2>&1 || true

echo 'OpenWrt Simple UI removed. dnsmasq-full kept to avoid risky DNS package replacement.'
