'use strict';
(() => {
 const byId=id=>document.getElementById(id);
 const services=[
  {name:'ipwho.is',url:'https://ipwho.is/',normalize:d=>({ip:d.ip,country:d.country,code:d.country_code,region:d.region,city:d.city,isp:d.connection?.isp||d.connection?.org,asn:d.connection?.asn?String(d.connection.asn).replace(/^AS/i,''):''})},
  {name:'ipapi.co',url:'https://ipapi.co/json/',normalize:d=>({ip:d.ip,country:d.country_name,code:d.country_code,region:d.region,city:d.city,isp:d.org,asn:d.asn?String(d.asn).replace(/^AS/i,''):''})},
  {name:'ipify',url:'https://api.ipify.org?format=json',normalize:d=>({ip:d.ip})}
 ];
 let loading=false;
 const put=(id,value)=>{byId(id).textContent=value;};
 function validIP(value){
  if(typeof value!=='string'||value.length>45)return false;
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(value))return value.split('.').every(n=>Number(n)<=255);
  if(!value.includes(':')||!/^[\da-f:.]+$/i.test(value))return false;
  try{return new URL('https://['+value+']/').hostname.startsWith('[');}catch{return false;}
 }
 const clean=value=>typeof value==='string'?value.trim().slice(0,160):'';
 function locationText(data){
  let country=clean(data.country);
  try{if(/^[A-Z]{2}$/.test(data.code))country=new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(data.code)||country;}catch{}
  return [...new Set([country,clean(data.region),clean(data.city)].filter(Boolean))].join(' · ');
 }
 async function lookupIP(){
  if(loading)return;
  if(byId('start')?.disabled){put('ipStatus','测速进行中，请结束后刷新 IP。');return;}
  loading=true;byId('refreshIP').disabled=true;
  put('publicIP','查询中…');put('ipLocation','查询中…');put('ipISP','查询中…');put('ipStatus','正在获取当前出口 IP 信息…');
  try{
   for(const service of services){
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);
    try{
     const response=await fetch(service.url,{mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:abort.signal});
     if(!response.ok)throw new Error('IP service unavailable');
     const raw=await response.json();if(!raw||raw.error||raw.success===false)throw new Error('IP service rejected request');
     const data=service.normalize(raw);if(!validIP(data.ip))throw new Error('Invalid IP response');
     const location=locationText(data),isp=clean(data.isp),asn=clean(data.asn);
     put('publicIP',data.ip);put('ipLocation',location||'暂无归属地数据');put('ipISP',[isp,asn?'AS'+asn:''].filter(Boolean).join(' · ')||'暂无运营商数据');
     put('ipStatus',(location?'已更新':'已获取 IP，归属地服务暂不可用')+' · '+service.name+' · '+new Date().toLocaleTimeString('zh-CN',{hour12:false}));
     return;
    }catch{}
    finally{clearTimeout(timer);}
   }
   put('publicIP','获取失败');put('ipLocation','—');put('ipISP','—');put('ipStatus','IP 查询服务暂不可用，请稍后点击“刷新 IP”。不影响测速。');
  }finally{loading=false;byId('refreshIP').disabled=false;}
 }
 byId('refreshIP').addEventListener('click',()=>{void lookupIP();});
 void lookupIP();
})();
