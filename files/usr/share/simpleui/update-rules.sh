#!/bin/sh
set -u

APP='simpleui'
RUNDIR='/tmp/simpleui'
DNSDIR='/tmp/dnsmasq.d'
DOMAINS="$RUNDIR/domains.txt"
IP4="$RUNDIR/ip4.txt"
IP6="$RUNDIR/ip6.txt"
NFTFILE="$RUNDIR/rules.nft"
DNSFILE="$DNSDIR/simpleui.conf"
LOGFILE="$RUNDIR/update.log"
BASE='https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo'

mkdir -p "$RUNDIR" "$DNSDIR" /etc/simpleui
: > "$LOGFILE"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOGFILE"
    logger -t simpleui "$*" 2>/dev/null || true
}

get_first_vpn() {
    uci show network 2>/dev/null | sed -n "s/^network\.\([^.=]*\)\.proto='amneziawg'$/\1/p" | head -n1
    uci show network 2>/dev/null | sed -n "s/^network\.\([^.=]*\)\.proto='wireguard'$/\1/p" | head -n1
}

ENABLED="$(uci -q get simpleui.main.enabled || echo 0)"
VPN="$(uci -q get simpleui.main.vpn_interface || true)"
DNS_INTERCEPT="$(uci -q get simpleui.main.dns_intercept || echo 0)"

if [ "$ENABLED" != '1' ]; then
    /usr/share/simpleui/disable-routing.sh
    log 'routing disabled by configuration'
    exit 0
fi

if [ -z "$VPN" ] || ! uci -q get "network.$VPN" >/dev/null 2>&1; then
    VPN="$(get_first_vpn | head -n1)"
fi

if [ -z "$VPN" ]; then
    /usr/share/simpleui/disable-routing.sh
    log 'no AmneziaWG/WireGuard interface found; WAN left untouched'
    exit 1
fi

VPN_STATUS="$(ifstatus "$VPN" 2>/dev/null || true)"
VPN_UP="$(printf '%s' "$VPN_STATUS" | jsonfilter -e '@.up' 2>/dev/null || echo false)"
VPN_DEV="$(printf '%s' "$VPN_STATUS" | jsonfilter -e '@.l3_device' 2>/dev/null || true)"
[ -n "$VPN_DEV" ] || VPN_DEV="$VPN"

if [ "$VPN_UP" != 'true' ] || [ ! -e "/sys/class/net/$VPN_DEV" ]; then
    /usr/share/simpleui/disable-routing.sh
    log "VPN $VPN is down; selective rules removed so WAN continues to work"
    exit 1
fi

if ! /usr/share/simpleui/ensure-firewall.sh "$VPN"; then
    /usr/share/simpleui/disable-routing.sh
    log 'could not prepare firewall forwarding; WAN left untouched'
    exit 1
fi

LAN_STATUS="$(ifstatus lan 2>/dev/null || true)"
LAN_DEV="$(printf '%s' "$LAN_STATUS" | jsonfilter -e '@.l3_device' 2>/dev/null || true)"
[ -n "$LAN_DEV" ] || LAN_DEV='br-lan'

: > "$RUNDIR/domains.raw"
for cat in $(uci -q get simpleui.geosite.enabled 2>/dev/null || true); do
    out="$RUNDIR/geosite-$cat.list"
    if wget -q -T 20 -O "$out" "$BASE/geosite/$cat.list"; then
        cat "$out" >> "$RUNDIR/domains.raw"
        log "GeoSite loaded: $cat"
    else
        rm -f "$out"
        log "GeoSite download failed: $cat"
    fi
done
[ -s /etc/simpleui/custom-domains.txt ] && cat /etc/simpleui/custom-domains.txt >> "$RUNDIR/domains.raw"

sed 's/\r$//' "$RUNDIR/domains.raw" 2>/dev/null     | sed -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d'           -e 's/^+\.//' -e 's/^\.//'           -e 's/^DOMAIN-SUFFIX,//' -e 's/^DOMAIN,//'     | tr '[:upper:]' '[:lower:]'     | awk 'length($0) <= 253 && $0 ~ /^[a-z0-9._-]+$/ { print }'     | sort -u > "$DOMAINS"

: > "$RUNDIR/ip.raw"
for cat in $(uci -q get simpleui.geoip.enabled 2>/dev/null || true); do
    out="$RUNDIR/geoip-$cat.list"
    if wget -q -T 25 -O "$out" "$BASE/geoip/$cat.list"; then
        cat "$out" >> "$RUNDIR/ip.raw"
        log "GeoIP loaded: $cat"
    else
        rm -f "$out"
        log "GeoIP download failed: $cat"
    fi
done
[ -s /etc/simpleui/custom-ips.txt ] && cat /etc/simpleui/custom-ips.txt >> "$RUNDIR/ip.raw"

