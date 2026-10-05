'use strict';

const ZERO='00000000000000000000000000000000';
let sid=sessionStorage.getItem('routerhome_sid')||'';
let activePage='dashboard';
let timer=null;
let fastTimer=null;
const state={status:null,traffic:null,lastTraffic:{},hist:{wanRx:[],wanTx:[],vpnRx:[],vpnTx:[]}};

const navNames={
 dashboard:'Системный монитор',traffic:'Монитор трафика','wifi-monitor':'Монитор Wi-Fi',
 connections:'Подключения',vpn:'AmneziaWG',clients:'Список клиентов',accesspoints:'Точки доступа',
 routing:'Маршрутизация',firewall:'Межсетевой экран',forwards:'Переадресация портов',
 dns:'Доменные имена',system:'Настройки системы',apps:'Приложения'
};

const services=[
 ['youtube','YouTube'],['instagram','Instagram'],['discord','Discord'],['openai','OpenAI / ChatGPT'],
 ['telegram','Telegram'],['tiktok','TikTok'],['github','GitHub'],['google','Google'],
 ['twitter','X / Twitter'],['reddit','Reddit'],['netflix','Netflix'],['spotify','Spotify'],
 ['twitch','Twitch'],['facebook','Facebook'],['whatsapp','WhatsApp'],['microsoft','Microsoft'],
 ['apple','Apple'],['cloudflare','Cloudflare'],['category-ai-!cn','AI-сервисы']
];
const geoipExtra=[['ru','Россия'],['de','Германия'],['nl','Нидерланды'],['us','США']];

