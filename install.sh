#!/bin/sh
set -eu

PIN='8ff43a78fb61c73a1d8311316c35cd0c9211278a'
BASE='https://raw.githubusercontent.com/evgen4ik600-wq/openwrt-simple-ui'
FILES="$BASE/$PIN/files"
VERSION='1.1.0'

echo '=== OpenWrt Simple UI 1.1.0 ==='
echo "Pinned files: $PIN"

command -v apk >/dev/null 2>&1 || { echo 'ERROR: нужен OpenWrt 25.12+ с apk'; exit 1; }
command -v wget >/dev/null 2>&1 || { echo 'ERROR: wget не найден'; exit 1; }

release="$(ubus call system board 2>/dev/null | jsonfilter -e '@.release.version' 2>/dev/null || true)"
case "$release" in
    25.12.*) : ;;
    *) echo "WARNING: разработано под OpenWrt 25.12.x, сейчас: $release" ;;
esac

# Stop any previous Simple UI service before replacing its init script.
if [ -x /etc/init.d/simpleui-routing ]; then
    /etc/init.d/simpleui-routing stop >/dev/null 2>&1 || true
fi
rm -rf /tmp/simpleui-update.lock

mkdir -p /root/simpleui-backup /etc/simpleui
for f in network firewall dhcp wireless; do
    [ -f "/etc/config/$f" ] && [ ! -f "/root/simpleui-backup/$f" ] && cp -p "/etc/config/$f" "/root/simpleui-backup/$f"
done

# Remove only the previous experimental SmartRoute/PBR setup created in this project.
/etc/init.d/pbr stop >/dev/null 2>&1 || true
/etc/init.d/pbr disable >/dev/null 2>&1 || true
uci -q delete firewall.smartroute_dns || true
uci -q delete pbr.smartroute_domains || true
uci -q delete pbr.smartroute_ips || true
uci commit firewall 2>/dev/null || true
uci commit pbr 2>/dev/null || true
rm -rf /usr/share/smartroute /www/luci-static/resources/view/smartroute
rm -f /usr/libexec/rpcd/luci.smartroute /usr/libexec/rpcd/luci.smartroute.bak
rm -f /usr/share/luci/menu.d/luci-app-smartroute.json /usr/share/rpcd/acl.d/luci-app-smartroute.json /etc/config/smartroute
apk del luci-app-pbr pbr >/dev/null 2>&1 || true

echo '[1/7] Checking dnsmasq nftset...'
if ! dnsmasq --version 2>/dev/null | grep -q ' nftset '; then
    free_kb="$(df -k /overlay 2>/dev/null | awk 'NR==2{print $4}')"
    [ -n "$free_kb" ] || free_kb=0
    if [ "$free_kb" -ge 1200 ]; then
        if apk --update-cache add dnsmasq-full >/tmp/simpleui-apk.log 2>&1; then
            echo 'dnsmasq-full installed.'
        else
            echo 'WARNING: dnsmasq-full install failed; GeoIP can work, GeoSite domains will stay inactive.'
            tail -n 6 /tmp/simpleui-apk.log 2>/dev/null || true
        fi
    else
        echo "WARNING: only $free_kb KiB free flash; dnsmasq-full skipped."
    fi
else
    echo 'dnsmasq nftset already available.'
fi

old_confdir="$(uci -q get dhcp.@dnsmasq[0].confdir || true)"
[ -f /etc/simpleui/original-dnsmasq-confdir ] || printf '%s\n' "$old_confdir" > /etc/simpleui/original-dnsmasq-confdir
uci set dhcp.@dnsmasq[0].confdir='/tmp/dnsmasq.d'
uci commit dhcp
mkdir -p /tmp/dnsmasq.d

fetch() {
    src="$1"
    dst="$2"
    mkdir -p "$(dirname "$dst")"
    tmp="${dst}.new"
    wget -q -T 30 -O "$tmp" "$FILES/$src" || {
        rm -f "$tmp"
        echo "ERROR downloading pinned file: $src"
        exit 1
    }
    mv "$tmp" "$dst"
}

