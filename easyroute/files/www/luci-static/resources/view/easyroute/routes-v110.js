'use strict';
'require view';
'require rpc';
'require ui';

var callStatus=rpc.declare({object:'luci.easyroute',method:'status',expect:{}});
var callList=rpc.declare({object:'luci.easyroute',method:'list_rules',expect:{}});
var callProfiles=rpc.declare({object:'luci.easyroute',method:'profiles',expect:{}});
var callDevices=rpc.declare({object:'luci.easyroute',method:'devices',expect:{}});
var callDiscover=rpc.declare({object:'luci.easyroute',method:'discover_devices',expect:{}});
var callSelftest=rpc.declare({object:'luci.easyroute',method:'selftest',expect:{}});
var callGet=rpc.declare({object:'luci.easyroute',method:'get_rule',params:['id'],expect:{}});
var callSave=rpc.declare({object:'luci.easyroute',method:'save_rule',params:['id','name','enabled','content','source_type','source_url','auto_update','update_interval','profile'],expect:{}});
var callToggle=rpc.declare({object:'luci.easyroute',method:'toggle_rule',params:['id','enabled'],expect:{}});
var callDelete=rpc.declare({object:'luci.easyroute',method:'delete_rule',params:['id'],expect:{}});
var callUpdate=rpc.declare({object:'luci.easyroute',method:'update_rule',params:['id'],expect:{}});
var callSaveDevice=rpc.declare({object:'luci.easyroute',method:'save_device',params:['id','name','mac','profile','enabled'],expect:{}});
var callDeleteDevice=rpc.declare({object:'luci.easyroute',method:'delete_device',params:['id'],expect:{}});
var callDiag=rpc.declare({object:'luci.easyroute',method:'diagnostics',expect:{}});