function $(id){return document.getElementById(id)}
function h(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function bool(v){return v===true||v===1||v==='1'||v==='true'}
function statusBadge(ok,yes='Работает',no='Не работает'){return '<span class="status '+(ok?'ok':'bad')+'">● '+(ok?yes:no)+'</span>'}
function fmtBytes(n){n=Number(n||0);if(n>=1073741824)return(n/1073741824).toFixed(2)+' ГБ';if(n>=1048576)return(n/1048576).toFixed(1)+' МБ';if(n>=1024)return(n/1024).toFixed(0)+' КБ';return n+' Б'}
function fmtRate(n){n=Math.max(0,Number(n||0));if(n>=1048576)return(n*8/1048576).toFixed(1)+' Мбит/с';if(n>=1024)return(n*8/1024).toFixed(0)+' Кбит/с';return Math.round(n*8)+' бит/с'}
function toast(msg,bad=false){const t=$('toast');t.textContent=msg;t.className='toast'+(bad?' bad':'');setTimeout(()=>t.classList.add('hidden'),3500);t.classList.remove('hidden')}
function row(a,b){return '<div class="row"><span>'+h(a)+'</span><strong>'+b+'</strong></div>'}
function pageHead(title,sub=''){return '<div class="page-head"><div><h1>'+h(title)+'</h1><div class="sub">'+h(sub)+'</div></div><div class="sub" id="pageStamp"></div></div>'}
function panel(title,body,cls=''){return '<div class="panel '+cls+'"><div class="panel-title">'+h(title)+'</div>'+body+'</div>'}
function chips(arr){return '<div class="chips">'+arr.map(x=>'<span class="chip">'+h(x)+'</span>').join('')+'</div>'}

async function rpc(obj,method,args={}){
 const r=await fetch('/ubus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'call',params:[sid,obj,method,args]})});
 const j=await r.json();
 if(!j.result||j.result[0]!==0)throw new Error(method);
 return j.result[1]||{};
}
async function login(user,pass){
 const old=sid;sid=ZERO;
 const x=await rpc('session','login',{username:user,password:pass});
 sid=old;return x.ubus_rpc_session;
}
async function home(method,args={}){return rpc('router.home',method,args)}

function showApp(){ $('login').classList.add('hidden');$('app').classList.remove('hidden') }
function showLogin(){ $('app').classList.add('hidden');$('login').classList.remove('hidden') }
function logout(){sessionStorage.removeItem('routerhome_sid');sid='';clearInterval(timer);clearInterval(fastTimer);showLogin()}

function rate(key,val){
 const now=Date.now(),cur=Number(val||0),old=state.lastTraffic[key];
 state.lastTraffic[key]={v:cur,t:now};
 if(!old||now<=old.t)return 0;
 return Math.max(0,(cur-old.v)/((now-old.t)/1000));
}
function push(arr,v){arr.push(v);if(arr.length>120)arr.shift()}
function draw(id,a,b){
 const c=$(id);if(!c)return;const d=devicePixelRatio||1,w=c.clientWidth||600,hh=120;c.width=w*d;c.height=hh*d;
 const x=c.getContext('2d');x.scale(d,d);x.clearRect(0,0,w,hh);const max=Math.max(1,...a,...b);
 function line(arr,color){x.beginPath();arr.forEach((v,i)=>{const px=(i/Math.max(1,arr.length-1))*w,py=hh-5-(v/max)*(hh-10);i?x.lineTo(px,py):x.moveTo(px,py)});x.strokeStyle=color;x.lineWidth=1.5;x.stroke()}
 line(a,'#68b8e8');line(b,'#2ac985');
}
function ipOfDump(d,name){
 try{const x=(d.interface||[]).find(i=>i.interface===name);return x&&x['ipv4-address']&&x['ipv4-address'][0]?x['ipv4-address'][0].address:'—'}catch(e){return'—'}
}

async function refreshCore(){
 try{
  state.status=await home('status');
  state.traffic=await home('traffic');
  const tr=state.traffic;
  const wrx=rate('wrx',tr.wan_rx),wtx=rate('wtx',tr.wan_tx),vrx=rate('vrx',tr.vpn_rx),vtx=rate('vtx',tr.vpn_tx);
  push(state.hist.wanRx,wrx);push(state.hist.wanTx,wtx);push(state.hist.vpnRx,vrx);push(state.hist.vpnTx,vtx);
  if(activePage==='dashboard'){updateDashboardRates(wrx,wtx,vrx,vtx);draw('wanGraph',state.hist.wanRx,state.hist.wanTx);draw('vpnGraph',state.hist.vpnRx,state.hist.vpnTx)}
  if(activePage==='traffic'){updateTrafficRates(wrx,wtx,vrx,vtx);draw('trafficWan',state.hist.wanRx,state.hist.wanTx);draw('trafficVpn',state.hist.vpnRx,state.hist.vpnTx)}
 }catch(e){console.error(e)}
}

function updateDashboardRates(wrx,wtx,vrx,vtx){
 if($('wanRx'))$('wanRx').textContent=fmtRate(wrx);if($('wanTx'))$('wanTx').textContent=fmtRate(wtx);if($('vpnRx'))$('vpnRx').textContent=fmtRate(vrx);if($('vpnTx'))$('vpnTx').textContent=fmtRate(vtx)
}
function updateTrafficRates(wrx,wtx,vrx,vtx){
 [['twrx',wrx],['twtx',wtx],['tvrx',vrx],['tvtx',vtx]].forEach(x=>{if($(x[0]))$(x[0]).textContent=fmtRate(x[1])})
}

async function renderDashboard(){
 const [s,wifi,clients]=await Promise.all([home('status'),home('wifi'),home('clients')]);state.status=s;
 const aps=wifi.aps||[],cl=clients.clients||[],tr=state.traffic||await home('traffic');
 const ports=(tr.ports||[]).map(p=>'<div class="port '+(p.carrier==='1'?'up':'')+'"><div class="portbox">'+h(p.name==='wan'?'WAN':p.name.replace('lan',''))+'</div><small>'+(Number(p.speed)>0?h(p.speed)+'M':'—')+'</small></div>').join('');
 const ram=Math.round(Number(s.mem_available_kb||0)/1024),flash=(Number(s.flash_free_kb||0)/1024).toFixed(1),up=Math.floor(Number(s.uptime||0)/3600);
 $('content').innerHTML=pageHead('Системный монитор','Состояние роутера в реальном времени')+
 '<div class="dashboard"><div class="panel">'+
 '<div class="panel-title">ИНТЕРНЕТ</div>'+
 '<div class="row"><div><strong>Ethernet</strong><div class="sub">'+h(s.wan_dev)+'</div></div>'+statusBadge(bool(s.wan_up),'Подключено','Нет связи')+'</div>'+
 '<div class="grid"><div>'+row('IPv4',h(s.wan_ip||'—'))+'</div><div>'+row('Приём','<span id="wanRx">0 бит/с</span>')+'</div><div>'+row('Передача','<span id="wanTx">0 бит/с</span>')+'</div></div><canvas id="wanGraph"></canvas>'+
 '<div class="divider"></div>'+
 '<div class="row"><div><strong>'+h(s.vpn||'AWG')+'</strong><div class="sub">AmneziaWG</div></div>'+statusBadge(bool(s.vpn_up),'Подключено','Отключено')+'</div>'+
 '<div class="grid"><div>'+row('VPN IPv4',h(s.vpn_ip||'—'))+'</div><div>'+row('Приём','<span id="vpnRx">0 бит/с</span>')+'</div><div>'+row('Передача','<span id="vpnTx">0 бит/с</span>')+'</div></div><canvas id="vpnGraph"></canvas>'+
 '</div><div class="stack">'+
 panel('МОИ СЕТИ И WI-FI','<div class="row"><div><strong>Домашняя сеть</strong><div class="sub">Клиентов: '+cl.length+'</div></div>'+statusBadge(aps.some(a=>a.disabled!=='1'),'Активна','Выключена')+'</div>'+chips(aps.map(a=>(a.band||'Wi-Fi')+' · '+(a.ssid||'без имени'))))+
 panel('СЕТЕВЫЕ ПОРТЫ','<div class="ports">'+ports+'</div>')+
 panel('УМНАЯ МАРШРУТИЗАЦИЯ','<div class="row"><div><strong>GeoSite + GeoIP</strong><div class="sub">'+h(s.domain_count)+' доменов · '+h(s.ip_count)+' сетей</div></div>'+statusBadge(bool(s.routing_active),'Активна','Не активна')+'</div>'+chips(['AWG','nftables','dnsmasq nftset']))+
 panel('СИСТЕМА','<div class="row"><div><strong>'+h(s.model)+'</strong><div class="sub">Платформа '+h(s.release)+'</div></div>'+statusBadge(true,'Работает','')+'</div><div class="grid">'+row('RAM свободно',ram+' МБ')+row('Flash свободно',flash+' МБ')+row('Uptime',up+' ч')+'</div>')+
 '</div></div>';
 draw('wanGraph',state.hist.wanRx,state.hist.wanTx);draw('vpnGraph',state.hist.vpnRx,state.hist.vpnTx)
}

async function renderTraffic(){
 const s=await home('status');
 $('content').innerHTML=pageHead('Монитор трафика','WAN и AmneziaWG без записи истории во flash')+
 '<div class="grid">'+
 panel('ETHERNET','<div class="big" id="twrx">0 бит/с</div><div class="sub">приём</div>'+row('Передача','<span id="twtx">0 бит/с</span>')+'<canvas id="trafficWan"></canvas>')+
 panel(h(s.vpn||'AMNEZIAWG'),'<div class="big" id="tvrx">0 бит/с</div><div class="sub">приём</div>'+row('Передача','<span id="tvtx">0 бит/с</span>')+'<canvas id="trafficVpn"></canvas>')+
 '</div><div class="note">График живёт только в браузере. Роутер не пишет статистику во flash.</div>';
 draw('trafficWan',state.hist.wanRx,state.hist.wanTx);draw('trafficVpn',state.hist.vpnRx,state.hist.vpnTx)
}

async function renderWifiMonitor(){
 const w=await home('wifi'),aps=w.aps||[];
 $('content').innerHTML=pageHead('Монитор Wi-Fi','Радиомодули, каналы и точки доступа')+
 '<div class="grid">'+aps.map(a=>panel(a.ssid||'Wi-Fi',row('Диапазон',h(a.band||'—'))+row('Канал',h(a.channel||'auto'))+row('Защита',h(a.encryption||'—'))+row('Состояние',a.disabled==='1'?statusBadge(false,'','Отключена'):statusBadge(true,'Активна','')))).join('')+'</div>';
}

async function renderConnections(){
 const r=await home('connections');let dump={interface:[]};try{dump=JSON.parse(r.dump||'{}')}catch(e){}
 $('content').innerHTML=pageHead('Подключения','Все сетевые интерфейсы платформы')+
 '<div class="grid">'+(dump.interface||[]).filter(x=>!['loopback'].includes(x.interface)).map(x=>panel(x.interface.toUpperCase(),
 row('Протокол',h(x.proto||'—'))+row('Устройство',h(x.l3_device||x.device||'—'))+row('IPv4',h(ipOfDump(dump,x.interface)))+row('Состояние',statusBadge(!!x.up,'Подключено','Отключено'))+
 '<div class="actions"><button class="btn good" onclick="ifaceAction(\''+h(x.interface)+'\',\'up\')">Включить</button><button class="btn" onclick="ifaceAction(\''+h(x.interface)+'\',\'restart\')">Перезапустить</button><button class="btn danger" onclick="ifaceAction(\''+h(x.interface)+'\',\'down\')">Отключить</button></div>')).join('')+'</div>';
}
window.ifaceAction=async function(i,a){try{const r=await home('interface_action',{interface:i,action:a});toast(r.message||'Готово',!r.ok);setTimeout(()=>navigate(activePage),1000)}catch(e){toast('Ошибка действия',true)}}

async function renderVpn(){
 const s=await home('status');
 $('content').innerHTML=pageHead('AmneziaWG','Состояние VPN без технических параметров')+
 panel('VPN-СОЕДИНЕНИЕ',row('Интерфейс',h(s.vpn||'—'))+row('Состояние',statusBadge(bool(s.vpn_up),'Подключено','Отключено'))+row('VPN IPv4',h(s.vpn_ip||'—'))+row('Устройство',h(s.vpn_dev||'—'))+
 '<div class="actions"><button class="btn good" onclick="ifaceAction(\''+h(s.vpn)+'\',\'up\')">Подключить</button><button class="btn" onclick="ifaceAction(\''+h(s.vpn)+'\',\'restart\')">Переподключить</button><button class="btn danger" onclick="ifaceAction(\''+h(s.vpn)+'\',\'down\')">Отключить</button></div>')+
 '<div class="note">Ключи и низкоуровневые параметры AWG не показываются на обычной странице.</div>';
}

async function renderClients(){
 const r=await home('clients'),cl=r.clients||[];
 $('content').innerHTML=pageHead('Список клиентов',cl.length+' устройств получили адрес от роутера')+
 panel('УСТРОЙСТВА','<div class="table-wrap"><table><thead><tr><th>Имя</th><th>IP</th><th>MAC</th><th>Состояние</th></tr></thead><tbody>'+cl.map(c=>'<tr><td>'+h(c.hostname)+'</td><td>'+h(c.ip)+'</td><td>'+h(c.mac)+'</td><td>'+h(c.state||'—')+'</td></tr>').join('')+'</tbody></table></div>');
}

async function renderAccessPoints(){
 const w=await home('wifi'),aps=w.aps||[];
 $('content').innerHTML=pageHead('Точки доступа','Имя Wi-Fi, пароль и защита')+
 '<div class="grid">'+aps.map((a,i)=>panel(a.ssid||('Wi-Fi '+(i+1)),
 '<label class="field">Имя сети<input id="ssid_'+i+'" value="'+h(a.ssid)+'"></label>'+
 '<label class="field">Защита<select id="enc_'+i+'"><option value="sae-mixed" '+(a.encryption==='sae-mixed'?'selected':'')+'>WPA2/WPA3</option><option value="psk2" '+(a.encryption==='psk2'?'selected':'')+'>WPA2</option><option value="sae" '+(a.encryption==='sae'?'selected':'')+'>WPA3</option><option value="none" '+(a.encryption==='none'?'selected':'')+'>Без пароля</option></select></label>'+
 '<label class="field">Пароль<input id="key_'+i+'" type="password" value="'+h(a.key)+'"></label>'+
 '<label class="check"><input id="on_'+i+'" type="checkbox" '+(a.disabled!=='1'?'checked':'')+'> Точка доступа включена</label>'+
 '<div class="actions"><button class="btn primary" onclick="saveWifi('+i+',\''+h(a.section)+'\')">Сохранить</button></div>')).join('')+'</div>';
}
window.saveWifi=async function(i,section){try{const r=await home('wifi_save',{section,ssid:$('ssid_'+i).value,encryption:$('enc_'+i).value,key:$('key_'+i).value,disabled:!$('on_'+i).checked});toast(r.message||'Сохранено',!r.ok)}catch(e){toast('Ошибка Wi-Fi',true)}}

async function renderRouting(){
 const r=await home('routing');const selected=new Set(String(r.geosite||'').split(/\s+/).filter(Boolean)),geo=new Set(String(r.geoip||'').split(/\s+/).filter(Boolean));
 $('content').innerHTML=pageHead('Маршрутизация','Сервисы через VPN: домены + IP-резерв там, где он доступен')+
 panel('СОСТОЯНИЕ',row('Маршрутизация',r.active?statusBadge(true,'Активна',''):statusBadge(false,'','Не активна'))+row('VPN',h(r.vpn||'—'))+row('GeoSite',h(r.domain_count)+' доменов')+row('GeoIP',h(r.ip_count)+' сетей'))+
 '<div class="grid" style="margin-top:12px">'+
 panel('СЕРВИСЫ ЧЕРЕЗ VPN','<div class="checkgrid">'+services.map(x=>'<label class="check"><input class="svc" type="checkbox" value="'+h(x[0])+'" '+(selected.has(x[0])?'checked':'')+'> '+h(x[1])+'</label>').join('')+'</div>')+
 panel('ГЕОГРАФИЯ — РАСШИРЕННО','<div class="checkgrid">'+geoipExtra.map(x=>'<label class="check"><input class="geo" type="checkbox" value="'+h(x[0])+'" '+(geo.has(x[0])?'checked':'')+'> '+h(x[1])+'</label>').join('')+'</div><div class="note warn">Страновые наборы крупные. Включай только нужные.</div>')+
 '</div>'+
 '<div class="grid" style="margin-top:12px">'+
 panel('СВОИ ДОМЕНЫ','<label class="field">Один домен на строку<textarea id="customDomains">'+h(r.domains||'')+'</textarea></label>')+
 panel('СВОИ IP / CIDR','<label class="field">Один IP или CIDR на строку<textarea id="customIps">'+h(r.ips||'')+'</textarea></label>')+
 '</div>'+
 panel('ПАРАМЕТРЫ','<label class="check"><input id="routingOn" type="checkbox" '+(r.enabled?'checked':'')+'> Умная маршрутизация включена</label><label class="check"><input id="dnsIntercept" type="checkbox" '+(r.dns_intercept?'checked':'')+'> Перехватывать обычный DNS клиентов</label><label class="check"><input id="autoUpdate" type="checkbox" '+(r.auto_update?'checked':'')+'> Обновлять списки раз в сутки</label><div class="actions"><button class="btn primary" onclick="saveRouting()">Сохранить и применить</button></div>','') ;
}
window.saveRouting=async function(){const geosite=[...document.querySelectorAll('.svc:checked')].map(x=>x.value).join(' '),geoip=[...document.querySelectorAll('.geo:checked')].map(x=>x.value).join(' ');try{const r=await home('routing_save',{enabled:$('routingOn').checked,vpn:(state.status&&state.status.vpn)||'AWG',dns_intercept:$('dnsIntercept').checked,auto_update:$('autoUpdate').checked,geosite,geoip,domains:$('customDomains').value,ips:$('customIps').value});toast(r.message||'Применено',!r.ok);setTimeout(()=>navigate('routing'),1000)}catch(e){toast('Ошибка маршрутизации',true)}}

async function renderFirewall(){
 const r=await home('firewall'),z=r.zones||[];
 $('content').innerHTML=pageHead('Межсетевой экран','Зоны и политика доступа')+
 '<div class="grid">'+z.map(x=>panel(x.name.toUpperCase(),row('Сети',h(x.network||'—'))+row('Входящий',h(x.input||'—'))+row('Исходящий',h(x.output||'—'))+row('Пересылка',h(x.forward||'—'))+row('NAT',x.masq==='1'?'Да':'Нет'))).join('')+'</div><div class="note">Редактирование базовых firewall-зон намеренно не вынесено на один клик: ошибкой здесь легко отрезать доступ к роутеру.</div>';
}

async function renderForwards(){
 const r=await home('forwards'),rules=r.rules||[];
 $('content').innerHTML=pageHead('Переадресация портов','Публикация сервисов из домашней сети')+
 panel('ДОБАВИТЬ ПРАВИЛО','<div class="grid"><label class="field">Название<input id="pfName"></label><label class="field">Протокол<select id="pfProto"><option>tcp</option><option>udp</option><option value="tcp udp">TCP + UDP</option></select></label><label class="field">Внешний порт<input id="pfSrc"></label><label class="field">IP устройства<input id="pfIp" placeholder="192.168.31.100"></label><label class="field">Внутренний порт<input id="pfDst"></label></div><div class="actions"><button class="btn primary" onclick="addForward()">Добавить</button></div>')+
 panel('ТЕКУЩИЕ ПРАВИЛА','<div class="table-wrap"><table><thead><tr><th>Название</th><th>Протокол</th><th>Снаружи</th><th>Назначение</th><th></th></tr></thead><tbody>'+rules.map(x=>'<tr><td>'+h(x.name)+'</td><td>'+h(x.proto)+'</td><td>'+h(x.src_dport)+'</td><td>'+h(x.dest_ip)+':'+h(x.dest_port)+'</td><td><button class="btn danger" onclick="delForward(\''+h(x.section)+'\')">Удалить</button></td></tr>').join('')+'</tbody></table></div>');
}
window.addForward=async function(){try{const r=await home('forward_add',{name:$('pfName').value,proto:$('pfProto').value,src_dport:$('pfSrc').value,dest_ip:$('pfIp').value,dest_port:$('pfDst').value});toast(r.message||'Готово',!r.ok);setTimeout(()=>navigate('forwards'),700)}catch(e){toast('Ошибка',true)}}
window.delForward=async function(section){if(!confirm('Удалить правило?'))return;try{const r=await home('forward_delete',{section});toast(r.message||'Удалено',!r.ok);setTimeout(()=>navigate('forwards'),500)}catch(e){toast('Ошибка',true)}}

async function renderDns(){
 const r=await home('dns'),auto=String(r.peerdns)!=='0';
 $('content').innerHTML=pageHead('Доменные имена','DNS для устройств домашней сети')+
 panel('DNS','<label class="field">Режим<select id="dnsMode"><option value="auto" '+(auto?'selected':'')+'>Автоматически от провайдера</option><option value="manual" '+(!auto?'selected':'')+'>Указать вручную</option></select></label><label class="field">DNS-серверы через пробел<input id="dnsServers" value="'+h(r.servers||'')+'" placeholder="1.1.1.1 1.0.0.1"></label>'+row('Локальный домен',h(r.domain||'lan'))+'<div class="actions"><button class="btn primary" onclick="saveDns()">Сохранить DNS</button></div>')+
 '<div class="note">DNS-перехват для умной маршрутизации настраивается в разделе «Маршрутизация».</div>';
}
window.saveDns=async function(){try{const r=await home('dns_save',{mode:$('dnsMode').value,servers:$('dnsServers').value});toast(r.message||'Сохранено',!r.ok)}catch(e){toast('Ошибка DNS',true)}}

async function renderSystem(){
 const [s,sys]=await Promise.all([home('status'),home('system')]);
 $('content').innerHTML=pageHead('Настройки системы','Имя роутера, резервная копия и обслуживание')+
 '<div class="grid">'+
 panel('РОУТЕР','<label class="field">Имя устройства<input id="hostName" value="'+h(sys.hostname||'')+'"></label>'+row('Платформа',h(s.release||'—'))+row('Модель',h(s.model||'—'))+'<div class="actions"><button class="btn primary" onclick="saveSystem()">Сохранить</button></div>')+
 panel('ОБСЛУЖИВАНИЕ',row('RAM свободно',Math.round(Number(s.mem_available_kb||0)/1024)+' МБ')+row('Flash свободно',(Number(s.flash_free_kb||0)/1024).toFixed(1)+' МБ')+'<div class="actions"><button class="btn" onclick="makeBackup()">Скачать backup</button><button class="btn danger" onclick="rebootRouter()">Перезагрузить</button></div>')+
 '</div>';
}
window.saveSystem=async function(){try{const r=await home('system_save',{hostname:$('hostName').value});toast(r.message||'Сохранено',!r.ok)}catch(e){toast('Ошибка',true)}}
window.makeBackup=async function(){try{const r=await home('backup');if(r.ok&&r.url){location.href=r.url;toast('Резервная копия создана')}else toast(r.message||'Ошибка backup',true)}catch(e){toast('Ошибка backup',true)}}
window.rebootRouter=async function(){if(!confirm('Перезагрузить роутер?'))return;try{await home('reboot');toast('Роутер перезагружается');setTimeout(()=>location.reload(),12000)}catch(e){}}

async function renderApps(){
 const r=await home('system'),pkgs=String(r.packages||'').trim().split(/\s+/).filter(Boolean);
 $('content').innerHTML=pageHead('Приложения',pkgs.length+' установленных пакетов')+
 panel('УСТАНОВЛЕНО',chips(pkgs))+
 '<div class="note warn">Установка пакетов из веб-интерфейса отключена: на роутере мало flash, а случайный пакет может нарушить зависимости. Нужные компоненты добавляем в проверенный установщик Router Home.</div>';
}

const renders={dashboard:renderDashboard,traffic:renderTraffic,'wifi-monitor':renderWifiMonitor,connections:renderConnections,vpn:renderVpn,clients:renderClients,accesspoints:renderAccessPoints,routing:renderRouting,firewall:renderFirewall,forwards:renderForwards,dns:renderDns,system:renderSystem,apps:renderApps};

async function navigate(page){
 activePage=page;
 document.querySelectorAll('.nav-link[data-page]').forEach(a=>a.classList.toggle('active',a.dataset.page===page));
 $('sidebar').classList.remove('open');
 $('content').innerHTML='<div class="panel">Загрузка...</div>';
 try{await (renders[page]||renderDashboard)()}catch(e){console.error(e);$('content').innerHTML=pageHead(navNames[page]||'Раздел')+'<div class="panel"><div class="danger-note">Не удалось загрузить данные этого раздела.</div></div>'}
 history.replaceState(null,'','#'+page);
}

function setupSearch(){
 const ov=$('searchOverlay'),inp=$('searchInput'),res=$('searchResults');
 $('searchBtn').onclick=()=>{ov.classList.remove('hidden');inp.value='';inp.focus();renderSearch('')};
 ov.onclick=e=>{if(e.target===ov)ov.classList.add('hidden')};
 inp.oninput=()=>renderSearch(inp.value);
 function renderSearch(q){q=q.toLowerCase();res.innerHTML=Object.entries(navNames).filter(x=>x[1].toLowerCase().includes(q)).map(x=>'<div class="search-result" data-p="'+x[0]+'">'+h(x[1])+'</div>').join('');res.querySelectorAll('.search-result').forEach(x=>x.onclick=()=>{ov.classList.add('hidden');navigate(x.dataset.p)})}
}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{sid=await login($('username').value,$('password').value);sessionStorage.setItem('routerhome_sid',sid);showApp();setupSearch();await refreshCore();navigate(location.hash.slice(1)||'dashboard');timer=setInterval(refreshCore,2000)}catch(err){$('loginError').textContent='Неверный пароль'}});
$('logoutBtn').onclick=logout;$('refreshBtn').onclick=()=>{refreshCore();navigate(activePage)};$('menuBtn').onclick=()=>$('sidebar').classList.toggle('open');
document.querySelectorAll('.nav-link[data-page]').forEach(a=>a.onclick=()=>navigate(a.dataset.page));
setInterval(()=>{if($('clock'))$('clock').textContent=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})},1000);

(async()=>{if(!sid){showLogin();return}try{await rpc('system','board',{});showApp();setupSearch();await refreshCore();navigate(location.hash.slice(1)||'dashboard');timer=setInterval(refreshCore,2000)}catch(e){logout()}})();
