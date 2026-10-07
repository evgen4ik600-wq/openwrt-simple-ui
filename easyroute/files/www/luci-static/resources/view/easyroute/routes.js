"use strict";
'require view';
'require rpc';
'require ui';
'require dom';

var callStatus = rpc.declare({ object: 'luci.easyroute', method: 'status', expect: { '': {} } });
var callList = rpc.declare({ object: 'luci.easyroute', method: 'list_rules', expect: { '': {} } });
var callGet = rpc.declare({ object: 'luci.easyroute', method: 'get_rule', params: [ 'id' ], expect: { '': {} } });
var callSave = rpc.declare({ object: 'luci.easyroute', method: 'save_rule', params: [ 'id','name','enabled','content','source_type','source_url','auto_update','update_interval','profile' ], expect: { '': {} } });
var callDelete = rpc.declare({ object: 'luci.easyroute', method: 'delete_rule', params: [ 'id' ], expect: { '': {} } });
var callUpdate = rpc.declare({ object: 'luci.easyroute', method: 'update_rule', params: [ 'id' ], expect: { '': {} } });
var callUpdateAll = rpc.declare({ object: 'luci.easyroute', method: 'update_all', expect: { '': {} } });
var callApply = rpc.declare({ object: 'luci.easyroute', method: 'apply', expect: { '': {} } });
var callProfiles = rpc.declare({ object: 'luci.easyroute', method: 'profiles', expect: { '': {} } });
var callSaveProfile = rpc.declare({ object: 'luci.easyroute', method: 'save_profile', params: [ 'id','name','interface','mark','table','enabled' ], expect: { '': {} } });
var callDeleteProfile = rpc.declare({ object: 'luci.easyroute', method: 'delete_profile', params: [ 'id' ], expect: { '': {} } });
var callDevices = rpc.declare({ object: 'luci.easyroute', method: 'devices', expect: { '': {} } });
var callSaveDevice = rpc.declare({ object: 'luci.easyroute', method: 'save_device', params: [ 'id','name','mac','profile','enabled' ], expect: { '': {} } });
var callDeleteDevice = rpc.declare({ object: 'luci.easyroute', method: 'delete_device', params: [ 'id' ], expect: { '': {} } });
var callTest = rpc.declare({ object: 'luci.easyroute', method: 'test_route', params: [ 'host','profile' ], expect: { '': {} } });
var callDiag = rpc.declare({ object: 'luci.easyroute', method: 'diagnostics', expect: { '': {} } });

function notify(r) {
    ui.addNotification(null, E('p', {}, r.message || (r.ok ? 'Готово' : 'Ошибка')), r.ok ? 'info' : 'error');
}
function bytes(v) {
    var n = Number(v || 0);
    if (!isFinite(n) || n < 0) n = 0;
    if (n < 1024) return Math.round(n) + ' Б';
    if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' КБ';
    if (n < 1073741824) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' МБ';
    return (n / 1073741824).toFixed(2) + ' ГБ';
}
function timeAgo(v) {
    var n = Number(v || 0);
    if (!n) return 'нет handshake';
    if (n < 60) return n + ' сек. назад';
    if (n < 3600) return Math.floor(n / 60) + ' мин. назад';
    return Math.floor(n / 3600) + ' ч. назад';
}
function intervalText(v) {
    v = Number(v || 86400);
    return v === 21600 ? '6 ч.' : v === 43200 ? '12 ч.' : v === 172800 ? '48 ч.' : v === 604800 ? '7 дней' : '24 ч.';
}
function selectProfile(profiles, value, includeAll) {
    var opts = [];
    if (includeAll) opts.push(E('option', { value: '' }, 'Все / по умолчанию'));
    profiles.forEach(function(p) {
        opts.push(E('option', { value: p.id }, (p.up ? '🟢 ' : '🔴 ') + p.name + ' (' + p.interface + ')'));
    });
    var s = E('select', { 'class': 'cbi-input-select', 'style': 'width:100%;max-width:520px' }, opts);
    s.value = value || '';
    return s;
}

var CATALOG = [
    ['YouTube','youtube.com','https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=youtube.com'],
    ['Google','google.com','https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=google.com'],
    ['Instagram','instagram.com','https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=instagram.com'],
    ['Discord','discord.com','https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=discord.com'],
    ['TikTok','tiktok.com','https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=tiktok.com'],
    ['Twitch','twitch.tv','https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=twitch.tv'],
    ['Spotify','spotify.com','https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=spotify.com'],
    ['ChatGPT / OpenAI','openai.com','https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=openai.com'],
    ['Claude','anthropic.com','https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=anthropic.com'],
    ['Facebook','facebook.com','https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=facebook.com']
];

