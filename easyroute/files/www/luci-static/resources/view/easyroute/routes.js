'use strict';
'require view';
'require rpc';
'require ui';

var callStatus = rpc.declare({ object: 'luci.easyroute', method: 'status', expect: { '': {} } });
var callList = rpc.declare({ object: 'luci.easyroute', method: 'list_rules', expect: { '': {} } });
var callGet = rpc.declare({ object: 'luci.easyroute', method: 'get_rule', params: [ 'id' ], expect: { '': {} } });
var callSave = rpc.declare({ object: 'luci.easyroute', method: 'save_rule', params: [ 'id', 'name', 'enabled', 'content' ], expect: { '': {} } });
var callDelete = rpc.declare({ object: 'luci.easyroute', method: 'delete_rule', params: [ 'id' ], expect: { '': {} } });
var callUpdateRule = rpc.declare({ object: 'luci.easyroute', method: 'update_rule', params: [ 'id' ], expect: { '': {} } });
var callUpdateAll = rpc.declare({ object: 'luci.easyroute', method: 'update_all', expect: { '': {} } });
var callApply = rpc.declare({ object: 'luci.easyroute', method: 'apply', expect: { '': {} } });

function vpnText(s) {
    if (!s.awg_installed) return 'компонент AmneziaWG не установлен';
    if (!s.awg_configured) return 'AmneziaWG установлен, подключение ещё не добавлено';
    if (s.handshake_age) return 'подключён, handshake ' + s.handshake_age + ' сек. назад';
    if (s.vpn_up) return 'интерфейс поднят, ждём handshake';
    return 'не подключён';
}

function notify(r) {
    ui.addNotification(null, E('p', {}, r.message || (r.ok ? 'Готово' : 'Ошибка')), r.ok ? 'info' : 'error');
}

function updateTime(ts) {
    ts = Number(ts || 0);
    if (!ts) return 'ещё не обновлялся';
    try {
        return new Date(ts * 1000).toLocaleString();
    } catch (e) {
        return String(ts);
    }
}

function intervalText(sec) {
    sec = Number(sec || 86400);
    if (sec === 21600) return '6 ч.';
    if (sec === 43200) return '12 ч.';
    if (sec === 172800) return '48 ч.';
    if (sec === 604800) return '7 дней';
    return '24 ч.';
}

