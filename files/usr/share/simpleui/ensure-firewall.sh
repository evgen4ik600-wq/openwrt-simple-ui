#!/bin/sh
set -e

VPN="${1:-}"
[ -n "$VPN" ] || { echo 'VPN interface is missing' >&2; exit 1; }
[ -f /etc/config/firewall ] || { echo '/etc/config/firewall not found' >&2; exit 1; }

BACKUP='/tmp/simpleui-firewall.before'
cp -f /etc/config/firewall "$BACKUP"

VPN_SECTION=''
VPN_ZONE=''
LAN_ZONE=''

# Do not source /lib/functions.sh here. This helper intentionally uses only
# direct UCI calls so it is independent of OpenWrt config_load shell globals.
for sec in $(uci show firewall 2>/dev/null | sed -n "s/^firewall\.\([^=]*\)=zone$/\1/p"); do
    name="$(uci -q get "firewall.$sec.name" || true)"
    nets="$(uci -q get "firewall.$sec.network" || true)"

    for net in $nets; do
        if [ "$net" = "$VPN" ]; then
            VPN_SECTION="$sec"
            VPN_ZONE="$name"
        fi
        if [ "$net" = 'lan' ]; then
            LAN_ZONE="$name"
        fi
    done
done

[ -n "$LAN_ZONE" ] || LAN_ZONE='lan'

if [ -z "$VPN_ZONE" ]; then
    uci -q delete firewall.simpleui_vpn || true
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
    # Selective client traffic leaves through the existing VPN zone, therefore
    # masquerading is required unless the remote VPN explicitly routes the LAN.
    uci set "firewall.$VPN_SECTION.masq=1"
    uci set "firewall.$VPN_SECTION.mtu_fix=1"
fi

uci -q delete firewall.simpleui_forward || true
uci set firewall.simpleui_forward='forwarding'
uci set firewall.simpleui_forward.src="$LAN_ZONE"
uci set firewall.simpleui_forward.dest="$VPN_ZONE"
uci commit firewall

# Validate the generated firewall before restarting it. Roll back on any error.
if command -v fw4 >/dev/null 2>&1; then
    if ! fw4 print > /tmp/simpleui-fw4.nft 2>/tmp/simpleui-fw4.err; then
        cp -f "$BACKUP" /etc/config/firewall
        echo 'fw4 could not generate firewall rules' >&2
        exit 1
    fi
    if ! nft -c -f /tmp/simpleui-fw4.nft >/dev/null 2>&1; then
        cp -f "$BACKUP" /etc/config/firewall
        echo 'firewall validation failed' >&2
        exit 1
    fi
fi

if ! /etc/init.d/firewall restart >/dev/null 2>&1; then
    cp -f "$BACKUP" /etc/config/firewall
    /etc/init.d/firewall restart >/dev/null 2>&1 || true
    echo 'firewall restart failed; previous config restored' >&2
    exit 1
fi

exit 0
