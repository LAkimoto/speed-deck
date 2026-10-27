'use strict';
(() => {
 const KEY='speedDeck.themeMode',MODES=['auto','light','dark'];
 let timer,mode='auto';
 try{const saved=localStorage.getItem(KEY);if(MODES.includes(saved))mode=saved;}catch{}
 function updateTheme(){
  const now=new Date(),hour=now.getHours();
  const resolved=mode==='auto'?(hour>=7&&hour<19?'light':'dark'):mode;
  document.documentElement.setAttribute('data-theme',resolved);
  document.documentElement.setAttribute('data-theme-mode',mode);
  const label=document.getElementById('themeStatus');
  if(label)label.textContent=(resolved==='light'?'日间':'夜间')+' · '+(mode==='auto'?'自动':'手动');
  document.querySelectorAll('[data-theme-mode]').forEach(button=>{
   if(button.tagName==='BUTTON')button.setAttribute('aria-pressed',String(button.dataset.themeMode===mode));
  });
  clearTimeout(timer);
  if(mode==='auto')timer=setTimeout(updateTheme,60_000-now.getSeconds()*1000-now.getMilliseconds());
 }
 function setMode(next,persist=true){
  mode=MODES.includes(next)?next:'auto';
  if(persist){try{localStorage.setItem(KEY,mode);}catch{}}
  updateTheme();
 }
 function bind(){
  document.querySelectorAll('button[data-theme-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.themeMode)));
  updateTheme();
 }
 updateTheme();
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateTheme();});
 window.addEventListener('focus',updateTheme);
 window.addEventListener('pageshow',updateTheme);
 window.addEventListener('pagehide',()=>clearTimeout(timer));
 window.addEventListener('storage',event=>{if(event.key===KEY||event.key===null)setMode(event.newValue,false);});
})();
