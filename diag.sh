#!/bin/sh
set +e

OUT='/tmp/simpleui-routing-debug.log'
: > "$OUT"

echo '=== Simple UI routing debug ===' | tee -a "$OUT"
echo "Version: $(cat /usr/share/simpleui/VERSION 2>/dev/null || echo unknown)" | tee -a "$OUT"
echo "VPN: $(uci -q get simpleui.main.vpn_interface || echo none)" | tee -a "$OUT"
echo "Enabled: $(uci -q get simpleui.main.enabled || echo 0)" | tee -a "$OUT"
echo "GeoSite: $(uci -q get simpleui.geosite.enabled || echo none)" | tee -a "$OUT"
echo "GeoIP: $(uci -q get simpleui.geoip.enabled || echo none)" | tee -a "$OUT"
echo "Default route: $(ip -4 route show default | head -n1)" | tee -a "$OUT"
echo "dnsmasq nftset: $(dnsmasq --version 2>/dev/null | grep -q ' nftset ' && echo yes || echo no)" | tee -a "$OUT"

echo '--- firewall zones ---' | tee -a "$OUT"
uci show firewall 2>/dev/null | grep -E "=zone$|\.name=|\.network=|=forwarding$|\.src=|\.dest=" | tee -a "$OUT"

echo '--- traced apply ---' | tee -a "$OUT"
rm -rf /tmp/simpleui-update.lock
/bin/sh -x /usr/share/simpleui/update-rules.sh >>"$OUT" 2>&1
RC=$?

echo "--- exit code: $RC ---" | tee -a "$OUT"
if [ "$RC" -ne 0 ]; then
    /usr/share/simpleui/disable-routing.sh >/dev/null 2>&1 || true
    echo 'FAIL: routing was rolled back; normal WAN preserved.' | tee -a "$OUT"
else
    echo 'OK: routing apply finished successfully.' | tee -a "$OUT"
fi

echo '--- last 35 trace lines ---'
tail -n 35 "$OUT"
exit 0
