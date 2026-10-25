'use strict';
const $=id=>document.getElementById(id);
const NODES=[
 {id:'cf',group:'海外服务',name:'Cloudflare · 自动路由',kind:'cf',base:'https://speed.cloudflare.com/',hint:'自动路由节点；不保证境外落点。支持下载、上传与 HTTP 延迟。'},
 {id:'la',group:'海外服务',name:'美国洛杉矶 · Sharktech',kind:'libre',base:'https://laxspeed.sharktech.net/backend/',hint:'LibreSpeed 公开节点，当前浏览器直接测速。'},
 {id:'fra',group:'海外服务',name:'德国法兰克福 · Clouvider',kind:'libre',base:'https://fra.speedtest.clouvider.net/backend/',hint:'LibreSpeed 公开节点，当前浏览器直接测速。'},
 {id:'tokyo',group:'海外服务',name:'日本东京 · A573',kind:'libre',base:'https://librespeed.a573.net/backend/',hint:'LibreSpeed 公开节点，当前浏览器直接测速。'},
 {id:'cmcc',group:'国内三网候选 · 需本机检测',name:'移动线路 · 苏州 JSQY（候选）',kind:'ookla',base:'https://speedtest.jsqiuying.com:8080/speedtest/',hint:'社区清单中的移动线路节点，非全国官方 API；HTTPS、端口和跨域可用性需本机检测。'},
 {id:'cucc',group:'国内三网候选 · 需本机检测',name:'中国联通 · 北京（候选）',kind:'ookla',base:'https://beijing.unicomtest.com:8080/speedtest/',hint:'公开清单中的联通北京节点；当前环境未连通，需在你的网络中检测。'},
 {id:'ctcc',group:'国内三网候选 · 需本机检测',name:'中国电信 · 江苏苏州 5G（候选）',kind:'ookla',base:'https://4gsuzhou1.speedtest.jsinfo.net.prod.hosts.ooklaserver.net:8080/speedtest/',hint:'公开清单中的电信江苏节点；当前环境未连通，需在你的网络中检测。'},
 {id:'custom',group:'自定义',name:'自定义测速接口',hint:'支持 LibreSpeed、Ookla HTTP 或一个允许跨域访问的下载文件。'}
];
let running=false,controller=null,bytesUsed=0,result={status:'idle'},stage='';
function show(id,value){$(id).textContent=value;}
function speed(value,label){show('speed',value.toFixed(1));show('speedLabel','Mbps · '+label);$('meterFill').style.strokeDashoffset=String(440*(1-Math.min(value/1000,1)));}
function usage(n){bytesUsed+=n;show('used',(bytesUsed/1e6).toFixed(2)+' MB');}
function stop(){controller?.abort();}
function fresh(raw,params={}){const u=new URL(raw);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));u.searchParams.set('r',Date.now()+'-'+Math.random());return u.href;}
function selectedNode(){
 const node=NODES.find(n=>n.id===$('endpoint').value);if(!node)throw new Error('请选择测速接口');
 if(node.id!=='custom')return {...node};
 const kind=$('customType').value;if(!['libre','ookla','download'].includes(kind))throw new Error('不支持的接口类型');
 let u;try{u=new URL($('customUrl').value.trim());}catch{throw new Error('请输入完整的 HTTPS 接口地址');}
 if(u.protocol!=='https:'||u.username||u.password)throw new Error('请使用不含账号密码的 HTTPS 地址');
 if(kind!=='download'&&!u.pathname.endsWith('/'))u.pathname+='/';
 return {id:'custom',kind,base:u.href,name:'自定义 · '+u.host};
}
function endpoint(node,phase,index=0){
 if(node.kind==='cf')return fresh(new URL(phase==='upload'?'__up':'__down',node.base),phase==='upload'?{}:{bytes:phase==='ping'?100:[1e6,5e6,20e6][index]});
 if(node.kind==='libre')return fresh(new URL(phase==='download'?'garbage.php':'empty.php',node.base),{cors:true,...(phase==='download'?{ckSize:[1,5,20][index]}:{})});
 if(node.kind==='ookla')return fresh(new URL(phase==='ping'?'latency.txt':phase==='upload'?'upload.php':['random1000x1000.jpg','random2000x2000.jpg','random4000x4000.jpg'][index],node.base));
 return fresh(node.base);
}
function reset(){for(const id of ['download','upload','latency','jitter','speed'])show(id,'—');show('used','0.00 MB');show('testedAt','尚未测速');show('resultNode','尚未测速');show('connection','待检测');$('progress').value=0;$('meterFill').style.strokeDashoffset='440';show('speedLabel','Mbps · 等待开始');result={status:'idle'};}
function selectionChanged(){
 if(running)return;reset();const n=NODES.find(n=>n.id===$('endpoint').value);$('customForm').hidden=n?.id!=='custom';show('nodeHint',n?.hint||'');show('status','准备就绪 · 将使用所选接口测速');$('status').classList.remove('error');show('capability','测试前会检查所选接口的连通性。');
}
async function request(url,{method='GET',body,cap=32e6,binary=false,onChunk}={}){
 const child=new AbortController(),parent=controller.signal,abort=()=>child.abort();
 parent.addEventListener('abort',abort,{once:true});if(parent.aborted)abort();
 const timer=setTimeout(abort,12000);let reader;
 try{
 const response=await fetch(url,{method,body,cache:'no-store',credentials:'omit',mode:'cors',signal:child.signal,...(body?{headers:{'Content-Type':'text/plain;charset=UTF-8'}}:{})});
 if(!response.ok)throw new Error('HTTP '+response.status);
 if(binary&&/text\/html|application\/json/i.test(response.headers.get('content-type')||''))throw new Error('接口返回网页或 JSON，不是测速数据');
 if(response.headers.get('content-encoding')&&binary)throw new Error('接口启用了压缩，无法可靠估算下载速率');
 if(!response.body){if(binary)throw new Error('浏览器无法读取测速数据');return 0;}
 reader=response.body.getReader();let total=0;
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;usage(value.byteLength);onChunk?.(total);if(total>=cap){await reader.cancel();break;}}
 if(binary&&total<1024)throw new Error('下载数据不足，接口可能不兼容');
 return total;
 }catch(e){if(child.signal.aborted&&!parent.aborted)throw new Error('请求超时（12 秒）');throw e;}
 finally{clearTimeout(timer);parent.removeEventListener('abort',abort);reader?.releaseLock();}
}
async function run(){
 if(window.SpeedDeckTraffic?.isRunning()){show('status','流量消耗正在运行，请先到流量消耗页暂停。');return {status:'busy'};}
 if(running)throw new Error('测速正在进行');let node;
 try{node=selectedNode();}catch(e){show('status',e.message);$('status').classList.add('error');return {status:'invalid',error:e.message};}
 reset();running=true;controller=new AbortController();bytesUsed=0;result={status:'running',nodeId:node.id,node:node.name,endpoint:node.base};
 $('start').disabled=true;$('stop').disabled=false;$('endpoint').disabled=true;$('customType').disabled=true;$('customUrl').disabled=true;$('status').classList.remove('error');
 show('resultNode',node.name);show('testedAt','测速中');show('connection','检测中');show('speedLabel','Mbps · 连接中');
 const overall=setTimeout(stop,60000);
 try{
 stage='接口检测';show('status','正在连接 '+node.name+'…');
 if(node.kind!=='download')await request(endpoint(node,'ping'),{cap:8192});
 if(node.kind!=='download'){
 show('connection','已连接 · HTTP');stage='延迟';show('status','正在测量所选节点的 HTTP 延迟…');const samples=[];
 for(let i=0;i<5;i++){const t=performance.now();await request(endpoint(node,'ping'),{cap:8192});samples.push(performance.now()-t);$('progress').value=(i+1)*4;}
 result.latency=[...samples].sort((a,b)=>a-b)[2];result.jitter=samples.slice(1).reduce((s,v,i)=>s+Math.abs(v-samples[i]),0)/4;show('latency',result.latency.toFixed(0));show('jitter',result.jitter.toFixed(1));
 }else{show('latency','不支持');show('jitter','不支持');}
 stage='下载';show('status','正在从 '+node.name+' 下载测速…');let downBytes=0,downMs=0;const count=node.kind==='download'?1:3;
 for(let i=0;i<count;i++){
 const t=performance.now();const n=await request(endpoint(node,'download',i),{binary:true,cap:node.kind==='download'?26e6:32e6,onChunk:total=>{const ms=performance.now()-t;if(ms>0)speed(total*8/(ms*1000),'下载中');}});
 downBytes+=n;downMs+=performance.now()-t;$('progress').value=20+(i+1)/count*45;
 }
 result.download=downBytes*8/(downMs*1000);show('download',result.download.toFixed(1));show('connection','已连接 · HTTP');
 if(node.kind!=='download'){
 stage='上传';show('status','正在向 '+node.name+' 上传测速…');let upBytes=0,upMs=0;
 for(const [i,size] of [250000,1e6,3e6].entries()){
 const data=new Uint8Array(size);for(let j=0;j<size;j+=65536)crypto.getRandomValues(data.subarray(j,Math.min(j+65536,size)));
 const t=performance.now();usage(size);await request(endpoint(node,'upload'),{method:'POST',body:data,cap:8192});upBytes+=size;upMs+=performance.now()-t;speed(size*8/((performance.now()-t)*1000),'上传中');$('progress').value=65+(i+1)*10;
 }
 result.upload=upBytes*8/(upMs*1000);show('upload',result.upload.toFixed(1));
 }else{show('upload','不支持');}
 speed(result.download,'下载结果');result.status='completed';$('progress').value=100;show('status','测速完成 · '+node.name);show('capability',node.kind==='download'?'此接口仅支持下载测试。':'下载、上传与 HTTP 延迟均已完成。');
 }catch(e){
 result.status=controller.signal.aborted?'stopped':result.download!==undefined?'partial':'failed';result.error=e.message;result.failedStage=stage;
 const message=result.status==='stopped'?'测速已停止或达到 60 秒时限':stage+'失败：'+(e.message==='Failed to fetch'?'节点无法直连，可能是网络、HTTPS 证书或跨域限制':e.message);
 show('status',message+' · '+node.name);show('connection',result.status==='partial'?'部分完成':'未完成');show('capability',result.status==='partial'?'保留已完成指标；上传未完成。不会切换到其他节点。':'请切换接口后重试；测速请求始终使用所选节点。');$('status').classList.add('error');show('speedLabel','Mbps · 未完成');
 }finally{
 clearTimeout(overall);running=false;for(const id of ['start','endpoint','customType','customUrl'])$(id).disabled=false;$('stop').disabled=true;show('start','重新测速');show('testedAt',new Date().toLocaleString('zh-CN',{hour12:false}));result.trafficMB=Number((bytesUsed/1e6).toFixed(2));
 }
 return {...result};
}
let group;
for(const n of NODES){if(!group||group.label!==n.group){group=document.createElement('optgroup');group.label=n.group;$('endpoint').append(group);}const option=document.createElement('option');option.value=n.id;option.textContent=n.name;group.append(option);}
$('endpoint').value='cf';selectionChanged();
$('start').addEventListener('click',()=>{void run();});$('stop').addEventListener('click',stop);$('endpoint').addEventListener('change',selectionChanged);$('customForm').addEventListener('submit',e=>e.preventDefault());
for(const id of ['customType','customUrl'])$(id).addEventListener('change',selectionChanged);
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const check=input=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('需要空对象');};
 for(const tool of [{name:'start_network_speed_test',title:'开始所选接口测速',description:'从当前设备向页面所选接口执行真实 HTTP 测速，最长 60 秒，消耗网络流量。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{check(input);return run();}},{name:'read_network_speed_result',title:'读取测速结果',description:'读取本页测速状态、对应节点及已完成指标。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:input=>{check(input);return {...result};}}]){
 try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
