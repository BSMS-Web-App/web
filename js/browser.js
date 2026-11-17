(() => {
'use strict';
const $=id=>document.getElementById(id),form=$('addressForm'),input=$('addressInput'),frame=$('readerFrame'),empty=$('emptyState'),status=$('statusText'),toast=$('toast');
const proxy=String(window.BSMS_READER_PROXY_ORIGIN||'').replace(/\/+$/,'');
let token=null,current='',history=[],index=-1,timer;
function notify(s){toast.textContent=s;toast.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove('show'),3200);}
function nav(){ $('backButton').disabled=index<=0;$('forwardButton').disabled=index>=history.length-1; }
function normalize(v){let s=String(v||'').trim();if(!s)throw Error('Enter a website address.');if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(s))s='https://'+s;const u=new URL(s);if(u.protocol!=='https:')throw Error('Only HTTPS websites are supported.');return u.href;}
async function start(){
 if(!proxy)throw Error('Cloudflare Reader endpoint has not been configured yet.');
 let auth;try{auth=JSON.parse(localStorage.getItem('bsms_auth_session')||'null');}catch{}
 const sid=localStorage.getItem('session_id');if(!sid||!auth?.loggedIn||!auth?.uid)throw Error('Sign in to your BSMS Web account first.');
 const r=await fetch(proxy+'/session',{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json','X-Session-ID':sid,'X-UID':auth.uid},body:'{}'});
 const d=await r.json().catch(()=>({}));if(!r.ok||!d.token)throw Error(d.error||'Could not start reader session.');return d.token;
}
function load(url,push=true){current=url;input.value=url;const u=new URL(proxy+'/page');u.searchParams.set('url',url);u.searchParams.set('token',token);frame.src=u.href;frame.hidden=false;empty.hidden=true;status.textContent='Loading through Cloudflare…';if(push){history=history.slice(0,index+1);history.push(url);index=history.length-1;}nav();}
form.addEventListener('submit',e=>{e.preventDefault();try{if(!token)throw Error('Reader session is not ready.');load(normalize(input.value));}catch(err){notify(err.message);}});
$('backButton').addEventListener('click',()=>{if(index>0){index--;load(history[index],false);}});
$('forwardButton').addEventListener('click',()=>{if(index<history.length-1){index++;load(history[index],false);}});
$('reloadButton').addEventListener('click',()=>{if(current&&token)load(current,false);});
frame.addEventListener('load',()=>{if(!frame.hidden)status.textContent=current||'Ready';});
start().then(t=>{token=t;status.textContent='Signed in · Cloudflare reader ready';}).catch(err=>{status.textContent=err.message;notify(err.message);if(err.message.includes('Sign in')){const a=document.createElement('a');a.href='/accounts';a.textContent='Open account sign-in';a.style.cssText='margin-top:16px;color:#fff;text-decoration:underline;font-size:13px';empty.appendChild(a);}});
})();
