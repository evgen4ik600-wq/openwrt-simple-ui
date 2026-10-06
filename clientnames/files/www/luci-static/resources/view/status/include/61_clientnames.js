'use strict';
'require baseclass';
'require rpc';
'require ui';

const callClientNamesList = rpc.declare({
	object: 'luci.clientnames',
	method: 'list',
	expect: { '': {} }
});

const callClientNamesSet = rpc.declare({
	object: 'luci.clientnames',
	method: 'set',
	params: [ 'mac', 'name' ],
	expect: { '': {} }
});

return baseclass.extend({
	title: 'Client names helper',

	load() {
		return L.resolveDefault(callClientNamesList(), { aliases: {} });
	},

	render(data) {
		this.aliases = (data && data.aliases) ? data.aliases : {};
		this.scheduleEnhance(6);
		return null;
	},

	scheduleEnhance(tries) {
		window.setTimeout(L.bind(function(n) {
			if (!this.enhance() && n > 0)
				this.scheduleEnhance(n - 1);
		}, this, tries), 80);
	},

	renderHostCell(cell, mac, alias) {
		if (!cell || cell.getAttribute('data-clientnames-enhanced') === '1')
			return;

		cell.setAttribute('data-clientnames-enhanced', '1');

		const original = E('span');
		while (cell.firstChild)
			original.appendChild(cell.firstChild);

		const button = E('button', {
			'class': 'cbi-button cbi-button-edit',
			'style': 'margin-left:.45em;padding:.15em .45em;min-width:auto',
			'title': 'Переименовать устройство',
			'click': L.bind(this.handleRename, this, mac, alias || '')
		}, [ '✎' ]);

		if (alias) {
			const originalText = (original.textContent || '').trim();

			cell.appendChild(E('div', {
				'style': 'display:flex;align-items:center;gap:.25em'
			}, [
				E('strong', {}, [ alias ]),
				button
			]));

			if (originalText && originalText !== '?' && originalText !== alias)
				cell.appendChild(E('div', {
					'class': 'hide-xs',
					'style': 'opacity:.65;font-size:.88em;margin-top:.2em'
				}, [ original ]));
		}
		else {
			cell.appendChild(E('div', {
				'style': 'display:flex;align-items:center;gap:.25em'
			}, [ original, button ]));
		}
	},

	enhance() {
		const table = document.getElementById('wifi_assoclist_table');
		if (!table)
			return false;

		const rows = table.querySelectorAll('tr.tr:not(.table-titles)');
		for (let i = 0; i < rows.length; i++) {
			const cells = rows[i].children;
			if (cells.length < 3)
				continue;

			const mac = (cells[1].textContent || '').trim().toUpperCase();
			if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(mac))
				continue;

			this.renderHostCell(cells[2], mac, this.aliases[mac] || '');
		}

		return true;
	},

	handleRename(mac, alias, ev) {
		if (ev) {
			ev.preventDefault();
			ev.stopPropagation();
		}

		const input = E('input', {
			'class': 'cbi-input-text',
			'type': 'text',
			'maxlength': '80',
			'value': alias || '',
			'placeholder': 'Например: iPhone Евгения',
			'style': 'width:100%'
		});

		const save = E('button', {
			'class': 'cbi-button cbi-button-positive important'
		}, [ 'Сохранить' ]);

		save.addEventListener('click', L.bind(function() {
			const name = input.value.trim();
			save.disabled = true;
			save.classList.add('spinning');

			callClientNamesSet(mac, name).then(L.bind(function(res) {
				if (!res || res.ok !== true)
					throw new Error((res && res.message) || 'Не удалось сохранить имя');

				ui.hideModal();
				window.location.reload();
			}, this)).catch(function(err) {
				save.disabled = false;
				save.classList.remove('spinning');
				ui.addNotification(null, E('p', {}, [ err.message || String(err) ]), 'error');
			});
		}, this));

		ui.showModal('Имя устройства', [
			E('p', {}, [
				'MAC: ',
				E('strong', {}, [ mac ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, [ 'Пользовательское имя' ]),
				E('div', { 'class': 'cbi-value-field' }, [ input ])
			]),
			E('p', { 'style': 'opacity:.7;font-size:.9em' }, [
				'Очистите поле и сохраните, чтобы удалить пользовательское имя.'
			]),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'cbi-button',
					'click': function(e) {
						e.preventDefault();
						ui.hideModal();
					}
				}, [ 'Отмена' ]),
				' ',
				save
			])
		]);

		window.setTimeout(function() {
			input.focus();
			input.select();
		}, 50);
	}
});
