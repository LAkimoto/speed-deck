'use strict';
(() => {
 const el=id=>document.getElementById(id);
 const put=(id,value)=>{el(id).textContent=value;};
 const CHUNK_BYTES=8_000_000, MAX_BYTES=1_000_000_000_000;
 let state='idle',target=0,received=0,elapsedMs=0,startedAt=null;
 let active=false,controller=null,rate=0,clock=null,lastRateAt=0,lastRateBytes=0,lastPaint=0;
 const tabs=[el('speedTab'),el('trafficTab')];
 function selectTab(index,focus=false){
  tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;el(tab.getAttribute('aria-controls')).hidden=i!==index;});
  if(focus)tabs[index].focus();
 }
 tabs.forEach((tab,i)=>{
  tab.addEventListener('click',()=>selectTab(i));
  tab.addEventListener('keydown',event=>{
   const key=event.key;if(!['ArrowLeft','ArrowRight','Home','End'].includes(key))return;
   event.preventDefault();selectTab(key==='Home'?0:key==='End'?1:1-i,true);
  });
 });
 function formatBytes(bytes){return bytes>=1e9?[(bytes/1e9).toFixed(3),'GB']:[(bytes/1e6).toFixed(2),'MB'];}
 function elapsed(){return elapsedMs+(active&&startedAt!==null?performance.now()-startedAt:0);}
 function render(){
  const [used,usedUnit]=formatBytes(received),[remaining,remainingUnit]=formatBytes(Math.max(0,target-received));
  put('trafficUsed',used);put('trafficUsedUnit',usedUnit);put('trafficRemaining',target?remaining:'—');put('trafficRemainingUnit',remainingUnit);
  put('trafficRate',active?rate.toFixed(1):'0.0');
  const seconds=Math.floor(elapsed()/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),secs=seconds%60;
  put('trafficElapsed',(hours?String(hours).padStart(2,'0')+':':'')+String(minutes).padStart(2,'0')+':'+String(secs).padStart(2,'0'));
  const percent=target?Math.min(100,received/target*100):0;
  el('trafficProgress').value=percent;put('trafficPercent',percent.toFixed(1)+'%');
  put('trafficQuota',target?'目标：'+formatBytes(target).join(' '):'目标：尚未设置');
  lastPaint=performance.now();
 }
 function controls(){
  el('trafficStart').disabled=active;el('trafficPause').disabled=!active;el('trafficReset').disabled=active||state==='idle';
  const locked=state!=='idle'&&state!=='completed';
  el('trafficAmount').disabled=active||locked;el('trafficUnit').disabled=active||locked;
  put('trafficStart',state==='paused'?'继续消耗':state==='completed'?'重新开始':'开始消耗');
 }
 function status(message,error=false){put('trafficStatus',message);el('trafficStatus').classList.toggle('error',error);}
 function readTarget(){
  const raw=el('trafficAmount').value.trim(),amount=Number(raw),unit=el('trafficUnit').value;
  if(!raw||!Number.isFinite(amount)||amount<=0||!['MB','GB'].includes(unit))throw new Error('请输入有效的正数流量额度。');
  const bytes=Math.round(amount*(unit==='GB'?1e9:1e6));
  if(!Number.isSafeInteger(bytes)||bytes<1000||bytes>MAX_BYTES)throw new Error('额度须在 0.001 MB 到 1000 GB 之间。');
  return bytes;
 }
 function pause(){
  if(!active)return;
  status('正在暂停，停止接收数据…');el('trafficPause').disabled=true;controller.abort();
 }
 function reset(){
  if(active)return;
  state='idle';target=0;received=0;elapsedMs=0;startedAt=null;rate=0;controls();render();status('设置目标额度后开始，不会自动消耗流量。');
 }
 function delay(ms,signal){
  return new Promise((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new Error('paused'));};
   const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  });
 }
 async function download(bytes,signal){
  const requestController=new AbortController(),abort=()=>requestController.abort();
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  let timer,reader,readBytes=0;
  const watchdog=()=>{clearTimeout(timer);timer=setTimeout(abort,30_000);};
  watchdog();
  try{
   const url=new URL('https://speed.cloudflare.com/__down');url.searchParams.set('bytes',String(bytes));url.searchParams.set('r',Date.now()+'-'+Math.random());
   const response=await fetch(url.href,{cache:'no-store',credentials:'omit',mode:'cors',referrerPolicy:'no-referrer',signal:requestController.signal});
   if(!response.ok)throw new Error('接口返回 HTTP '+response.status);
   const type=response.headers.get('content-type')||'';
   if(/text\/html|application\/json/i.test(type))throw new Error('接口返回的不是下载数据');
   if(response.headers.get('content-encoding'))throw new Error('接口返回压缩数据，无法可靠计量');
   if(!response.body)throw new Error('浏览器不支持流式下载');
   reader=response.body.getReader();
   while(!signal.aborted){
    const {done,value}=await reader.read();if(done)break;
    readBytes+=value.byteLength;received+=value.byteLength;watchdog();
    if(performance.now()-lastPaint>=150)render();
    if(received>=target||readBytes>=bytes){await reader.cancel();break;}
   }
   if(!readBytes&&!signal.aborted)throw new Error('接口未返回下载数据');
  }finally{
   clearTimeout(timer);signal.removeEventListener('abort',abort);
   try{if(reader){await reader.cancel();reader.releaseLock();}}catch{}
   requestController.abort();
  }
 }
 async function start(){
  if(active)return;
  if(el('start').disabled){status('测速正在运行，请结束测速后再开始消耗。',true);return;}
  if(state!=='paused'){
   let nextTarget;try{nextTarget=readTarget();}catch(error){status(error.message,true);return;}
   target=nextTarget;received=0;elapsedMs=0;rate=0;
  }
  state='running';active=true;controller=new AbortController();const signal=controller.signal;
  startedAt=performance.now();lastRateAt=startedAt;lastRateBytes=received;
  el('start').disabled=true;controls();render();status('持续下载中，达到目标额度自动停止。');
  put('status','流量消耗正在运行，请先到流量消耗页暂停后再测速。');
  clock=setInterval(()=>{
   const now=performance.now(),dt=now-lastRateAt;
   rate=dt>0?(received-lastRateBytes)*8/(dt*1000):0;lastRateAt=now;lastRateBytes=received;render();
  },1000);
  let failures=0;
  try{
   while(received<target&&!signal.aborted){
    const before=received;
    try{
     await download(Math.min(CHUNK_BYTES,target-received),signal);
     if(!signal.aborted&&received===before)throw new Error('未收到数据');
     failures=0;
    }catch(error){
     if(signal.aborted)break;
     if(received>=target)break;
     failures++;
     if(failures>3)throw error;
     const wait=2000*2**(failures-1);
     status('下载中断，'+wait/1000+' 秒后重试（'+failures+'/3），已接收流量会保留。');
     await delay(wait,signal);status('连接恢复中，继续消耗剩余流量…');
    }
   }
   if(received>=target){state='completed';status('已达到目标额度，下载已自动停止。');}
   else{state='paused';status('已暂停，点击“继续消耗”完成剩余额度。');}
  }catch(error){
   state='paused';status(signal.aborted?'已暂停，已消耗流量会保留。':'连续重试失败，任务已暂停。可点击“继续消耗”重试。',!signal.aborted);
  }finally{
   clearInterval(clock);elapsedMs+=performance.now()-startedAt;startedAt=null;active=false;controller=null;rate=0;
   el('start').disabled=false;put('status',state==='completed'?'流量消耗已完成，可以开始测速。':'流量消耗已暂停，可以开始测速。');
   controls();render();
  }
 }
 el('trafficStart').addEventListener('click',()=>{void start();});el('trafficPause').addEventListener('click',pause);el('trafficReset').addEventListener('click',reset);
 window.addEventListener('pagehide',()=>controller?.abort());
 window.SpeedDeckTraffic={isRunning:()=>active};
 controls();render();
})();
