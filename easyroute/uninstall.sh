#!/bin/sh
set -u

/usr/libexec/easyroute route-down >/dev/null 2>&1 || true
/etc/init.d/easyroute disable >/dev/null 2>&1 || true

rm -f /usr/share/nftables.d/table-pre/90-easyroute-sets.nft
rm -f /usr/share/nftables.d/chain-pre/mangle_prerouting/90-easyroute-mark.nft
rm -f /usr/share/nftables.d/chain-pre/forward/90-easyroute-forward.nft
rm -f /usr/share/nftables.d/table-post/90-easyroute-nat.nft

if [ -f /etc/dnsmasq.conf ]; then
    awk 'BEGIN{skip=0} /^# EASYROUTE-BEGIN$/{skip=1;next} /^# EASYROUTE-END$/{skip=0;next} skip==0{print}' /etc/dnsmasq.conf > /tmp/dnsmasq.conf.easyroute
    cat /tmp/dnsmasq.conf.easyroute > /etc/dnsmasq.conf
    rm -f /tmp/dnsmasq.conf.easyroute
fi

rm -f /usr/libexec/easyroute /usr/libexec/easyroute-url-update /usr/libexec/rpcd/luci.easyroute /etc/init.d/easyroute /etc/hotplug.d/iface/95-easyroute
rm -f /usr/share/luci/menu.d/luci-app-easyroute.json /usr/share/rpcd/acl.d/luci-app-easyroute.json
rm -rf /www/luci-static/resources/view/easyroute
rm -f /etc/config/easyroute

if [ -f /etc/crontabs/root ]; then
    awk '
      $0=="# EASYROUTE-URL-UPDATE-BEGIN" {skip=1; next}
      $0=="# EASYROUTE-URL-UPDATE-END" {skip=0; next}
      skip!=1 {print}
    ' /etc/crontabs/root > /tmp/easyroute-cron.$
    cat /tmp/easyroute-cron.$ > /etc/crontabs/root
    rm -f /tmp/easyroute-cron.$
    /etc/init.d/cron restart >/dev/null 2>&1 || true
fi
rm -rf /tmp/easyroute/url-updates

# Списки и backup оставляем в /etc/easyroute на случай восстановления.
fw4 reload >/dev/null 2>&1 || true
/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache 2>/dev/null || true
printf '%s\n' 'EasyRoute удалён. Пользовательские списки и backup оставлены в /etc/easyroute.'
