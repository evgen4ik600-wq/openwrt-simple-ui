'use strict';
'require view';
'require rpc';
var callStatus=rpc.declare({object:'luci.simpleui',method:'status',expect:{'':{}}});
var callIfaces=rpc.declare({object:'network.interface',method:'dump',expect:{interface:[]}});
function css(){if(!document.getElementById('simpleui-css')){document.head.appendChild(E('link',{id:'simpleui-css',rel:'stylesheet',href:L.resource('simpleui.css')}));}}
function row(a,b){return E('div',{'class':'simpleui-row'},[E('span',{},a),E('strong',{},String(b||'—'))]);}
return view.extend({load:function(){return Promise.all([callStatus(),callIfaces()]);},render:function(d){css();var s=d[0]||{},ifs=d[1]||[],wan=ifs.find(function(x){return x.interface==='wan';})||{};var dns=Array.isArray(wan['dns-server'])?wan['dns-server'].join(', '):'—';return E('div',{'class':'simpleui-wrap'},[
E('div',{'class':'simpleui-hero'},[E('div',{},[E('h2',{'class':'simpleui-title'},'Интернет'),E('div',{'class':'simpleui-sub'},'Состояние основного подключения и DNS.')])]),
E('div',{'class':'simpleui-grid'},[
 E('div',{'class':'simpleui-card'},[E('h3',{},'Основное подключение'),row('Статус',s.wan_up?'🟢 Подключено':'🔴 Нет связи'),row('IPv4',s.wan_ip),row('Устройство',wan.l3_device||wan.device||'wan'),row('DNS',dns),E('div',{'class':'simpleui-actions'},[E('a',{'class':'btn cbi-button cbi-button-neutral',href:L.url('admin/network/network')},'Расширенная настройка')])]),
 E('div',{'class':'simpleui-card'},[E('h3',{},'Резервирование'),row('Режим','Не настроено в простом режиме'),E('div',{'class':'simpleui-note'},'Multi-WAN добавим только если он действительно нужен — лишние службы на 16 МБ flash не ставим.')])
])]);},handleSaveApply:null,handleSave:null,handleReset:null});