sed 's/\r$//' "$RUNDIR/ip.raw" 2>/dev/null     | sed -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d'     | awk 'index($0,":")==0 && $0 ~ /^[0-9.]+(\/[0-9]+)?$/ {print}'     | sort -u > "$IP4"

sed 's/\r$//' "$RUNDIR/ip.raw" 2>/dev/null     | sed -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d'     | awk 'index($0,":")>0 && $0 ~ /^[0-9a-fA-F:]+(\/[0-9]+)?$/ {print tolower($0)}'     | sort -u > "$IP6"

: > "$DNSFILE"
if dnsmasq --version 2>/dev/null | grep -q ' nftset '; then
    awk '{print "nftset=/" $0 "/4#inet#simpleui#domain4,6#inet#simpleui#domain6"}' "$DOMAINS" > "$DNSFILE"
else
    log 'dnsmasq lacks nftset support; domain routing skipped'
fi

{
    echo 'table inet simpleui {'
    echo '  set domain4 { type ipv4_addr; flags interval; auto-merge; }'
    echo '  set domain6 { type ipv6_addr; flags interval; auto-merge; }'
    echo '  set ip4 { type ipv4_addr; flags interval; auto-merge;'
    if [ -s "$IP4" ]; then
        printf '    elements = { '
        awk 'BEGIN{s=""} {printf "%s%s",s,$0; s=", "} END{print ""}' "$IP4"
        echo '    }'
    fi
    echo '  }'
    echo '  set ip6 { type ipv6_addr; flags interval; auto-merge;'
    if [ -s "$IP6" ]; then
        printf '    elements = { '
        awk 'BEGIN{s=""} {printf "%s%s",s,$0; s=", "} END{print ""}' "$IP6"
        echo '    }'
    fi
    echo '  }'
    echo '  chain route_prerouting {'
    echo '    type filter hook prerouting priority -160; policy accept;'
    printf '    iifname "%s" ip daddr @domain4 meta mark set 0x51820\n' "$LAN_DEV"
    printf '    iifname "%s" ip daddr @ip4 meta mark set 0x51820\n' "$LAN_DEV"
    printf '    iifname "%s" ip6 daddr @domain6 meta mark set 0x51820\n' "$LAN_DEV"
    printf '    iifname "%s" ip6 daddr @ip6 meta mark set 0x51820\n' "$LAN_DEV"
    echo '  }'
    if [ "$DNS_INTERCEPT" = '1' ]; then
        echo '  chain dns_intercept {'
        echo '    type nat hook prerouting priority -101; policy accept;'
        printf '    iifname "%s" udp dport 53 redirect to :53\n' "$LAN_DEV"
        printf '    iifname "%s" tcp dport 53 redirect to :53\n' "$LAN_DEV"
        echo '  }'
    fi
    echo '}'
} > "$NFTFILE"

if ! sed 's/^table inet simpleui {/table inet simpleui_check {/' "$NFTFILE" | nft -c -f - >/dev/null 2>&1; then
    rm -f "$DNSFILE"
    log 'generated nftables rules failed validation; old internet path left untouched'
    exit 1
fi

while ip -4 rule del priority 11000 2>/dev/null; do :; done
while ip -6 rule del priority 11000 2>/dev/null; do :; done
ip -4 route flush table 51820 2>/dev/null || true
ip -6 route flush table 51820 2>/dev/null || true
ip -4 route replace default dev "$VPN_DEV" table 51820
ip -4 rule add priority 11000 fwmark 0x51820/0xfffff lookup 51820

if printf '%s' "$VPN_STATUS" | jsonfilter -e '@["ipv6-address"][0].address' 2>/dev/null | grep -q ':'; then
    ip -6 route replace default dev "$VPN_DEV" table 51820 2>/dev/null || true
    ip -6 rule add priority 11000 fwmark 0x51820/0xfffff lookup 51820 2>/dev/null || true
fi

nft delete table inet simpleui 2>/dev/null || true
if ! nft -f "$NFTFILE"; then
    /usr/share/simpleui/disable-routing.sh
    log 'could not activate nftables table; routing disabled safely'
    exit 1
fi

if ! /etc/init.d/dnsmasq restart >/dev/null 2>&1; then
    rm -f "$DNSFILE"
    /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
    /usr/share/simpleui/disable-routing.sh
    log 'dnsmasq restart failed; Smart routing disabled safely'
    exit 1
fi

printf '%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" > "$RUNDIR/last_update"
printf '%s\n' "$(wc -l < "$DOMAINS" 2>/dev/null || echo 0)" > "$RUNDIR/domain_count"
printf '%s\n' "$(($(wc -l < "$IP4" 2>/dev/null || echo 0)+$(wc -l < "$IP6" 2>/dev/null || echo 0)))" > "$RUNDIR/ip_count"
printf '%s\n' "$VPN" > "$RUNDIR/vpn"
log "routing active via $VPN_DEV; domains=$(cat "$RUNDIR/domain_count"); ip=$(cat "$RUNDIR/ip_count")"
exit 0