function editor(rule) {
    rule = rule || {
        id: '',
        name: '',
        enabled: true,
        content: '',
        source_type: 'manual',
        source_url: '',
        auto_update: true,
        update_interval: 86400
    };

    var name = E('input', {
        'class': 'cbi-input-text',
        'style': 'width:100%',
        'value': rule.name || '',
        'placeholder': 'Например: YouTube'
    });

    var enabled = E('input', { 'type': 'checkbox' });
    enabled.checked = rule.enabled !== false;

    var source = E('select', { 'class': 'cbi-input-select', 'style': 'width:100%;max-width:440px' }, [
        E('option', { 'value': 'manual' }, 'Вручную / TXT'),
        E('option', { 'value': 'url' }, 'По ссылке (URL)')
    ]);
    source.value = rule.source_type === 'url' ? 'url' : 'manual';

    var text = E('textarea', {
        'class': 'cbi-input-textarea',
        'style': 'width:100%;min-height:280px;font-family:monospace',
        'placeholder': 'chatgpt.com\nopenai.com\n104.18.0.0/16'
    }, [ rule.content || '' ]);

    var file = E('input', { 'type': 'file', 'accept': '.txt,text/plain' });
    file.addEventListener('change', function() {
        if (!file.files || !file.files[0]) return;
        var f = file.files[0];
        if (f.size > 262144) {
            ui.addNotification(null, E('p', {}, 'Файл больше 256 КБ.'), 'error');
            file.value = '';
            return;
        }
        var rd = new FileReader();
        rd.onload = function() {
            text.value = String(rd.result || '');
            if (!name.value) name.value = f.name.replace(/\.txt$/i, '');
        };
        rd.readAsText(f);
    });

    var url = E('input', {
        'class': 'cbi-input-text',
        'style': 'width:100%',
        'value': rule.source_url || '',
        'placeholder': 'https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=youtube.com'
    });

    var autoUpdate = E('input', { 'type': 'checkbox' });
    autoUpdate.checked = rule.auto_update !== false;

    var interval = E('select', { 'class': 'cbi-input-select' }, [
        E('option', { 'value': '21600' }, 'каждые 6 часов'),
        E('option', { 'value': '43200' }, 'каждые 12 часов'),
        E('option', { 'value': '86400' }, 'каждые 24 часа'),
        E('option', { 'value': '172800' }, 'каждые 48 часов'),
        E('option', { 'value': '604800' }, 'раз в 7 дней')
    ]);
    interval.value = String(rule.update_interval || 86400);

    var manualBox = E('div', {}, [
        E('label', { 'class': 'cbi-value-title', 'style': 'display:block;margin-top:16px;margin-bottom:6px' }, 'Домены, IP и подсети — по одному в строке'),
        text,
        E('div', { 'style': 'margin-top:12px' }, [ E('span', {}, 'Загрузить TXT: '), file ]),
        E('div', { 'style': 'margin-top:8px;color:#777' }, 'Поддерживаются домены, IPv4/IPv6, CIDR, domain:/full:, wildcard *.domain и простые Keenetic route add ... mask ... строки.')
    ]);

    var urlBox = E('div', {}, [
        E('label', { 'class': 'cbi-value-title', 'style': 'display:block;margin-top:16px;margin-bottom:6px' }, 'Ссылка на TXT-список'),
        url,
        E('div', { 'style': 'margin-top:12px' }, [ autoUpdate, ' Обновлять автоматически ' , interval ]),
        E('div', { 'style': 'margin-top:8px;color:#777' }, 'EasyRoute скачивает список во временный файл, проверяет его и только потом заменяет рабочий. Если ссылка недоступна, старый список остаётся работать.'),
        rule.source_type === 'url' ? E('div', { 'style': 'margin-top:8px;color:#777' }, 'Последняя проверка: ' + updateTime(rule.last_update) + (rule.update_message ? ' · ' + rule.update_message : '')) : E('span')
    ]);

    function syncSource() {
        var isUrl = source.value === 'url';
        manualBox.style.display = isUrl ? 'none' : '';
        urlBox.style.display = isUrl ? '' : 'none';
    }
    source.addEventListener('change', syncSource);
    syncSource();

    var save = E('button', { 'class': 'btn cbi-button cbi-button-action', 'type': 'button' }, 'Сохранить и применить');
    save.addEventListener('click', function() {
        if (!name.value.trim()) {
            ui.addNotification(null, E('p', {}, 'Укажите название.'), 'error');
            return;
        }
        if (source.value === 'url' && !/^https?:\/\//i.test(url.value.trim())) {
            ui.addNotification(null, E('p', {}, 'Вставьте ссылку, начинающуюся с http:// или https://.'), 'error');
            return;
        }

        save.disabled = true;
        callSave(
            rule.id || '',
            name.value.trim(),
            enabled.checked,
            text.value,
            source.value,
            url.value.trim(),
            autoUpdate.checked,
            String(interval.value || '86400')
        ).then(function(r) {
            notify(r);
            if (r.ok) {
                ui.hideModal();
                window.setTimeout(function() { location.reload(); }, 700);
            } else {
                save.disabled = false;
            }
        }).catch(function(e) {
            notify({ ok: false, message: e.message });
            save.disabled = false;
        });
    });

    ui.showModal(rule.id ? 'Изменить список' : 'Добавить список', [
        E('div', { 'class': 'cbi-section' }, [
            E('label', { 'class': 'cbi-value-title', 'style': 'display:block;margin-bottom:6px' }, 'Название'),
            name,
            E('div', { 'style': 'margin-top:14px' }, [ enabled, ' Включено' ]),
            E('label', { 'class': 'cbi-value-title', 'style': 'display:block;margin-top:16px;margin-bottom:6px' }, 'Источник'),
            source,
            manualBox,
            urlBox
        ]),
        E('div', { 'class': 'right' }, [
            E('button', { 'class': 'btn', 'type': 'button', 'click': ui.hideModal }, 'Отмена'),
            ' ', save
        ])
    ]);
}