echo '[2/7] Installing pinned Simple UI files...'
[ -f /etc/config/simpleui ] || fetch 'etc/config/simpleui' '/etc/config/simpleui'
fetch 'etc/init.d/simpleui-routing' '/etc/init.d/simpleui-routing'
fetch 'etc/hotplug.d/iface/95-simpleui' '/etc/hotplug.d/iface/95-simpleui'
fetch 'usr/share/simpleui/catalog.tsv' '/usr/share/simpleui/catalog.tsv'
fetch 'usr/share/simpleui/disable-routing.sh' '/usr/share/simpleui/disable-routing.sh'
fetch 'usr/share/simpleui/ensure-firewall.sh' '/usr/share/simpleui/ensure-firewall.sh'
fetch 'usr/share/simpleui/update-rules.sh' '/usr/share/simpleui/update-rules.sh'
fetch 'usr/share/simpleui/doctor.sh' '/usr/share/simpleui/doctor.sh'
fetch 'usr/libexec/rpcd/luci.simpleui' '/usr/libexec/rpcd/luci.simpleui'
fetch 'usr/share/luci/menu.d/luci-app-simpleui.json' '/usr/share/luci/menu.d/luci-app-simpleui.json'
fetch 'usr/share/rpcd/acl.d/luci-app-simpleui.json' '/usr/share/rpcd/acl.d/luci-app-simpleui.json'
fetch 'www/luci-static/resources/simpleui.css' '/www/luci-static/resources/simpleui.css'
for v in dashboard internet wifi devices routing system; do
    fetch "www/luci-static/resources/view/simpleui/$v.js" "/www/luci-static/resources/view/simpleui/$v.js"
done

chmod +x /etc/init.d/simpleui-routing /etc/hotplug.d/iface/95-simpleui
chmod +x /usr/share/simpleui/*.sh /usr/libexec/rpcd/luci.simpleui
printf '%s\n' "$VERSION" > /usr/share/simpleui/VERSION
printf '%s\n' "$PIN" > /usr/share/simpleui/PIN
[ -f /etc/simpleui/custom-domains.txt ] || : > /etc/simpleui/custom-domains.txt
[ -f /etc/simpleui/custom-ips.txt ] || : > /etc/simpleui/custom-ips.txt

VPN="$(uci show network 2>/dev/null | sed -n "s/^network\.\([^.=]*\)\.proto='amneziawg'$/\1/p" | head -n1)"
[ -n "$VPN" ] || VPN="$(uci show network 2>/dev/null | sed -n "s/^network\.\([^.=]*\)\.proto='wireguard'$/\1/p" | head -n1)"
if [ -n "$VPN" ]; then
    uci set simpleui.main.vpn_interface="$VPN"
else
    uci set simpleui.main.enabled='0'
fi
uci commit simpleui

echo '[3/7] Configuring daily GeoSite/GeoIP refresh...'
mkdir -p /etc/crontabs
[ -f /etc/crontabs/root ] || : > /etc/crontabs/root
grep -v '/usr/share/simpleui/update-rules.sh' /etc/crontabs/root > /tmp/simpleui-cron || true
printf '%s\n' '17 4 * * * [ "$(uci -q get simpleui.main.auto_update)" = "1" ] && /usr/share/simpleui/update-rules.sh >/dev/null 2>&1' >> /tmp/simpleui-cron
cat /tmp/simpleui-cron > /etc/crontabs/root
/etc/init.d/cron enable >/dev/null 2>&1 || true
/etc/init.d/cron restart >/dev/null 2>&1 || true
/etc/init.d/simpleui-routing enable >/dev/null 2>&1 || true

echo '[4/7] Restarting DNS and LuCI...'
/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache 2>/dev/null || true
rm -rf /tmp/luci-modulecache/* 2>/dev/null || true
/etc/init.d/uhttpd restart >/dev/null 2>&1 || true

echo '[5/7] Running automatic preflight...'
if /usr/share/simpleui/doctor.sh >/tmp/simpleui-doctor.log 2>&1; then
    cat /tmp/simpleui-doctor.log
    PREFLIGHT=1
else
    cat /tmp/simpleui-doctor.log
    PREFLIGHT=0
    echo 'WARNING: critical preflight check failed. Smart routing will NOT be activated.'
fi

echo '[6/7] Applying GeoSite/GeoIP routing...'
if [ "$PREFLIGHT" = '1' ] && [ -n "$VPN" ]; then
    if /usr/share/simpleui/update-rules.sh >/tmp/simpleui-first-run.log 2>&1; then
        echo "Routing active via $VPN"
    else
        echo 'WARNING: smart routing did not activate; normal WAN was preserved.'
        cat /tmp/simpleui-first-run.log 2>/dev/null || true
    fi
else
    /usr/share/simpleui/disable-routing.sh >/dev/null 2>&1 || true
    echo 'Routing left disabled; normal WAN preserved.'
fi

/etc/init.d/simpleui-routing start >/dev/null 2>&1 || true

echo '[7/7] Done.'
echo 'Open LuCI -> Домашняя сеть -> Обзор'
echo "Version: $VERSION"
echo "VPN: ${VPN:-not found}"
echo "dnsmasq nftset: $(dnsmasq --version 2>/dev/null | grep -q ' nftset ' && echo yes || echo no)"
echo "Pinned: $PIN"
