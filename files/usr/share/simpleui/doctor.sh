#!/bin/sh
set -u

fail=0
warn=0

ok() { echo "OK: $*"; }
bad() { echo "FAIL: $*"; fail=1; }
note() { echo "WARN: $*"; warn=1; }

command -v apk >/dev/null 2>&1 && ok 'apk present' || bad 'apk missing'
command -v nft >/dev/null 2>&1 && ok 'nft present' || bad 'nft missing'
command -v ip >/dev/null 2>&1 && ok 'ip present' || bad 'ip missing'
command -v dnsmasq >/dev/null 2>&1 && ok 'dnsmasq present' || bad 'dnsmasq missing'

release="$(ubus call system board 2>/dev/null | jsonfilter -e '@.release.version' 2>/dev/null || true)"
case "$release" in
    25.12.*) ok "OpenWrt $release" ;;
    *) note "designed for OpenWrt 25.12.x, found: ${release:-unknown}" ;;
esac

if dnsmasq --version 2>/dev/null | grep -q ' nftset '; then
    ok 'dnsmasq nftset supported'
else
    note 'dnsmasq nftset not available; GeoSite domain routing will be inactive'
fi

VPN="$(uci -q get simpleui.main.vpn_interface || true)"
if [ -z "$VPN" ]; then
    VPN="$(uci show network 2>/dev/null | sed -n "s/^network\.\([^.=]*\)\.proto='amneziawg'$/\1/p" | head -n1)"
fi

if [ -n "$VPN" ]; then
    up="$(ifstatus "$VPN" 2>/dev/null | jsonfilter -e '@.up' 2>/dev/null || echo false)"
    dev="$(ifstatus "$VPN" 2>/dev/null | jsonfilter -e '@.l3_device' 2>/dev/null || true)"
    [ "$up" = 'true' ] && ok "VPN $VPN is up (${dev:-$VPN})" || note "VPN $VPN is not up"
else
    note 'AmneziaWG/WireGuard interface not found'
fi

if ip -4 route show default | grep -q .; then
    ok "WAN/default route present: $(ip -4 route show default | head -n1)"
else
    bad 'IPv4 default route missing'
fi

if command -v fw4 >/dev/null 2>&1; then
    if fw4 print >/tmp/simpleui-doctor-fw.nft 2>/tmp/simpleui-doctor-fw.err && nft -c -f /tmp/simpleui-doctor-fw.nft >/dev/null 2>&1; then
        ok 'firewall4 config validates'
    else
        bad 'firewall4 config does not validate'
    fi
fi

free_kb="$(df -k /overlay 2>/dev/null | awk 'NR==2{print $4}')"
[ -n "$free_kb" ] || free_kb=0
if [ "$free_kb" -ge 1024 ]; then
    ok "free flash: $((free_kb/1024)) MiB"
else
    note "low free flash: $free_kb KiB"
fi

avail_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null)"
[ -n "$avail_kb" ] || avail_kb=0
if [ "$avail_kb" -ge 12288 ]; then
    ok "available RAM: $((avail_kb/1024)) MiB"
else
    note "low available RAM: $((avail_kb/1024)) MiB"
fi

echo "RESULT: fail=$fail warn=$warn"
exit "$fail"
