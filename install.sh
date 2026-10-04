#!/bin/sh
set -eu

VIEWDIR="/www/luci-static/resources/view/simpleui"
MENUDIR="/usr/share/luci/menu.d"
ACLDIR="/usr/share/rpcd/acl.d"

mkdir -p "$VIEWDIR" "$MENUDIR" "$ACLDIR"

# Neutralize only our previous SmartRoute rules. Do not alter WAN/Wi-Fi/AWG.
if uci -q get smartroute.config >/dev/null 2>&1; then
  uci set smartroute.config.enabled='0'
  uci commit smartroute
fi
uci -q delete pbr.smartroute_domains || true
uci -q delete pbr.smartroute_ips || true
uci -q delete firewall.smartroute_dns || true
uci commit pbr 2>/dev/null || true
uci commit firewall 2>/dev/null || true
/etc/init.d/pbr restart >/dev/null 2>&1 || true
/etc/init.d/firewall restart >/dev/null 2>&1 || true

cat > "$MENUDIR/luci-app-simpleui.json" <<'EOF'
{
  "admin/simple": {
    "title": "Простой режим",
    "order": 1,
    "action": { "type": "firstchild", "preferred": "dashboard", "recurse": true },
    "depends": { "acl": [ "luci-app-simpleui" ] }
  },
  "admin/simple/dashboard": {
    "title": "Главная",
    "order": 1,
    "action": { "type": "view", "path": "simpleui/dashboard" }
  },
  "admin/simple/internet": {
    "title": "Интернет",
    "order": 2,
    "action": { "type": "alias", "path": "admin/network/network" }
  },
  "admin/simple/wifi": {
    "title": "Wi-Fi",
    "order": 3,
    "action": { "type": "alias", "path": "admin/network/wireless" }
  },
  "admin/simple/devices": {
    "title": "Устройства",
    "order": 4,
    "action": { "type": "view", "path": "simpleui/devices" }
  },
  "admin/simple/vpn": {
    "title": "VPN",
    "order": 5,
    "action": { "type": "view", "path": "simpleui/vpn" }
  },
  "admin/simple/system": {
    "title": "Система",
    "order": 6,
    "action": { "type": "alias", "path": "admin/system/system" }
  },
  "admin/simple/advanced": {
    "title": "Расширенные настройки",
    "order": 90,
    "action": { "type": "alias", "path": "admin/status/overview" }
  }
}
EOF

cat > "$ACLDIR/luci-app-simpleui.json" <<'EOF'
{
  "luci-app-simpleui": {
    "description": "Simple UI for OpenWrt",
    "read": {
      "uci": [ "network", "wireless", "dhcp", "system" ],
      "ubus": {
        "system": [ "board", "info" ],
        "network.interface": [ "dump" ],
        "luci-rpc": [ "getDHCPLeases", "getHostHints", "getWirelessDevices", "getNetworkDevices" ]
      }
    }
  }
}
EOF

cat > "$VIEWDIR/dashboard.js" <<'EOF'
'use strict';
'require view';
'require rpc';
'require uci';

var callBoard = rpc.declare({ object: 'system', method: 'board', expect: { '': {} } });
var callInfo = rpc.declare({ object: 'system', method: 'info', expect: { '': {} } });
var callIfaces = rpc.declare({ object: 'network.interface', method: 'dump', expect: { interface: [] } });
var callLeases = rpc.declare({ object: 'luci-rpc', method: 'getDHCPLeases', expect: { '': {} } });

function ip4(i) {
	if (!i || !Array.isArray(i['ipv4-address']) || !i['ipv4-address'].length) return '—';
	return i['ipv4-address'][0].address || '—';
}

function uptimeText(s) {
	s = Number(s || 0);
	if (!s) return '—';
	var d = Math.floor(s / 86400);
	var h = Math.floor((s % 86400) / 3600);
	var m = Math.floor((s % 3600) / 60);
	if (d) return d + ' д ' + h + ' ч';
	if (h) return h + ' ч ' + m + ' мин';
	return m + ' мин';
}