var SERVICES=[
 ['📺','YouTube','youtube.com'],['✈️','Telegram','telegram.org'],['🤖','ChatGPT / OpenAI','openai.com'],
 ['📸','Instagram','instagram.com'],['🎮','Discord','discord.com'],['🎵','TikTok','tiktok.com'],
 ['🎬','Twitch','twitch.tv'],['🎧','Spotify','spotify.com'],['🧠','Claude','anthropic.com'],['👥','Facebook','facebook.com']
];
function notify(r){ui.addNotification(null,E('p',{},(r&&r.message)||((r&&r.ok)?'Готово':'Ошибка')),(r&&r.ok)?'info':'error');}
function bytes(n){n=Number(n||0);if(n>1073741824)return(n/1073741824).toFixed(1)+' ГБ';if(n>1048576)return(n/1048576).toFixed(1)+' МБ';if(n>1024)return(n/1024).toFixed(0)+' КБ';return n+' Б';}
function ago(v){v=Number(v||0);if(!v)return 'нет handshake';if(v<60)return v+' сек. назад';if(v<3600)return Math.floor(v/60)+' мин. назад';return Math.floor(v/3600)+' ч. назад';}
function closeBtn(){return E('button',{class:'btn',type:'button',style:'font-size:22px;min-width:42px',click:ui.hideModal,title:'Закрыть'},'✕');}
function profileSelect(ps,val){var a=ps.map(function(p){return E('option',{value:p.id},(p.up?'🟢 ':'🔴 ')+p.name);});var s=E('select',{class:'cbi-input-select',style:'width:100%;max-width:520px'},a);s.value=val||((ps[0]||{}).id||'');return s;}
function refresh(){window.location.reload();}
function manualEditor(rule,ps){
 rule=rule||{id:'',name:'',content:'',source_type:'manual',source_url:'',profile:'',enabled:true};
 var name=E('input',{class:'cbi-input-text',style:'width:100%',value:rule.name||'',placeholder:'Например: Мой сайт'});
 var prof=profileSelect(ps,rule.profile);var url=E('input',{class:'cbi-input-text',style:'width:100%',value:rule.source_url||'',placeholder:'https://...'});
 var txt=E('textarea',{class:'cbi-input-textarea',style:'width:100%;min-height:190px',placeholder:'example.com\n1.2.3.0/24'},[rule.content||'']);
 var source=E('select',{class:'cbi-input-select'},[E('option',{value:'url'},'🔗 Ссылка на список'),E('option',{value:'manual'},'📝 Вставить вручную')]);source.value=rule.source_type==='url'?'url':'manual';
 var boxUrl=E('div',{},[E('p',{},'🔗 Адрес списка'),url]);var boxTxt=E('div',{},[E('p',{},'📝 Домены или IP — по одному в строке'),txt]);
 function sync(){boxUrl.style.display=source.value==='url'?'':'none';boxTxt.style.display=source.value==='manual'?'':'none';}source.addEventListener('change',sync);sync();
 var save=E('button',{class:'btn cbi-button cbi-button-action',type:'button'},'💾 Сохранить');
 save.addEventListener('click',function(){save.disabled=true;callSave(rule.id||'',name.value.trim(),true,txt.value,source.value,url.value.trim(),true,'86400',prof.value).then(function(r){notify(r);if(r.ok){ui.hideModal();setTimeout(refresh,500);}else save.disabled=false;}).catch(function(e){notify({ok:false,message:e.message});save.disabled=false;});});
 ui.showModal((rule.id?'✏️ Изменить':'➕ Добавить')+' маршрут',[E('div',{style:'display:flex;justify-content:flex-end'},closeBtn()),E('div',{class:'cbi-section'},[
  E('p',{},'🏷️ Название'),name,E('p',{},'🛡️ Через какой VPN'),prof,E('p',{},'📦 Откуда брать адреса'),source,boxUrl,boxTxt
 ]),E('div',{class:'right'},[E('button',{class:'btn',type:'button',click:ui.hideModal},'↩️ Отмена'),' ',save])]);
}
function serviceCatalog(ps){
 var q=E('input',{class:'cbi-input-text',style:'width:100%;margin-bottom:12px',placeholder:'🔎 Найти приложение...'});
 var list=E('div');
 function draw(){
  list.innerHTML='';var needle=q.value.toLowerCase();
  SERVICES.filter(function(x){return x[1].toLowerCase().indexOf(needle)>=0;}).forEach(function(x){
   var b=E('button',{class:'btn cbi-button cbi-button-action',type:'button'},'➕ Добавить');
   b.addEventListener('click',function(){serviceSetup(x,ps);});
   list.appendChild(E('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 4px;border-bottom:1px solid #666'},[
    E('div',{},[E('span',{style:'font-size:25px;margin-right:10px'},x[0]),E('strong',{},x[1]),E('div',{style:'font-size:12px;opacity:.65;margin-left:40px'},x[2])]),b
   ]));
  });
 }q.addEventListener('input',draw);draw();
 ui.showModal('🧩 Добавить приложение',[E('div',{style:'display:flex;justify-content:flex-end'},closeBtn()),E('p',{},'Выберите сервис — EasyRoute сам добавит домены и IP-сети. Никаких CIDR вручную 🙂'),q,list,E('div',{style:'margin-top:16px'},[E('button',{class:'btn',type:'button',click:function(){ui.hideModal();manualEditor(null,ps);}},'🛠️ Не нашли? Добавить вручную')])]);
}
function serviceSetup(x,ps){
 var prof=profileSelect(ps,'');var add=E('button',{class:'btn cbi-button cbi-button-action',type:'button'},'🚀 Добавить и включить');
 add.addEventListener('click',function(){
  add.disabled=true;var base='https://iplist.opencck.org/?format=text&site='+encodeURIComponent(x[2]);
  callSave('',x[0]+' '+x[1]+' · домены',true,'','url',base+'&data=domains&wildcard=1',true,'86400',prof.value).then(function(a){
   if(!a.ok)throw new Error(a.message||'Не удалось добавить домены');
   return callSave('',x[0]+' '+x[1]+' · IP',true,'','url',base+'&data=cidr4',true,'86400',prof.value);
  }).then(function(b){notify(b);if(b.ok){ui.hideModal();setTimeout(refresh,600);}else add.disabled=false;}).catch(function(e){notify({ok:false,message:e.message});add.disabled=false;});
 });
 ui.showModal(x[0]+' '+x[1],[E('div',{style:'display:flex;justify-content:flex-end'},closeBtn()),E('div',{class:'cbi-section'},[
  E('h3',{},'Что сделает EasyRoute?'),E('p',{},'🌐 Добавит домены\n📡 Добавит IP-сети\n🔄 Будет обновлять их каждые 24 часа\n🛡️ Направит через выбранный VPN'),
  E('p',{},'Выберите VPN'),prof
 ]),E('div',{class:'right'},[E('button',{class:'btn',type:'button',click:ui.hideModal},'↩️ Отмена'),' ',add])]);
}
function devicePicker(ps){
 callDiscover().then(function(r){
  var list=E('div');(r.devices||[]).forEach(function(d){var b=E('button',{class:'btn cbi-button',type:'button'},'➕');b.addEventListener('click',function(){var p=profileSelect(ps,'');ui.showModal('📱 '+(d.name||d.ip),[E('div',{style:'display:flex;justify-content:flex-end'},closeBtn()),E('p',{},'MAC: '+d.mac+' · IP: '+d.ip),E('p',{},'🛡️ Всегда направлять через'),p,E('button',{class:'btn cbi-button cbi-button-action',type:'button',click:function(){callSaveDevice('',d.name||d.ip,d.mac,p.value,true).then(function(x){notify(x);if(x.ok)setTimeout(refresh,400);});}},'💾 Сохранить')]);});list.appendChild(E('p',{},['📱 ',E('strong',{},d.name||d.ip),' · '+d.ip+' ',b]));});
  ui.showModal('📱 Устройства в сети',[E('div',{style:'display:flex;justify-content:flex-end'},closeBtn()),E('p',{},'Выберите устройство. MAC-адрес вводить вручную не нужно 👍'),list]);
 });
}
function healthBox(){
 callSelftest().then(function(r){var rows=[['🌍 Интернет',r.internet],['🛡️ VPN',r.vpn],['🔥 Firewall',r.firewall],['🌐 DNS',r.dns],['🧭 Маршрутизация',r.routing],['🔄 Автообновление',r.updater]];ui.showModal('🩺 Проверка EasyRoute',[E('div',{style:'display:flex;justify-content:flex-end'},closeBtn()),E('div',{class:'cbi-section'},rows.map(function(x){return E('p',{},[(x[1]?'✅ ':'❌ '),E('strong',{},x[0])]);}))]);});
}
return view.extend({
 load:function(){return Promise.all([callStatus(),callList(),callProfiles(),callDevices()]);},
 render:function(data){
  var s=data[0]||{},rules=(data[1]||{}).rules||[],ps=(data[2]||{}).profiles||[],devs=(data[3]||{}).devices||[];
  var title=E('div',{class:'cbi-section'},[E('h2',{},'🚀 EasyRoute 1.1'),E('p',{},'VPN и маршрутизация без сложных настроек ✨')]);
  var state=E('div',{class:'cbi-section'},[
   E('h3',{},s.vpn_up?'🟢 Всё работает':'🟠 Нужна проверка'),
   E('p',{},['🌍 Интернет · ',E('strong',{},'OpenWrt')]),
   E('p',{},['🛡️ VPN · ',E('strong',{},s.interface||'AWG'),' · ',s.vpn_up?'подключён':'не подключён',' · ',ago(s.handshake_age)]),
   E('p',{},'📊 ↓ '+bytes(s.rx_bytes)+' · ↑ '+bytes(s.tx_bytes)+' · 💾 свободно '+(Number(s.overlay_free_kb||0)/1024).toFixed(1)+' МБ'),
   E('button',{class:'btn cbi-button',type:'button',click:healthBox},'🩺 Проверить всё')
  ]);
  var apps=E('div',{class:'cbi-section'},[E('h3',{},'🧩 Приложения и сайты'),E('p',{},'Что должно идти через VPN')]);
  rules.forEach(function(r){
   var sw=E('input',{type:'checkbox'});sw.checked=r.enabled!==false;sw.addEventListener('change',function(){sw.disabled=true;callToggle(r.id,sw.checked).then(function(x){notify(x);if(!x.ok)sw.checked=!sw.checked;sw.disabled=false;});});
   var edit=E('button',{class:'btn cbi-button',type:'button'},'✏️');edit.addEventListener('click',function(){callGet(r.id).then(function(x){if(x.ok)manualEditor(x,ps);});});
   var del=E('button',{class:'btn cbi-button cbi-button-remove',type:'button'},'🗑️');del.addEventListener('click',function(){if(confirm('Удалить «'+r.name+'»?'))callDelete(r.id).then(function(x){notify(x);if(x.ok)setTimeout(refresh,350);});});
   apps.appendChild(E('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 2px;border-bottom:1px solid #666'},[
    E('div',{},[E('strong',{},r.name),E('div',{style:'font-size:12px;opacity:.65'},'📦 '+r.count+' записей · 🔄 '+(r.source_type==='url'?'авто':'вручную'))]),
    E('div',{},[sw,' ',edit,' ',del])
   ]));
  });
  apps.appendChild(E('p',{},[E('button',{class:'btn cbi-button cbi-button-action',type:'button',click:function(){serviceCatalog(ps);}},'➕ Добавить приложение'),' ',E('button',{class:'btn cbi-button',type:'button',click:function(){manualEditor(null,ps);}},'🛠️ Вручную')]));
  var vpn=E('div',{class:'cbi-section'},[E('h3',{},'🛡️ VPN')]);
  ps.forEach(function(p){vpn.appendChild(E('p',{},[(p.up?'🟢 ':'🔴 '),E('strong',{},p.name),' · '+p.interface,E('span',{style:'opacity:.6'},' · '+(p.up?'работает':'не подключён'))]));});
  vpn.appendChild(E('p',{},'💡 EasyRoute использует обычные системные интерфейсы AmneziaWG и не прячет VPN внутри себя.'));
  vpn.appendChild(E('button',{class:'btn cbi-button',type:'button',click:function(){window.location.href=L.url('admin/network/network');}},'➕ Добавить / импортировать AWG'));
  var devices=E('div',{class:'cbi-section'},[E('h3',{},'📱 Устройства'),E('p',{},'Можно отправить целиком телефон, ТВ или компьютер через VPN.')]);
  devs.forEach(function(d){var del=E('button',{class:'btn cbi-button cbi-button-remove',type:'button'},'🗑️');del.addEventListener('click',function(){callDeleteDevice(d.id).then(function(x){notify(x);if(x.ok)setTimeout(refresh,350);});});devices.appendChild(E('p',{},['📱 ',E('strong',{},d.name||d.mac),' · '+d.mac+' ',del]));});
  devices.appendChild(E('button',{class:'btn cbi-button cbi-button-action',type:'button',click:function(){devicePicker(ps);}},'🔎 Найти устройства автоматически'));
  var adv=E('details',{class:'cbi-section'},[E('summary',{},'⚙️ Для опытных'),E('p',{},'🧭 Домены: '+(s.domain_count||0)+' · 📡 IP/CIDR: '+(s.ip_count||0)+' · 🕒 Последнее применение: '+(s.last_apply||'—')),E('button',{class:'btn cbi-button',type:'button',click:function(){callDiag().then(function(r){ui.showModal('🔧 Диагностика',[E('div',{style:'display:flex;justify-content:flex-end'},closeBtn()),E('pre',{style:'white-space:pre-wrap;max-height:65vh;overflow:auto'},JSON.stringify(r,null,2))]);});}},'🔧 Техническая диагностика')]);
  return E('div',{},[title,state,apps,vpn,devices,adv]);
 }
});