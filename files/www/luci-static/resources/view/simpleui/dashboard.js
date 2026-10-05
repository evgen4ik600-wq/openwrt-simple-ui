'use strict';
'require view';
'require rpc';

var callStatus = rpc.declare({ object:'luci.simpleui', method:'status', expect:{'':{}} });
var callLeases = rpc.declare({ object:'luci-rpc', method:'getDHCPLeases', expect:{'':{}} });

function css(){if(!document.getElementById('simpleui-css')){var l=E('link',{id:'simpleui-css',rel:'stylesheet',href:L.resource('simpleui.css')});document.head.appendChild(l);}}
function dot(v){return E('span',{'class':'simpleui-dot '+(v===true?'ok':v===false?'bad':'')});}
function st(v,ok,bad){return E('span',{'class':'simpleui-status'},[dot(v),v===true?ok:v===false?bad:'Неизвестно']);}
function row(a,b){return E('div',{'class':'simpleui-row'},[E('span',{},a),E('strong',{},String(b==null?'—':b))]);}
function card(title,children,href,label){return E('div',{'class':'simpleui-card'},[E('h3',{},title),...children,href?E('div',{'class':'simpleui-actions'},[E('a',{'class':'btn cbi-button cbi-button-neutral',href:href},label||'Открыть')]):'']);}
function mib(k){var n=Number(k||0);return n?Math.round(n/1024)+' МБ':'—';}

return view.extend({
 load:function(){return Promise.all([callStatus(),callLeases()]);},
 render:function(data){css();var s=data[0]||{},l=data[1]||{},leases=Array.isArray(l.dhcp_leases)?l.dhcp_leases:[];
  return E('div',{'class':'simpleui-wrap'},[
   E('div',{'class':'simpleui-hero'},[E('div',{},[E('h2',{'class':'simpleui-title'},'Домашняя сеть'),E('div',{'class':'simpleui-sub'},'Простой режим OpenWrt — основные функции без технического шума.')])]),
   E('div',{'class':'simpleui-grid'},[
    card('Интернет',[row('Состояние',st(s.wan_up,'Работает','Нет связи')),row('WAN IPv4',s.wan_ip||'—')],L.url('admin/simple/internet'),'Интернет'),
    card('Wi-Fi',[row('Состояние','Управляется OpenWrt'),row('Настройки','Имя сети и пароль')],L.url('admin/simple/wifi'),'Wi-Fi'),
    card('Устройства',[E('div',{'class':'simpleui-big'},String(leases.length)),row('DHCP-клиенты','в сети')],L.url('admin/simple/devices'),'Устройства'),
    card('AmneziaWG',[row('Интерфейс',s.vpn||'—'),row('Состояние',st(s.vpn_up,'Подключён','Отключён')),row('VPN IPv4',s.vpn_ip||'—')],L.url('admin/simple/routing'),'VPN и маршруты'),
    card('Умная маршрутизация',[row('Состояние',st(s.routing_active,'Активна','Не активна')),row('GeoSite доменов',s.domain_count||'0'),row('GeoIP сетей',s.ip_count||'0')],L.url('admin/simple/routing'),'Настроить'),
    card('Система',[row('Модель',s.model||'OpenWrt'),row('Версия',s.release||'—'),row('Свободно RAM',mib(s.mem_available_kb)),row('Свободно flash',mib(s.overlay_free_kb))],L.url('admin/simple/system'),'Система')
   ])
  ]);
 },handleSaveApply:null,handleSave:null,handleReset:null
});