function card(title, state, body, href, button) {
	var dot = state === true ? '🟢' : (state === false ? '🔴' : '🟡');
	return E('div', {
		'style': 'border:1px solid #444;border-radius:14px;padding:18px;min-height:145px;box-sizing:border-box'
	}, [
		E('div', {'style':'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'}, [
			E('strong', {'style':'font-size:18px'}, title),
			E('span', {'style':'font-size:16px'}, dot)
		]),
		E('div', {'style':'line-height:1.65'}, body),
		href ? E('div', {'style':'margin-top:14px'}, [
			E('a', {'class':'btn cbi-button cbi-button-neutral','href':href}, button || 'Открыть')
		]) : ''
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('network'),
			uci.load('wireless'),
			callBoard(),
			callInfo(),
			callIfaces(),
			callLeases()
		]);
	},

	render: function(data) {
		var board = data[2] || {};
		var info = data[3] || {};
		var ifaces = data[4] || [];
		var leases = data[5] || {};

		var wan = ifaces.find(function(i) { return i.interface === 'wan'; });

		var awgCfg = uci.sections('network', 'interface').find(function(s) {
			return s.proto === 'amneziawg';
		});
		var awgName = awgCfg ? awgCfg['.name'] : null;
		var awg = awgName ? ifaces.find(function(i) { return i.interface === awgName; }) : null;

		var wifiIfaces = uci.sections('wireless', 'wifi-iface').filter(function(s) {
			return s.disabled !== '1';
		});
		var wifiDevices = uci.sections('wireless', 'wifi-device').filter(function(s) {
			return s.disabled !== '1';
		});
		var lease4 = Array.isArray(leases.dhcp_leases) ? leases.dhcp_leases : [];

		var grid = E('div', {
			'style':'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:16px'
		}, [
			card('Интернет', wan ? !!wan.up : false, [
				E('div', {}, 'Статус: ' + (wan && wan.up ? 'подключён' : 'нет подключения')),
				E('div', {}, 'IPv4: ' + ip4(wan)),
				E('div', {}, 'Интерфейс: WAN')
			], L.url('admin/network/network'), 'Настроить интернет'),

			card('Wi-Fi', wifiIfaces.length > 0, [
				E('div', {}, 'Точек доступа: ' + wifiIfaces.length),
				E('div', {}, 'Радиомодулей: ' + wifiDevices.length),
				E('div', {}, 'Имя сети, пароль, каналы')
			], L.url('admin/network/wireless'), 'Настроить Wi-Fi'),

			card('AmneziaWG', awg ? !!awg.up : null, [
				E('div', {}, 'Интерфейс: ' + (awgName || 'не найден')),
				E('div', {}, 'Статус: ' + (awg ? (awg.up ? 'подключён' : 'отключён') : 'не настроен')),
				E('div', {}, 'VPN IPv4: ' + ip4(awg))
			], L.url('admin/simple/vpn'), 'Открыть VPN'),

			card('Устройства', null, [
				E('div', {}, 'DHCP-клиентов: ' + lease4.length),
				E('div', {}, 'Домашняя сеть'),
				E('div', {}, 'IP и имена устройств')
			], L.url('admin/simple/devices'), 'Показать устройства'),

			card('Система', true, [
				E('div', {}, board.model || board.system || 'OpenWrt'),
				E('div', {}, 'OpenWrt: ' + ((board.release && board.release.version) || '—')),
				E('div', {}, 'Работает: ' + uptimeText(info.uptime))
			], L.url('admin/system/system'), 'Настройки системы')
		]);

		return E('div', {}, [
			E('h2', {}, 'Домашний роутер'),
			E('p', {}, 'Основные функции без лишних технических параметров. Полная LuCI остаётся доступна через «Расширенные настройки».'),
			grid
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
EOF

cat > "$VIEWDIR/devices.js" <<'EOF'
'use strict';
'require view';
'require rpc';

var callLeases = rpc.declare({
	object: 'luci-rpc',
	method: 'getDHCPLeases',
	expect: { '': {} }
});

return view.extend({
	load: function() { return callLeases(); },

	render: function(data) {
		var rows = (data && Array.isArray(data.dhcp_leases)) ? data.dhcp_leases : [];
		var table = E('table', {'class':'table'}, [
			E('tr', {'class':'tr table-titles'}, [
				E('th', {'class':'th'}, 'Устройство'),
				E('th', {'class':'th'}, 'IP'),
				E('th', {'class':'th'}, 'MAC'),
				E('th', {'class':'th'}, 'Аренда')
			])
		]);

		if (!rows.length) {
			table.appendChild(E('tr', {'class':'tr'}, [
				E('td', {'class':'td','colspan':'4'}, 'Активные DHCP-клиенты не найдены')
			]));
		} else {
			rows.forEach(function(l) {
				table.appendChild(E('tr', {'class':'tr'}, [
					E('td', {'class':'td'}, l.hostname || 'Без имени'),
					E('td', {'class':'td'}, l.ipaddr || '—'),
					E('td', {'class':'td'}, l.macaddr || '—'),
					E('td', {'class':'td'}, Math.max(0, Math.floor(Number(l.expires || 0) / 60)) + ' мин')
				]));
			});
		}

		return E('div', {}, [
			E('h2', {}, 'Устройства'),
			E('p', {}, 'Устройства, получившие IPv4-адрес от роутера.'),
			table
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
EOF

cat > "$VIEWDIR/vpn.js" <<'EOF'
'use strict';
'require view';
'require rpc';
'require uci';

var callIfaces = rpc.declare({
	object: 'network.interface',
	method: 'dump',
	expect: { interface: [] }
});

function ip4(i) {
	if (!i || !Array.isArray(i['ipv4-address']) || !i['ipv4-address'].length) return '—';
	return i['ipv4-address'][0].address || '—';
}

return view.extend({
	load: function() {
		return Promise.all([uci.load('network'), callIfaces()]);
	},

	render: function(data) {
		var ifaces = data[1] || [];
		var cfgs = uci.sections('network', 'interface').filter(function(s) {
			return s.proto === 'amneziawg' || s.proto === 'wireguard';
		});
		var box = E('div', {'style':'display:grid;gap:14px;max-width:760px'});

		if (!cfgs.length) {
			box.appendChild(E('div', {'class':'alert-message warning'}, 'VPN-интерфейсы не найдены.'));
		}

		cfgs.forEach(function(c) {
			var name = c['.name'];
			var st = ifaces.find(function(i) { return i.interface === name; });

			box.appendChild(E('div', {'style':'border:1px solid #444;border-radius:14px;padding:18px'}, [
				E('h3', {}, name),
				E('div', {}, 'Тип: ' + (c.proto === 'amneziawg' ? 'AmneziaWG' : 'WireGuard')),
				E('div', {}, 'Статус: ' + (st && st.up ? '🟢 Подключён' : '🔴 Отключён')),
				E('div', {}, 'IPv4: ' + ip4(st)),
				E('div', {'style':'margin-top:14px'}, [
					E('a', {'class':'btn cbi-button cbi-button-neutral','href':L.url('admin/network/network')}, 'Настроить')
				])
			]));
		});

		return E('div', {}, [
			E('h2', {}, 'VPN'),
			E('p', {}, 'Простое состояние AmneziaWG/WireGuard. Маршрутизацию добавим отдельным модулем после проверки этой версии.'),
			box
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
EOF

rm -f /tmp/luci-indexcache 2>/dev/null || true
rm -rf /tmp/luci-modulecache/* 2>/dev/null || true
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart

echo
echo "OpenWrt Simple UI v0.1 installed."
echo "Press Ctrl+F5 and open: Простой режим -> Главная"
echo "WAN/Wi-Fi/AWG configuration was not changed."