return view.extend({
    load: function() { return Promise.all([ callStatus(), callList() ]); },
    render: function(data) {
        var s = data[0] || {}, l = data[1] || {}, rules = l.rules || [];
        var urlCount = 0;
        rules.forEach(function(r) { if (r.source_type === 'url') urlCount++; });

        var add = E('button', { 'class': 'btn cbi-button cbi-button-add', 'type': 'button' }, '+ Добавить');
        add.addEventListener('click', function() { editor(null); });

        var apply = E('button', { 'class': 'btn cbi-button', 'type': 'button' }, 'Применить ещё раз');
        apply.addEventListener('click', function() {
            apply.disabled = true;
            callApply().then(function(r) {
                notify(r);
                apply.disabled = false;
            }).catch(function(e) {
                notify({ok:false,message:e.message});
                apply.disabled=false;
            });
        });

        var updateAll = E('button', { 'class': 'btn cbi-button', 'type': 'button' }, 'Обновить URL');
        updateAll.disabled = urlCount === 0;
        updateAll.addEventListener('click', function() {
            updateAll.disabled = true;
            callUpdateAll().then(function(r) {
                notify(r);
                if (r.ok) window.setTimeout(function(){ location.reload(); }, 700);
                else updateAll.disabled = false;
            }).catch(function(e) {
                notify({ok:false,message:e.message});
                updateAll.disabled=false;
            });
        });

        var table = E('table', { 'class': 'table cbi-section-table' }, [
            E('tr', { 'class': 'tr table-titles' }, [
                E('th', { 'class': 'th' }, 'Название'),
                E('th', { 'class': 'th' }, 'Записей'),
                E('th', { 'class': 'th' }, 'Маршрут'),
                E('th', { 'class': 'th' }, 'Состояние'),
                E('th', { 'class': 'th' }, '')
            ])
        ]);

        if (!rules.length) {
            table.appendChild(E('tr', { 'class': 'tr' }, [
                E('td', { 'class': 'td', 'colspan': '5' }, 'Списков пока нет.')
            ]));
        }

        rules.forEach(function(r) {
            var edit = E('button', { 'class': 'btn cbi-button cbi-button-edit', 'type': 'button' }, 'Изменить');
            edit.addEventListener('click', function() {
                callGet(r.id).then(function(x) { if (x.ok) editor(x); else notify(x); });
            });

            var del = E('button', { 'class': 'btn cbi-button cbi-button-remove', 'type': 'button' }, 'Удалить');
            del.addEventListener('click', function() {
                if (!confirm('Удалить список «' + r.name + '»?')) return;
                del.disabled = true;
                callDelete(r.id).then(function(x) {
                    notify(x);
                    if (x.ok) setTimeout(function(){ location.reload(); }, 400);
                    else del.disabled=false;
                });
            });

            var actions = [ edit ];
            if (r.source_type === 'url') {
                var upd = E('button', { 'class': 'btn cbi-button', 'type': 'button', 'style': 'margin-left:6px' }, 'Обновить');
                upd.addEventListener('click', function() {
                    upd.disabled = true;
                    callUpdateRule(r.id).then(function(x) {
                        notify(x);
                        if (x.ok) setTimeout(function(){ location.reload(); }, 700);
                        else upd.disabled=false;
                    }).catch(function(e) {
                        notify({ok:false,message:e.message});
                        upd.disabled=false;
                    });
                });
                actions.push(upd);
            }
            actions.push(' ', del);

            var title = [ E('div', {}, r.name) ];
            if (r.source_type === 'url') {
                title.push(E('div', { 'style': 'font-size:12px;color:#888;margin-top:4px' },
                    'URL · авто: ' + (r.auto_update ? intervalText(r.update_interval) : 'выкл.') +
                    ' · ' + updateTime(r.last_update)
                ));
                if (r.update_state === 'error' && r.update_message) {
                    title.push(E('div', { 'style': 'font-size:12px;margin-top:3px' }, 'Ошибка обновления: ' + r.update_message));
                }
            } else {
                title.push(E('div', { 'style': 'font-size:12px;color:#888;margin-top:4px' }, 'Вручную / TXT'));
            }

            table.appendChild(E('tr', { 'class': 'tr' }, [
                E('td', { 'class': 'td' }, title),
                E('td', { 'class': 'td' }, String(r.count || 0)),
                E('td', { 'class': 'td' }, s.interface || 'AWG'),
                E('td', { 'class': 'td' }, r.enabled ? 'Включено' : 'Выключено'),
                E('td', { 'class': 'td' }, actions)
            ]));
        });

        return E('div', {}, [
            E('h2', {}, 'Маршруты VPN'),
            E('p', {}, 'Добавьте домены/IP вручную или вставьте ссылку на TXT-список. Выбранный трафик пойдёт через AmneziaWG, остальной интернет останется через WAN.'),
            E('div', { 'class': 'cbi-section' }, [
                E('h3', {}, 'Состояние'),
                E('p', {}, [ E('strong', {}, (s.interface || 'AWG') + ': '), vpnText(s) ]),
                E('p', {}, 'Активных списков: ' + (s.active || 0) + ' · URL-списков: ' + urlCount + ' · доменов: ' + (s.domain_count || 0) + ' · IP/CIDR: ' + (s.ip_count || 0)),
                E('p', {}, 'Свободно во flash: ' + Math.round((Number(s.overlay_free_kb || 0))/1024*10)/10 + ' МБ')
            ]),
            E('div', { 'style': 'margin:12px 0' }, [ add, ' ', apply, ' ', updateAll ]),
            table,
            (Number(s.unsupported_count || 0) || Number(s.invalid_count || 0)) ?
                E('p', { 'style': 'margin-top:12px' }, 'Пропущено: неподдерживаемых строк — ' + (s.unsupported_count || 0) + ', некорректных — ' + (s.invalid_count || 0) + '.') :
                E('span')
        ]);
    },
    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
