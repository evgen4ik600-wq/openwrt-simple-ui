'use strict';
'require view';
'require form';
'require uci';

function css(){if(!document.getElementById('simpleui-css'))document.head.appendChild(E('link',{id:'simpleui-css',rel:'stylesheet',href:L.resource('simpleui.css')}));}

return view.extend({
 load:function(){return uci.load('wireless');},
 render:function(){css();var m=new form.Map('wireless','Wi-Fi','Только основные параметры. Радиоканалы, мощность и roaming остаются в расширенных настройках.');
  var s=m.section(form.TypedSection,'wifi-iface','Домашние точки доступа');s.anonymous=true;s.addremove=false;s.filter=function(id){return (uci.get('wireless',id,'mode')||'ap')==='ap';};
  var o=s.option(form.Value,'ssid','Имя Wi-Fi сети');o.rmempty=false;
  o=s.option(form.ListValue,'encryption','Защита');o.value('psk2','WPA2-PSK');o.value('sae-mixed','WPA2/WPA3');o.value('sae','WPA3-SAE');o.value('none','Без пароля');
  o=s.option(form.Value,'key','Пароль');o.password=true;o.rmempty=false;o.depends('encryption','psk2');o.depends('encryption','sae-mixed');o.depends('encryption','sae');
  o=s.option(form.Flag,'disabled','Отключить эту точку');o.enabled='1';o.disabled='0';o.rmempty=false;
  return m.render().then(function(el){return E('div',{'class':'simpleui-wrap'},[E('div',{'class':'simpleui-hero'},[E('div',{},[E('h2',{'class':'simpleui-title'},'Wi-Fi'),E('div',{'class':'simpleui-sub'},'Название сети, пароль и включение точек доступа.')])]),el,E('div',{'class':'simpleui-actions'},[E('a',{'class':'btn cbi-button cbi-button-neutral',href:L.url('admin/network/wireless')},'Расширенные настройки Wi-Fi')])]);});
 }
});
