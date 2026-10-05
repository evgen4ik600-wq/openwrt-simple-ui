'use strict';
'require view';
'require rpc';
var callStatus=rpc.declare({object:'luci.simpleui',method:'status',expect:{'':{}}});
var callInfo=rpc.declare({object:'system',method:'info',expect:{'':{}}});
function css(){if(!document.getElementById('simpleui-css'))document.head.appendChild(E('link',{id:'simpleui-css',rel:'stylesheet',href:L.resource('simpleui.css')}));}
function row(a,b){return E('div',{'class':'simpleui-row'},[E('span',{},a),E('strong',{},String(b||'—'))]);}function mb(k){var n=Number(k||0);return n?Math.round(n/1024)+' МБ':'—';}
return view.extend({load:function(){return Promise.all([callStatus(),callInfo()]);},render:function(d){css();var s=d[0]||{},i=d[1]||{};var up=Number(i.uptime||0),days=Math.floor(up/86400),hrs=Math.floor((up%86400)/3600);return E('div',{'class':'simpleui-wrap'},[E('div',{'class':'simpleui-hero'},[E('div',{},[E('h2',{'class':'simpleui-title'},'Система'),E('div',{'class':'simpleui-sub'},'Состояние OpenWrt и памяти роутера.')])]),E('div',{'class':'simpleui-grid'},[
E('div',{'class':'simpleui-card'},[E('h3',{},'Роутер'),row('Модель',s.model),row('OpenWrt',s.release),row('Revision',s.revision),row('Время работы',days+' д '+hrs+' ч')]),
E('div',{'class':'simpleui-card'},[E('h3',{},'Память'),row('RAM всего',mb(s.mem_total_kb)),row('RAM свободно',mb(s.mem_available_kb)),row('Flash свободно',mb(s.overlay_free_kb)),E('div',{'class':'simpleui-note'},'GeoSite/GeoIP списки хранятся в /tmp (RAM), чтобы не забивать 16 МБ flash.')])
]),E('div',{'class':'simpleui-actions'},[E('a',{'class':'btn cbi-button cbi-button-neutral',href:L.url('admin/system/system')},'Расширенные настройки системы'),E('a',{'class':'btn cbi-button cbi-button-neutral',href:L.url('admin/system/flash')},'Резервная копия / прошивка')])]);},handleSaveApply:null,handleSave:null,handleReset:null});
