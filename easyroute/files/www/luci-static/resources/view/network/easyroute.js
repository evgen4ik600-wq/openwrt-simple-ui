'use strict';
'require view';
'require uci';
'require ui';
'require fs';

const MAX_FILE_SIZE = 512 * 1024;
const MAX_ENTRIES = 10000;

function splitEntries(value) {
	return String(value || '').trim().split(/\s+/).filter(Boolean);
}

function ipv4Ok(s) {
	let m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/);
	if (!m)
		return false;
	for (let i = 1; i <= 4; i++)
		if (+m[i] > 255)
			return false;
	return m[5] == null || +m[5] <= 32;
}

function ipv6Ok(s) {
	let p = s.split('/'), addr = p[0];
	if (p.length > 2 || addr.indexOf(':') < 0)
		return false;
	if (p.length === 2 && (!/^\d{1,3}$/.test(p[1]) || +p[1] > 128))
		return false;
	if (!/^[0-9a-fA-F:]+$/.test(addr) || (addr.match(/::/g) || []).length > 1)
		return false;
	let compressed = addr.indexOf('::') >= 0;
	let halves = addr.split('::');
	let left = halves[0] ? halves[0].split(':') : [];
	let right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
	let validPart = function(x) { return /^[0-9a-fA-F]{1,4}$/.test(x); };
	if (!left.every(validPart) || !right.every(validPart))
		return false;
	return compressed ? (left.length + right.length < 8) : (left.length === 8);
}