function editor(rule, profiles) {
    rule = rule || { id:'',name:'',enabled:true,content:'',source_type:'manual',source_url:'',auto_update:true,update_interval:86400,profile:'' };
    var name = E('input', { 'class':'cbi-input-text','style':'width:100%','value':rule.name || '','placeholder':'Например: YouTube' });
    var enabled = E('input', { type:'checkbox' }); enabled.checked = rule.enabled !== false;
    var source = E('select', { 'class':'cbi-input-select' }, [
        E('option',{value:'url'},'По ссылке (URL)'),
        E('option',{value:'manual'},'Вручную / TXT')
    ]); source.value = rule.source_type === 'manual' ? 'manual' : 'url';
    var url = E('input',{class:'cbi-input-text',style:'width:100%',value:rule.source_url || '',placeholder:'https://iplist.opencck.org/?format=text&data=domains&wildcard=1&site=youtube.com'});
    var text = E('textarea',{class:'cbi-input-textarea',style:'width:100%;min-height:260px;font-family:monospace'},[rule.content || '']);
    var auto = E('input',{type:'checkbox'}); auto.checked = rule.auto_update !== false;
    var interval = E('select',{class:'cbi-input-select'},[
        E('option',{value:'21600'},'каждые 6 часов'),E('option',{value:'43200'},'каждые 12 часов'),
        E('option',{value:'86400'},'каждые 24 часа'),E('option',{value:'172800'},'каждые 48 часов'),E('option',{value:'604800'},'раз в 7 дней')
    ]); interval.value=String(rule.update_interval || 86400);
    var prof=selectProfile(profiles,rule.profile,true);
    var manual=E('div',{},[
        E('label',{style:'display:block;margin-top:14px'},'Домены, IP/CIDR — по одному в строке'),text,
        E('div',{style:'margin-top:8px;color:#777'},'Поддерживаются домены, wildcard *.domain, IPv4/IPv6, CIDR и route add ... mask ...')
    ]);
    var remote=E('div',{},[
        E('label',{style:'display:block;margin-top:14px'},'URL списка'),url,
        E('div',{style:'margin-top:10px'},[auto,' Автообновление ',interval]),
        E('div',{style:'margin-top:8px;color:#777'},'При ошибке загрузки предыдущий рабочий список не заменяется.')
    ]);
    function sync(){ var isUrl=source.value==='url'; remote.style.display=isUrl?'':'none'; manual.style.display=isUrl?'none':''; }
    source.addEventListener('change',sync); sync();
    var save=E('button',{class:'btn cbi-button cbi-button-action',type:'button'},'Сохранить и применить');
    save.addEventListener('click',function(){
        if(!name.value.trim()){ui.addNotification(null,E('p',{},'Укажите название.'),'error');return;}
        if(source.value==='url'&&!/^https?:\/\//i.test(url.value.trim())){ui.addNotification(null,E('p',{},'Некорректный URL.'),'error');return;}
        save.disabled=true;
        callSave(rule.id||'',name.value.trim(),enabled.checked,text.value,source.value,url.value.trim(),auto.checked,String(interval.value),prof.value).then(function(r){
            notify(r);if(r.ok){ui.hideModal();setTimeout(function(){location.reload();},600);}else save.disabled=false;
        }).catch(function(e){notify({ok:false,message:e.message});save.disabled=false;});
    });
    ui.showModal(rule.id?'Изменить маршрут':'Добавить маршрут',[
        E('div',{class:'cbi-section'},[
            E('label',{style:'display:block'},'Название'),name,
            E('div',{style:'margin-top:10px'},[enabled,' Включено']),
            E('label',{style:'display:block;margin-top:14px'},'VPN-профиль'),prof,
            E('label',{style:'display:block;margin-top:14px'},'Источник'),source,remote,manual
        ]),
        E('div',{class:'right'},[E('button',{class:'btn',type:'button',click:ui.hideModal},'Отмена'),' ',save])
    ]);
}

function profileEditor(p) {
    p=p||{id:'',name:'',interface:'AWG',mark:'0x66',table:166,enabled:true};
    var name=E('input',{class:'cbi-input-text',style:'width:100%',value:p.name||''});
    var iface=E('input',{class:'cbi-input-text',style:'width:100%',value:p.interface||'AWG',placeholder:'AWG'});
    var mark=E('input',{class:'cbi-input-text',style:'width:100%',value:p.mark||'0x66'});
    var table=E('input',{class:'cbi-input-text',style:'width:100%',value:String(p.table||166),type:'number',min:'1',max:'252'});
    var enabled=E('input',{type:'checkbox'});enabled.checked=p.enabled!==false;
    var save=E('button',{class:'btn cbi-button cbi-button-action',type:'button'},'Сохранить');
    save.addEventListener('click',function(){
        save.disabled=true;
        callSaveProfile(p.id||'',name.value.trim(),iface.value.trim(),mark.value.trim(),table.value,enabled.checked).then(function(r){notify(r);if(r.ok){ui.hideModal();setTimeout(function(){location.reload();},500);}else save.disabled=false;});
    });
    ui.showModal(p.id?'VPN-профиль':'Новый VPN-профиль',[
        E('div',{class:'cbi-section'},[
            E('label',{style:'display:block'},'Название'),name,
            E('label',{style:'display:block;margin-top:12px'},'Интерфейс AmneziaWG'),iface,
            E('label',{style:'display:block;margin-top:12px'},'Firewall mark'),mark,
            E('label',{style:'display:block;margin-top:12px'},'Таблица маршрутизации'),table,
            E('div',{style:'margin-top:12px'},[enabled,' Включено']),
            E('p',{style:'color:#777;margin-top:12px'},'Для второго/третьего туннеля используй уникальные mark и routing table.')
        ]),
        E('div',{class:'right'},[E('button',{class:'btn',type:'button',click:ui.hideModal},'Отмена'),' ',save])
    ]);
}

function deviceEditor(d,profiles){
    d=d||{id:'',name:'',mac:'',profile:'',enabled:true};
    var name=E('input',{class:'cbi-input-text',style:'width:100%',value:d.name||'',placeholder:'iPhone'});
    var mac=E('input',{class:'cbi-input-text',style:'width:100%',value:d.mac||'',placeholder:'AA:BB:CC:DD:EE:FF'});
    var prof=selectProfile(profiles,d.profile,false);
    var enabled=E('input',{type:'checkbox'});enabled.checked=d.enabled!==false;
    var save=E('button',{class:'btn cbi-button cbi-button-action',type:'button'},'Сохранить');
    save.addEventListener('click',function(){save.disabled=true;callSaveDevice(d.id||'',name.value.trim(),mac.value.trim(),prof.value,enabled.checked).then(function(r){notify(r);if(r.ok){ui.hideModal();setTimeout(function(){location.reload();},500);}else save.disabled=false;});});
    ui.showModal(d.id?'Изменить устройство':'Добавить устройство',[
        E('div',{class:'cbi-section'},[
            E('label',{style:'display:block'},'Название'),name,
            E('label',{style:'display:block;margin-top:12px'},'MAC-адрес'),mac,
            E('label',{style:'display:block;margin-top:12px'},'VPN-профиль'),prof,
            E('div',{style:'margin-top:12px'},[enabled,' Включено'])
        ]),
        E('div',{class:'right'},[E('button',{class:'btn',type:'button',click:ui.hideModal},'Отмена'),' ',save])
    ]);
}

function testBox(profiles){
    var host=E('input',{class:'cbi-input-text',style:'width:100%',placeholder:'youtube.com или 142.250.72.14'});
    var prof=selectProfile(profiles,'',true);
    var result=E('pre',{style:'white-space:pre-wrap;margin-top:12px'});
    var b=E('button',{class:'btn cbi-button cbi-button-action',type:'button'},'Проверить маршрут');
    b.addEventListener('click',function(){b.disabled=true;callTest(host.value.trim(),prof.value).then(function(r){result.textContent=r.ok?'Хост: '+r.host+'\\nIP: '+r.ip+'\\nVPN: '+r.profile+'\\nИнтерфейс: '+r.interface+'\\nMark: '+r.mark+'\\nRoute: '+r.route:r.message||'Ошибка';b.disabled=false;});});
    ui.showModal('Проверка маршрута',[E('div',{class:'cbi-section'},[E('label',{},'Домен или IP'),host,E('label',{style:'display:block;margin-top:12px'},'VPN-профиль'),prof,b,result])]);
}

function catalogBox(profiles){
    var list=E('div',{},[]);
    CATALOG.forEach(function(x){
        var p=selectProfile(profiles,'',false);
        var add=E('button',{class:'btn cbi-button',type:'button'},'Добавить');
        add.addEventListener('click',function(){
            var r={id:'',name:x[0],enabled:true,content:'',source_type:'url',source_url:x[2],auto_update:true,update_interval:86400,profile:p.value};
            ui.hideModal();editor(r,profiles);
        });
        list.appendChild(E('div',{style:'padding:9px 0;border-bottom:1px solid #444'},[E('strong',{},x[0]),' · ',E('span',{style:'color:#888'},x[1]),' ',p,' ',add]));
    });
    ui.showModal('Каталог OpenCCK',[E('p',{},'Готовые URL-источники. После добавления EasyRoute скачает список и будет обновлять его автоматически.'),list]);
}

function diagnosticsBox(){
    callDiag().then(function(r){
        var pre=E('pre',{style:'white-space:pre-wrap;max-height:65vh;overflow:auto'},[
            'OpenWrt: '+r.openwrt+'\\nAmneziaWG: '+r.awg_version+'\\nFirewall: '+r.firewall+'\\nDNSMasq: '+r.dnsmasq+'\\nИнтерфейс: '+r.iface+'\\n\\nIP rules:\\n'+r.ip_rules+'\\n\\nRoutes table 166:\\n'+r.routes+'\\n\\nEasyRoute nft objects: '+r.nft+'\\n\\nLog:\\n'+r.log
        ]);
        ui.showModal('Диагностика EasyRoute',[pre]);
    });
}

return view.extend({
    load:function(){return Promise.all([callStatus(),callList(),callProfiles(),callDevices()]);},
    render:function(data){
        var s=data[0]||{},l=data[1]||{},pr=(data[2]||{}).profiles||[],dv=(data[3]||{}).devices||[],rules=l.rules||[];
        var urlCount=rules.filter(function(r){return r.source_type==='url';}).length;
        var head=E('div',{class:'cbi-section'},[
            E('h2',{},'EasyRoute'),
            E('p',{},'Выборочная маршрутизация через AmneziaWG: домены, IP/CIDR и целые устройства. Остальной трафик остаётся через WAN.')
        ]);
        var vpnLine=(s.vpn_up?'🟢 подключён':'🔴 не подключён')+(s.handshake_age?' · handshake '+timeAgo(s.handshake_age):'')+' · ↓ '+bytes(s.rx_bytes)+' · ↑ '+bytes(s.tx_bytes);
        var status=E('div',{class:'cbi-section'},[
            E('h3',{},'Состояние'),
            E('p',{},[E('strong',{},(s.interface||'AWG')+': '),vpnLine]),
            E('p',{},'Активных списков: '+(s.active||0)+' · URL: '+urlCount+' · доменов: '+(s.domain_count||0)+' · IP/CIDR: '+(s.ip_count||0)),
            E('p',{},'Свободно flash: '+Math.round(Number(s.overlay_free_kb||0)/1024*10)/10+' МБ · последнее применение: '+(s.last_apply||'—'))
        ]);
        var add=E('button',{class:'btn cbi-button cbi-button-add',type:'button'},'+ Добавить маршрут');add.addEventListener('click',function(){editor(null,pr);});
        var catalog=E('button',{class:'btn cbi-button',type:'button'},'Каталог OpenCCK');catalog.addEventListener('click',function(){catalogBox(pr);});
        var update=E('button',{class:'btn cbi-button',type:'button'},'Обновить URL');update.disabled=!urlCount;update.addEventListener('click',function(){update.disabled=true;callUpdateAll().then(function(r){notify(r);setTimeout(function(){location.reload();},700);});});
        var apply=E('button',{class:'btn cbi-button',type:'button'},'Применить');apply.addEventListener('click',function(){apply.disabled=true;callApply().then(function(r){notify(r);apply.disabled=false;});});
        var test=E('button',{class:'btn cbi-button',type:'button'},'Проверить маршрут');test.addEventListener('click',function(){testBox(pr);});
        var diag=E('button',{class:'btn cbi-button',type:'button'},'Диагностика');diag.addEventListener('click',diagnosticsBox);
        var routeTable=E('table',{class:'table cbi-section-table'},[
            E('tr',{class:'tr table-titles'},[E('th',{class:'th'},'Название'),E('th',{class:'th'},'Записей'),E('th',{class:'th'},'VPN'),E('th',{class:'th'},'Источник'),E('th',{class:'th'},'')])
        ]);
        rules.forEach(function(r){
            var edit=E('button',{class:'btn cbi-button',type:'button'},'Изменить');edit.addEventListener('click',function(){callGet(r.id).then(function(x){if(x.ok)editor(x,pr);else notify(x);});});
            var del=E('button',{class:'btn cbi-button cbi-button-remove',type:'button'},'Удалить');del.addEventListener('click',function(){if(!confirm('Удалить «'+r.name+'»?'))return;callDelete(r.id).then(function(x){notify(x);if(x.ok)setTimeout(function(){location.reload();},400);});});
            var upd=E('span');if(r.source_type==='url'){var u=E('button',{class:'btn cbi-button',type:'button'},'Обновить');u.addEventListener('click',function(){u.disabled=true;callUpdate(r.id).then(function(x){notify(x);if(x.ok)setTimeout(function(){location.reload();},600);else u.disabled=false;});});upd=E('span',{},[' ',u]);}
            routeTable.appendChild(E('tr',{class:'tr'},[
                E('td',{class:'td'},[E('strong',{},r.name),E('div',{style:'font-size:12px;color:#888'},r.source_type==='url'?'URL · '+intervalText(r.update_interval):'Вручную')]),
                E('td',{class:'td'},String(r.count||0)),E('td',{class:'td'},r.profile?(pr.find(function(x){return x.id===r.profile})||{}).name||r.profile:'Основной'),
                E('td',{class:'td'},r.source_type==='url'?'URL':'TXT'),E('td',{class:'td'},[edit,upd,' ',del])
            ]));
        });
        var vp=E('div',{class:'cbi-section'},[E('h3',{},'VPN-профили'),E('p',{},'Можно использовать несколько AmneziaWG-интерфейсов. Каждый профиль получает свой mark и routing table.')]);
        pr.forEach(function(p){
            var e=E('button',{class:'btn cbi-button',type:'button'},'Изменить');e.addEventListener('click',function(){if(p.id==='__default'){ui.addNotification(null,E('p',{},'Основной профиль берётся из текущего AWG. Для второго VPN добавьте новый профиль.'),'info');}else profileEditor(p);});
            var d=E('span');if(p.id!=='__default'){var x=E('button',{class:'btn cbi-button cbi-button-remove',type:'button'},'Удалить');x.addEventListener('click',function(){if(confirm('Удалить VPN-профиль «'+p.name+'»?'))callDeleteProfile(p.id).then(function(r){notify(r);if(r.ok)setTimeout(function(){location.reload();},500);});});d=E('span',{},[' ',x]);}
            vp.appendChild(E('p',{},[(p.up?'🟢 ':'🔴 '),E('strong',{},p.name),' · ',p.interface,' · mark ',p.mark,' · table ',p.table,' ',e,d]));
        });
        var addVpn=E('button',{class:'btn cbi-button',type:'button'},'+ Добавить VPN');addVpn.addEventListener('click',function(){profileEditor(null);});vp.appendChild(addVpn);
        var devs=E('div',{class:'cbi-section'},[E('h3',{},'Устройства'),E('p',{},'Весь трафик устройства можно направить через выбранный AWG.')]);
        dv.forEach(function(d){var x=E('button',{class:'btn cbi-button cbi-button-remove',type:'button'},'Удалить');x.addEventListener('click',function(){callDeleteDevice(d.id).then(function(r){notify(r);if(r.ok)setTimeout(function(){location.reload();},400);});});devs.appendChild(E('p',{},[d.enabled?'🟢 ':'⚪ ',E('strong',{},d.name||d.mac),' · ',d.mac,' · ',d.profile||'Основной',' ',x]));});
        var addDev=E('button',{class:'btn cbi-button',type:'button'},'+ Добавить устройство');addDev.addEventListener('click',function(){deviceEditor(null,pr);});devs.appendChild(addDev);
        return E('div',{},[head,status,E('div',{style:'margin:12px 0'},[add,' ',catalog,' ',update,' ',apply,' ',test,' ',diag]),routeTable,vp,devs]);
    }
});
