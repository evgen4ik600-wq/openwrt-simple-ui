#!/bin/sh
set -u
IPKG_INSTROOT="${IPKG_INSTROOT:-}"

VPN="${1:-}"
[ -n "$VPN" ] || exit 1
[ -f /etc/config/firewall ] || exit 1

. /lib/functions.sh

VPN_ZONE=''
LAN_ZONE=''

find_vpn_zone() {
    local s="$1" name nets n
    config_get name "$s" name
    config_get nets "$s" network
    for n in $nets; do
        if [ "$n" = "$VPN" ]; then
            VPN_ZONE="$name"
            return
        fi
    done
}

find_lan_zone() {
    local s="$1" name nets n
    config_get name "$s" name
    config_get nets "$s" network
    for n in $nets; do
        if [ "$n" = 'lan' ]; then
            LAN_ZONE="$name"
            return
        fi
    done
}

config_load firewall
config_foreach find_vpn_zone zone
config_foreach find_lan_zone zone
[ -n "$LAN_ZONE" ] || LAN_ZONE='lan'

cp -f /etc/config/firewall /tmp/simpleui-firewall.before

if [ -z "$VPN_ZONE" ]; then
    uci -q delete firewall.simpleui_vpn
    uci set firewall.simpleui_vpn='zone'
    uci set firewall.simpleui_vpn.name='simpleui_vpn'
    uci set firewall.simpleui_vpn.input='REJECT'
    uci set firewall.simpleui_vpn.output='ACCEPT'
    uci set firewall.simpleui_vpn.forward='REJECT'
    uci set firewall.simpleui_vpn.masq='1'
    uci set firewall.simpleui_vpn.mtu_fix='1'
    uci add_list firewall.simpleui_vpn.network="$VPN"
    VPN_ZONE='simpleui_vpn'
else
    sec="$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.\([^.=]*\)\.name='$VPN_ZONE'$/\1/p" | head -n1)"
    if [ -n "$sec" ]; then
        uci set "firewall.$sec.masq=1"
        uci set "firewall.$sec.mtu_fix=1"
    fi
fi

uci -q delete firewall.simpleui_forward
uci set firewall.simpleui_forward='forwarding'
uci set firewall.simpleui_forward.src="$LAN_ZONE"
uci set firewall.simpleui_forward.dest="$VPN_ZONE"
uci commit firewall

if command -v fw4 >/dev/null 2>&1 && ! fw4 print 2>/dev/null | nft -c -f - >/dev/null 2>&1; then
    cp -f /tmp/simpleui-firewall.before /etc/config/firewall
    /etc/init.d/firewall restart >/dev/null 2>&1 || true
    logger -t simpleui 'firewall validation failed; previous firewall restored' 2>/dev/null || true
    exit 1
fi

/etc/init.d/firewall restart >/dev/null 2>&1 || {
    cp -f /tmp/simpleui-firewall.before /etc/config/firewall
    /etc/init.d/firewall restart >/dev/null 2>&1 || true
    exit 1
}

exit 0