function domainOk(s) {
	if (/^\d+(?:\.\d+){3}$/.test(s))
		return false;
	if (s.length < 1 || s.length > 253 || /[^a-zA-Z0-9._-]/.test(s))
		return false;
	return s.split('.').every(function(part) {
		return part.length > 0 && part.length <= 63 && /^[a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?$/.test(part);
	});
}

function maskToPrefix(mask) {
	let parts = mask.split('.');
	if (parts.length !== 4)
		return null;
	let bits = { '255':8, '254':7, '252':6, '248':5, '240':4, '224':3, '192':2, '128':1, '0':0 };
	let prefix = 0, zeroSeen = false;
	for (let i = 0; i < 4; i++) {
		if (bits[parts[i]] == null)
			return null;
		if (zeroSeen && bits[parts[i]] !== 0)
			return null;
		prefix += bits[parts[i]];
		if (bits[parts[i]] < 8)
			zeroSeen = true;
	}
	return prefix;
}

function normaliseText(text) {
	let out = [], skipped = [], seen = Object.create(null);
	let lines = String(text || '').replace(/\r/g, '').split('\n');

	for (let n = 0; n < lines.length; n++) {
		let raw = lines[n].trim();
		if (!raw || raw.charAt(0) === '#')
			continue;

		let comment = raw.indexOf('#');
		if (comment >= 0)
			raw = raw.slice(0, comment).trim();
		if (!raw)
			continue;

		let rm = raw.match(/^route\s+add\s+(\d{1,3}(?:\.\d{1,3}){3})\s+mask\s+(\d{1,3}(?:\.\d{1,3}){3})(?:\s+.*)?$/i);
		if (rm) {
			let prefix = maskToPrefix(rm[2]);
			let cidr = prefix == null ? null : rm[1] + '/' + prefix;
			if (cidr && ipv4Ok(cidr) && !seen[cidr]) {
				seen[cidr] = true;
				out.push(cidr);
			} else if (!cidr) {
				skipped.push((n + 1) + ': ' + lines[n]);
			}
			continue;
		}

		if (/^(regexp|keyword|include):/i.test(raw)) {
			skipped.push((n + 1) + ': ' + lines[n]);
			continue;
		}

		raw = raw.replace(/^(domain|full):/i, '').trim();
		if (/^https?:\/\//i.test(raw)) {
			try { raw = new URL(raw).hostname; }
			catch (e) { skipped.push((n + 1) + ': ' + lines[n]); continue; }
		}

		/* V2Fly attributes such as @ads follow the actual domain. */
		raw = raw.split(/\s+/)[0].replace(/^\*\./, '').replace(/\.$/, '');
		if (!raw)
			continue;

		if (!(ipv4Ok(raw) || ipv6Ok(raw) || domainOk(raw))) {
			skipped.push((n + 1) + ': ' + lines[n]);
			continue;
		}

		if (!seen[raw]) {
			seen[raw] = true;
			out.push(raw);
		}
	}

	return { entries: out, skipped: skipped };
}

function fmtAge(ts) {
	if (!ts)
		return 'нет handshake';
	let age = Math.max(0, Math.floor(Date.now() / 1000) - ts);
	if (age < 60) return age + ' сек назад';
	if (age < 3600) return Math.floor(age / 60) + ' мин назад';
	return Math.floor(age / 3600) + ' ч назад';
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(uci.load('pbr'), null),
			L.resolveDefault(fs.exec('/usr/bin/awg', [ 'show', 'AWG', 'latest-handshakes' ]), null),
			L.resolveDefault(fs.exec('/etc/init.d/pbr', [ 'status' ]), null)
		]);
	},

	getRules: function() {
		return uci.sections('pbr', 'policy').filter(function(s) {
			return s.easyroute === '1';
		});
	},

	getAwgStatus: function(result) {
		if (!result || result.code !== 0)
			return { ok: false, text: 'AWG не найден' };
		let max = 0;
		String(result.stdout || '').trim().split('\n').forEach(function(line) {
			let p = line.trim().split(/\s+/);
			let ts = +(p[p.length - 1] || 0);
			if (ts > max) max = ts;
		});
		return { ok: max > 0, text: max > 0 ? 'AWG: подключён, ' + fmtAge(max) : 'AWG: интерфейс есть, handshake нет' };
	},

	applyChanges: function() {
		ui.showModal('Применение', [ E('p', { 'class': 'spinning' }, 'Сохраняю правила и перезапускаю маршрутизацию…') ]);
		return uci.save()
			.then(function() { return ui.changes.apply(true); })
			.then(function() { return fs.exec('/etc/init.d/pbr', [ 'restart' ]); })
			.then(function(r) {
				ui.hideModal();
				if (r && r.code !== 0)
					throw new Error((r.stderr || r.stdout || 'pbr restart failed').trim());
				window.location.reload();
			})
			.catch(function(err) {
				ui.hideModal();
				ui.addNotification(null, E('p', {}, 'Не удалось применить: ' + err), 'danger');
			});
	},

	openEditor: function(section, initialText, initialName) {
		let isNew = !section;
		let name = initialName || (section ? section.name : '') || '';
		let text = initialText != null ? initialText : (section ? splitEntries(section.dest_addr).join('\n') : '');
		let target = section ? (section.interface || 'AWG') : 'AWG';
		let enabled = !section || section.enabled !== '0';

		let nameInput = E('input', { 'class': 'cbi-input-text', 'style': 'width:100%', 'value': name, 'placeholder': 'Например: ИИ' });
		let listInput = E('textarea', { 'class': 'cbi-input-textarea', 'style': 'width:100%;min-height:260px', 'placeholder': 'chatgpt.com\nopenai.com\n104.18.0.0/16' }, text);
		let routeSelect = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': 'AWG', 'selected': target === 'AWG' ? '' : null }, 'AWG (AmneziaWG)'),
			E('option', { 'value': 'wan', 'selected': target === 'wan' ? '' : null }, 'WAN (обычный интернет)')
		]);
		let enabledInput = E('input', { 'type': 'checkbox', 'checked': enabled ? '' : null });
		let info = E('div', { 'style': 'margin-top:.5em;color:#777' }, 'По одной записи в строке. Поддерживаются домены, IPv4/IPv6 и CIDR.');

		ui.showModal(isNew ? 'Новый маршрут' : 'Редактирование: ' + name, [
			E('div', { 'class': 'cbi-section' }, [
				E('label', { 'class': 'cbi-value-title' }, 'Название'),
				nameInput,
				E('br'), E('br'),
				E('label', { 'class': 'cbi-value-title' }, 'Домены / IP / подсети'),
				listInput,
				info,
				E('br'),
				E('label', { 'class': 'cbi-value-title' }, 'Маршрут'),
				routeSelect,
				E('br'), E('br'),
				E('label', {}, [ enabledInput, ' Включено' ])
			]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, 'Отмена'),
				' ',
				E('button', { 'class': 'btn cbi-button-positive', 'click': L.bind(function() {
					let parsed = normaliseText(listInput.value);
					let nm = nameInput.value.trim();
					if (!nm) {
						ui.addNotification(null, E('p', {}, 'Введите название.'), 'warning');
						return;
					}
					if (!parsed.entries.length) {
						ui.addNotification(null, E('p', {}, 'В списке нет ни одной поддерживаемой записи.'), 'warning');
						return;
					}
					if (parsed.entries.length > MAX_ENTRIES) {
						ui.addNotification(null, E('p', {}, 'Слишком большой список: максимум ' + MAX_ENTRIES + ' записей.'), 'warning');
						return;
					}
					let sid = section ? section['.name'] : uci.add('pbr', 'policy');
					uci.set('pbr', sid, 'easyroute', '1');
					uci.set('pbr', sid, 'name', nm);
					uci.set('pbr', sid, 'interface', routeSelect.value);
					uci.set('pbr', sid, 'dest_addr', parsed.entries.join(' '));
					uci.set('pbr', sid, 'enabled', enabledInput.checked ? '1' : '0');
					ui.hideModal();
					if (parsed.skipped.length)
						ui.addNotification(null, E('p', {}, 'Пропущено неподдерживаемых строк: ' + parsed.skipped.length + '. regexp:, keyword: и include: не импортируются.'), 'warning');
					return this.applyChanges();
				}, this) }, 'Сохранить')
			])
		]);
	},

	importTxt: function() {
		let input = E('input', { 'type': 'file', 'accept': '.txt,text/plain' });
		input.addEventListener('change', L.bind(function() {
			let file = input.files && input.files[0];
			if (!file) return;
			if (file.size > MAX_FILE_SIZE) {
				ui.addNotification(null, E('p', {}, 'Файл слишком большой. Максимум 512 КБ.'), 'warning');
				input.value = '';
				return;
			}
			let reader = new FileReader();
			reader.onload = L.bind(function() {
				let base = file.name.replace(/\.txt$/i, '').replace(/[_-]+/g, ' ').trim();
				this.openEditor(null, String(reader.result || ''), base || 'Новый список');
			}, this);
			reader.readAsText(file, 'UTF-8');
		}, this));
		input.click();
	},

	toggleRule: function(section, checkbox) {
		uci.set('pbr', section['.name'], 'enabled', checkbox.checked ? '1' : '0');
		return this.applyChanges();
	},

	deleteRule: function(section) {
		ui.showModal('Удалить маршрут?', [
			E('p', {}, 'Будет удалён список «' + (section.name || section['.name']) + '».'),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, 'Отмена'), ' ',
				E('button', { 'class': 'btn cbi-button-negative', 'click': L.bind(function() {
					uci.remove('pbr', section['.name']);
					ui.hideModal();
					return this.applyChanges();
				}, this) }, 'Удалить')
			])
		]);
	},

	render: function(data) {
		let rules = this.getRules();
		let awg = this.getAwgStatus(data[1]);
		let pbrOk = !!data[2] && data[2].code === 0;

		let table = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, 'Название'),
				E('th', { 'class': 'th' }, 'Записей'),
				E('th', { 'class': 'th' }, 'Маршрут'),
				E('th', { 'class': 'th' }, 'Вкл'),
				E('th', { 'class': 'th' }, '')
			])
		]);

		if (!rules.length)
			table.appendChild(E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td', 'colspan': '5' }, 'Правил пока нет.') ]));

		rules.forEach(L.bind(function(s) {
			let toggle = E('input', { 'type': 'checkbox', 'checked': s.enabled !== '0' ? '' : null });
			toggle.addEventListener('change', L.bind(function() { this.toggleRule(s, toggle); }, this));
			table.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, s.name || s['.name']),
				E('td', { 'class': 'td' }, String(splitEntries(s.dest_addr).length)),
				E('td', { 'class': 'td' }, s.interface === 'wan' ? 'WAN' : 'AWG'),
				E('td', { 'class': 'td' }, toggle),
				E('td', { 'class': 'td right' }, [
					E('button', { 'class': 'btn cbi-button-edit', 'click': L.bind(function() { this.openEditor(s); }, this) }, 'Изменить'),
					' ',
					E('button', { 'class': 'btn cbi-button-negative', 'click': L.bind(function() { this.deleteRule(s); }, this) }, 'Удалить')
				])
			]));
		}, this));

		return E('div', {}, [
			E('h2', {}, 'Маршруты через VPN'),
			E('p', {}, [
				E('strong', {}, awg.text),
				' · PBR: ' + (pbrOk ? 'работает' : 'не запущен')
			]),
			E('p', {}, 'Добавьте домены или IP-адреса и выберите, куда их направлять.'),
			E('div', { 'style': 'margin-bottom:1em' }, [
				E('button', { 'class': 'btn cbi-button-add', 'click': L.bind(function() { this.openEditor(null, '', ''); }, this) }, '+ Добавить'),
				' ',
				E('button', { 'class': 'btn', 'click': L.bind(this.importTxt, this) }, 'Загрузить TXT')
			]),
			table,
			E('p', { 'style': 'margin-top:1em;color:#777' }, 'TXT: по одной записи в строке. Поддерживаются обычные домены, IPv4/IPv6, CIDR, domain:/full: из V2Fly и route add ... mask ... из списков Keenetic.')
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
