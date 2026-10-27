'use strict';
(() => {
 let timer;
 function updateTheme(){
  const now=new Date(),hour=now.getHours(),isDay=hour>=7&&hour<19;
  document.documentElement.setAttribute('data-theme',isDay?'light':'dark');
  const label=document.getElementById('themeStatus');
  if(label)label.textContent=isDay?'日间 · 自动':'夜间 · 自动';
  clearTimeout(timer);
  timer=setTimeout(updateTheme,60_000-now.getSeconds()*1000-now.getMilliseconds());
 }
 updateTheme();
 document.addEventListener('DOMContentLoaded',updateTheme,{once:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateTheme();});
 window.addEventListener('focus',updateTheme);
 window.addEventListener('pageshow',updateTheme);
 window.addEventListener('pagehide',()=>clearTimeout(timer));
})();
