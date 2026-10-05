'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';

var callStatus=rpc.declare({object:'luci.simpleui',method:'status',expect:{'':{}}});
var callApply=rpc.declare({object:'luci.simpleui',method:'apply',expect:{'':{}}});
var callUpdate=rpc.declare({object:'luci.simpleui',method:'update',expect:{'':{}}});
var callCustom=rpc.declare({object:'luci.simpleui',method:'get_custom',expect:{'':{}}});
var callSaveCustom=rpc.declare({object:'luci.simpleui',method:'save_custom',params:['type','content'],expect:{'':{}}});

function css(){if(!document.getElementById('simpleui-css'))document.head.appendChild(E('link',{id:'simpleui-css',rel:'stylesheet',href:L.resource('simpleui.css')}));}
function row(a,b){return E('div',{'class':'simpleui-row'},[E('span',{},a),E('strong',{},String(b==null?'—':b))]);}
function statusText(s){return s.routing_active?'🟢 Работает через '+(s.vpn||'VPN'):(s.routing_enabled?'🟡 Включено, но сейчас не активно':'⚪ Выключено');}

var GS=[
 ['youtube','YouTube'],['instagram','Instagram'],['discord','Discord'],['openai','OpenAI / ChatGPT'],['telegram','Telegram'],['tiktok','TikTok'],['github','GitHub'],['google','Google'],['twitter','X / Twitter'],['reddit','Reddit'],['netflix','Netflix'],['spotify','Spotify'],['twitch','Twitch'],['facebook','Facebook'],['whatsapp','WhatsApp'],['microsoft','Microsoft'],['apple','Apple'],['cloudflare','Cloudflare'],['category-ai-!cn','AI-сервисы']
];
var GI=[
 ['telegram','Telegram IP'],['facebook','Facebook / Instagram IP'],['twitter','X / Twitter IP'],['netflix','Netflix IP'],['google','Google / YouTube IP'],['cloudflare','Cloudflare IP'],['ru','Россия — большой список'],['de','Германия — большой список'],['nl','Нидерланды — большой список'],['us','США — очень большой список']
];

return view.extend({
 load:function(){return Promise.all([uci.load('simpleui'),uci.load('network'),callStatus(),callCustom()]);},
 render:function(data){css();var stat=data[2]||{},custom=data[3]||{};
  var m=new form.Map('simpleui','VPN и маршруты','GeoSite/GeoIP без PassWall, sing-box и PBR. Для мобильных приложений включается IP-резерв: YouTube использует Google IP, Instagram — Facebook IP. Списки хранятся только в RAM.');
  var s=m.section(form.NamedSection,'main','main','Основное');s.anonymous=true;s.addremove=false;
  var o=s.option(form.Flag,'enabled','Умная маршрутизация');o.rmempty=false;
  o=s.option(form.ListValue,'vpn_interface','VPN-интерфейс');o.rmempty=false;
  uci.sections('network','interface').forEach(function(sec){var p=sec.proto||'',n=sec['.name'];if(p==='amneziawg'||p==='wireguard')o.value(n,n+' ('+(p==='amneziawg'?'AmneziaWG':'WireGuard')+')');});
  o=s.option(form.Flag,'dns_intercept','Перехватывать обычный DNS');o.rmempty=false;o.description='Перенаправляет DNS TCP/UDP 53 клиентов на роутер. DoH через HTTPS не перехватывается.';
  o=s.option(form.Flag,'auto_update','Обновлять списки раз в сутки');o.rmempty=false;

  s=m.section(form.NamedSection,'geosite','geosite','GeoSite — домены');s.anonymous=true;s.addremove=false;
  o=s.option(form.MultiValue,'enabled','Что направлять через VPN');GS.forEach(function(x){o.value(x[0],x[1]);});o.rmempty=true;

  s=m.section(form.NamedSection,'geoip','geoip','GeoIP — IP/CIDR');s.anonymous=true;s.addremove=false;
  o=s.option(form.MultiValue,'enabled','IP-наборы через VPN');GI.forEach(function(x){o.value(x[0],x[1]);});o.rmempty=true;o.description='Страновые наборы могут занимать несколько мегабайт RAM. Для Xiaomi 4A лучше включать только необходимые.';

  var statusCard=E('div',{'class':'simpleui-card simpleui-section'},[E('h3',{},'Состояние'),row('Маршрутизация',statusText(stat)),row('VPN',stat.vpn||'—'),row('GeoSite доменов',stat.domain_count||'0'),row('GeoIP сетей',stat.ip_count||'0'),row('Последнее обновление',stat.last_update||'—'),row('dnsmasq nftset',stat.dnsmasq_nftset?'готов':'не доступен')]);

  function customBlock(title,type,value,placeholder){var ta=E('textarea',{'class':'simpleui-textarea','placeholder':placeholder},[value||'']);var btn=E('button',{'class':'btn cbi-button cbi-button-neutral','type':'button'},'Сохранить список');btn.addEventListener('click',function(){callSaveCustom(type,ta.value).then(function(r){ui.addNotification(null,E('p',{},r.message||(r.ok?'Сохранено':'Ошибка')),r.ok?'info':'error');});});return E('div',{'class':'simpleui-card'},[E('h3',{},title),ta,E('div',{'class':'simpleui-actions'},[btn])]);}

  var apply=E('button',{'class':'btn cbi-button cbi-button-action','type':'button'},'Сохранить и применить');apply.addEventListener('click',function(){m.save().then(function(){return callApply();}).then(function(r){ui.addNotification(null,E('p',{},r.message||(r.ok?'Готово':'Не применено')),r.ok?'info':'error');setTimeout(function(){location.reload();},1200);}).catch(function(e){ui.addNotification(null,E('p',{},e.message),'error');});});
  var upd=E('button',{'class':'btn cbi-button cbi-button-neutral','type':'button'},'Обновить GeoSite/GeoIP сейчас');upd.addEventListener('click',function(){m.save().then(function(){return callUpdate();}).then(function(r){ui.addNotification(null,E('p',{},r.message||(r.ok?'Обновлено':'Ошибка')),r.ok?'info':'error');setTimeout(function(){location.reload();},1200);});});

  return m.render().then(function(map){return E('div',{'class':'simpleui-wrap'},[
   E('div',{'class':'simpleui-hero'},[E('div',{},[E('h2',{'class':'simpleui-title'},'VPN и маршруты'),E('div',{'class':'simpleui-sub'},'Логика как у DNS-маршрутов Keenetic + категории GeoSite/GeoIP.')])]),
   statusCard,map,E('div',{'class':'simpleui-grid simpleui-section'},[customBlock('Свои домены','domains',custom.domains,'example.com\nyoutube.com'),customBlock('Свои IP / CIDR','ips',custom.ips,'1.1.1.1\n203.0.113.0/24')]),
   E('div',{'class':'simpleui-note simpleui-warn'},'Если AmneziaWG отключится, Simple UI удаляет свои policy-rules, чтобы обычный интернет через WAN продолжил работать.'),
   E('div',{'class':'simpleui-actions'},[apply,upd])
  ]);});
 },
 handleSaveApply:null,handleSave:null,handleReset:null
});
