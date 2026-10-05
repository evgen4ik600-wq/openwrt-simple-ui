'use strict';
const ZERO='00000000000000000000000000000000';
let sid=sessionStorage.getItem('simpleui_sid')||'';
let pollTimer=null;
const hist={wanRx:[],wanTx:[],vpnRx:[],vpnTx:[],last:{}};

async function rpc(session,obj,method,args={}){
  const r=await fetch('/ubus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'call',params:[session,obj,method,args]})});
  const j=await r.json();
  if(!j.result||j.result[0]!==0) throw new Error('RPC '+obj+'.'+method);
  return j.result[1]||{};
}
async function login(user,pass){const x=await rpc(ZERO,'session','login',{username:user,password:pass});return x.ubus_rpc_session;}
function el(id){return document.getElementById(id)}
function showApp(){el('login').classList.add('hidden');el('app').classList.remove('hidden')}
function showLogin(){el('app').classList.add('hidden');el('login').classList.remove('hidden')}
function fmtBytes(n){n=Number(n||0);if(n>1073741824)return(n/1073741824).toFixed(1)+' ГБ';if(n>1048576)return(n/1048576).toFixed(1)+' МБ';if(n>1024)return(n/1024).toFixed(0)+' КБ';return n+' Б'}
function fmtRate(n){n=Math.max(0,Number(n||0));if(n>1048576)return(n*8/1048576).toFixed(1)+' Мбит/с';if(n>1024)return(n*8/1024).toFixed(0)+' Кбит/с';return Math.round(n*8)+' бит/с'}
function badge(ok,text){return '<span class="badge '+(ok?'ok':'bad')+'">'+(ok?'● ':'● ')+text+'</span>'}
function iface(d,name){return (d.interface||[]).find(x=>x.interface===name)||{}}
function ipv4(x){return (x['ipv4-address']&&x['ipv4-address'][0]&&x['ipv4-address'][0].address)||'—'}
function rate(dev,key,now){if(!dev)return 0;const k=dev+':'+key,cur=Number(now||0),old=hist.last[k],t=Date.now(),out=old?Math.max(0,(cur-old.v)/((t-old.t)/1000)):0;hist.last[k]={v:cur,t};return out}
function push(a,v){a.push(v);if(a.length>90)a.shift()}
function draw(canvas,a,b){const c=el(canvas);if(!c)return;const dpr=devicePixelRatio||1,w=c.clientWidth||600,h=120;c.width=w*dpr;c.height=h*dpr;const x=c.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,w,h);const max=Math.max(1,...a,...b);function line(arr,color){x.beginPath();arr.forEach((v,i)=>{const px=(i/Math.max(1,arr.length-1))*w,py=h-(v/max)*(h-8)-4;i?x.lineTo(px,py):x.moveTo(px,py)});x.strokeStyle=color;x.lineWidth=1.5;x.stroke()}line(a,'#68b6e8');line(b,'#28c684')}
async function refresh(){
 try{
  const [st,ifs,devs,wifi,leases,board,info]=await Promise.all([
   rpc(sid,'luci.simpleui','status',{}),rpc(sid,'network.interface','dump',{}),rpc(sid,'luci-rpc','getNetworkDevices',{}).catch(()=>({})),rpc(sid,'luci-rpc','getWirelessDevices',{}).catch(()=>({})),rpc(sid,'luci-rpc','getDHCPLeases',{}).catch(()=>({})),rpc(sid,'system','board',{}),rpc(sid,'system','info',{})
  ]);
  const wan=iface(ifs,'wan'),vpn=iface(ifs,st.vpn||'AWG'),wanDev=wan.l3_device||wan.device||'wan',vpnDev=vpn.l3_device||vpn.device||st.vpn||'AWG';
  const ds=devs.devices||devs||{};const wd=ds[wanDev]||{},vd=ds[vpnDev]||{};
  const wrx=rate(wanDev,'rx',wd.rx_bytes),wtx=rate(wanDev,'tx',wd.tx_bytes),vrx=rate(vpnDev,'rx',vd.rx_bytes),vtx=rate(vpnDev,'tx',vd.tx_bytes);
  push(hist.wanRx,wrx);push(hist.wanTx,wtx);push(hist.vpnRx,vrx);push(hist.vpnTx,vtx);draw('wanGraph',hist.wanRx,hist.wanTx);draw('vpnGraph',hist.vpnRx,hist.vpnTx);
  el('wanCard').innerHTML='<div class="status-line"><div><div class="status-name">Ethernet</div><div class="status-sub">'+wanDev+'</div></div>'+badge(!!wan.up,wan.up?'Подключено':'Нет связи')+'</div><div class="stat-grid"><div class="stat">IPv4<strong>'+ipv4(wan)+'</strong></div><div class="stat">Приём<strong>'+fmtRate(wrx)+'</strong></div><div class="stat">Передача<strong>'+fmtRate(wtx)+'</strong></div></div>';
  el('vpnCard').innerHTML='<div class="status-line"><div><div class="status-name">'+(st.vpn||'AmneziaWG')+'</div><div class="status-sub">AmneziaWG</div></div>'+badge(!!vpn.up,vpn.up?'Подключено':'Отключено')+'</div><div class="stat-grid"><div class="stat">VPN IPv4<strong>'+ipv4(vpn)+'</strong></div><div class="stat">Приём<strong>'+fmtRate(vrx)+'</strong></div><div class="stat">Передача<strong>'+fmtRate(vtx)+'</strong></div></div>';
  const radios=Object.values(wifi||{});const leases4=leases.dhcp_leases||[];
  el('wifiCard').innerHTML='<div class="status-line"><div><div class="status-name">Домашняя сеть</div><div class="status-sub">Wi-Fi клиентов: '+leases4.length+'</div></div>'+badge(radios.length>0,radios.length?'Активна':'Нет данных')+'</div><div class="chips" style="margin-top:12px">'+radios.slice(0,4).map((r,i)=>'<span class="chip">'+(r.hwmodes?r.hwmodes.join('/'):'Wi-Fi '+(i+1))+'</span>').join('')+'</div>';
  const p=['wan','lan1','lan2','lan3','lan4'].filter(n=>ds[n]);el('portsCard').innerHTML='<div class="ports">'+p.map(n=>'<div class="port '+(ds[n].up?'up':'')+'"><div class="port-box">'+n.replace('lan','')+'</div><small>'+(ds[n].speed?ds[n].speed+'M':'—')+'</small></div>').join('')+'</div>';
  el('routeCard').innerHTML='<div class="status-line"><div><div class="status-name">GeoSite + GeoIP</div><div class="status-sub">'+st.domain_count+' доменов · '+st.ip_count+' сетей</div></div>'+badge(!!st.routing_active,st.routing_active?'Активна':'Не активна')+'</div><div class="chips" style="margin-top:12px"><span class="chip">AWG</span><span class="chip">nftables</span><span class="chip">dnsmasq nftset</span></div>';
  const avail=Math.round(Number(st.mem_available_kb||0)/1024),flash=Math.round(Number(st.overlay_free_kb||0)/1024);
  el('systemCard').innerHTML='<div class="status-line"><div><div class="status-name">'+(board.model||st.model||'OpenWrt')+'</div><div class="status-sub">OpenWrt '+((board.release&&board.release.version)||st.release||'')+'</div></div>'+badge(true,'Работает')+'</div><div class="stat-grid"><div class="stat">RAM свободно<strong>'+avail+' МБ</strong></div><div class="stat">Flash свободно<strong>'+flash+' МБ</strong></div><div class="stat">Uptime<strong>'+Math.floor(Number(info.uptime||0)/3600)+' ч</strong></div></div>';
  el('lastUpdate').textContent='Обновлено '+new Date().toLocaleTimeString();
 }catch(e){console.error(e); if(String(e).includes('session')) logout();}
}
function logout(){sessionStorage.removeItem('simpleui_sid');sid='';clearInterval(pollTimer);showLogin()}
el('loginForm').addEventListener('submit',async e=>{e.preventDefault();el('loginError').textContent='';try{sid=await login(el('username').value,el('password').value);sessionStorage.setItem('simpleui_sid',sid);showApp();refresh();pollTimer=setInterval(refresh,2000)}catch(err){el('loginError').textContent='Неверный пароль или RPC недоступен'}});
el('logoutBtn').onclick=logout;el('refreshBtn').onclick=refresh;el('menuBtn').onclick=()=>el('sidebar').classList.toggle('open');
document.querySelectorAll('.nav-link[data-page]').forEach(a=>a.onclick=()=>{document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));a.classList.add('active');const p=a.dataset.page;if(p==='dashboard'){el('page-dashboard').classList.add('active');el('page-placeholder').classList.remove('active')}else{el('page-dashboard').classList.remove('active');el('page-placeholder').classList.add('active');el('placeholderTitle').textContent=a.innerText.trim()}el('sidebar').classList.remove('open')});
setInterval(()=>el('clock').textContent=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),1000);
(async()=>{if(!sid){showLogin();return}try{await rpc(sid,'system','board',{});showApp();refresh();pollTimer=setInterval(refresh,2000)}catch(e){logout()}})();
