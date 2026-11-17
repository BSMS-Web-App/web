/*
 * BSMS Web Cloud Reader — Cloudflare Worker
 * Destination fetches execute on Cloudflare, never on Vercel or the Mac.
 * The Mac API is used only to validate the existing BSMS account session.
 */
const ORIGINS = new Set(["https://dev1.bsms-web.com", "https://bsms-web-dev1.vercel.app"]);
const HOSTS = ["wikipedia.org","britannica.com","developer.mozilla.org","support.apple.com","apple.com","github.com","w3.org","nasa.gov","noaa.gov","weather.gov","khanacademy.org","pbs.org","loc.gov","si.edu"];
const TTL = 600;
const MAX = 2 * 1024 * 1024;
const enc = new TextEncoder();

function reply(data,status=200,headers={}) {
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
}
function cors(req) {
  const origin=req.headers.get("Origin");
  if(!origin)return {};
  if(!ORIGINS.has(origin))return null;
  return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, X-Session-ID, X-UID","Access-Control-Max-Age":"600","Vary":"Origin"};
}
function b64(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function un64(s){s=s.replace(/-/g,"+").replace(/_/g,"/");const b=atob(s+"=".repeat((4-s.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function key(secret){return crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);}
async function signToken(uid,sid,secret){const p=b64(enc.encode(JSON.stringify({uid,sid,exp:Math.floor(Date.now()/1000)+TTL})));const sig=await crypto.subtle.sign("HMAC",await key(secret),enc.encode(p));return p+"."+b64(new Uint8Array(sig));}
async function readToken(token,secret){try{if(!token||token.length>2048)return null;const [p,s,...rest]=token.split(".");if(!p||!s||rest.length)return null;if(!await crypto.subtle.verify("HMAC",await key(secret),un64(s),enc.encode(p)))return null;const data=JSON.parse(new TextDecoder().decode(un64(p)));return data.exp>=Math.floor(Date.now()/1000)?data:null;}catch{return null;}}
async function dbGet(env,path){
  const base=(env.BSMS_WEB_API_URL||"").replace(/\/+$/,"");
  if(!base||!env.BSMS_WEB_API_KEY)throw Error("Account verification is not configured");
  const r=await fetch(base+"/v1/db?path="+encodeURIComponent(path),{headers:{Authorization:"Bearer "+env.BSMS_WEB_API_KEY,Accept:"application/json"},signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error("Account verification service unavailable");
  const data=await r.json();return data.value??null;
}
async function accountValid(env,uid,sid){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||typeof sid!=="string"||sid.length<16||sid.length>256)return false;
  const a=await dbGet(env,"/accounts/"+uid);
  return !!(a&&a.account_status!=="banned"&&a.sessions&&Object.prototype.hasOwnProperty.call(a.sessions,sid)&&a.legalAcceptance?.terms?.version==="1.0.1"&&a.legalAcceptance?.privacy?.version==="1.0.2");
}
function targetUrl(value,base){
  try{
    const u=base?new URL(value,base):new URL(value);
    if(u.protocol!=="https:"||u.username||u.password||(u.port&&u.port!=="443")||u.hostname.endsWith(".local")||u.hostname.includes("%"))return null;
    const h=u.hostname.toLowerCase().replace(/\.$/,"");
    if(!HOSTS.some(d=>h===d||h.endsWith("."+d)))return null;
    u.hostname=h;u.hash="";return u;
  }catch{return null;}
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
class Strip { element(e){e.remove();} }
class Clean {
  constructor(base,token){this.base=base;this.token=token;}
  element(e){
    for(const a of ["style","srcset","srcdoc","action","formaction","autofocus","contenteditable","onload","onerror","onclick","onmouseover","target","download"])e.removeAttribute(a);
    for(const a of ["href","src"]){
      const raw=e.getAttribute(a);if(!raw)continue;
      const u=targetUrl(raw,this.base);
      if(!u){e.removeAttribute(a);continue;}
      e.setAttribute(a,"/page?url="+encodeURIComponent(u.href)+"&token="+encodeURIComponent(this.token));
    }
    if(e.tagName.toLowerCase()==="a")e.setAttribute("rel","noreferrer noopener");
  }
}
async function fetchPage(req,env,url,token){
  const id=await readToken(token,env.READER_SIGNING_SECRET);
  if(!id||!await accountValid(env,id.uid,id.sid))return reply({error:"Your reader session expired. Sign in again."},401);
  const u=targetUrl(url);if(!u)return reply({error:"Only supported HTTPS websites are available."},400);
  const upstream=await fetch(u.href,{redirect:"manual",headers:{"User-Agent":"BSMS-Web-Reader/1.0","Accept":"text/html,image/avif,image/webp,image/png,image/jpeg,image/gif,text/plain;q=0.8"},signal:AbortSignal.timeout(12000)});
  if([301,302,303,307,308].includes(upstream.status)){
    const next=upstream.headers.get("Location");const nu=next&&targetUrl(next,u);
    if(!nu)return reply({error:"Redirect outside supported sites blocked."},403);
    const loc=new URL(req.url);loc.searchParams.set("url",nu.href);return Response.redirect(loc.toString(),302);
  }
  if(!upstream.ok)return reply({error:"Destination could not be loaded."},502);
  const type=(upstream.headers.get("Content-Type")||"").toLowerCase();
  if(Number(upstream.headers.get("Content-Length")||0)>MAX)return reply({error:"Page exceeds reader size limit."},413);
  if(type.startsWith("image/")){
    if(!/^image\/(png|jpeg|gif|webp|avif)/.test(type))return reply({error:"Image type unsupported."},415);
    const b=await upstream.arrayBuffer();if(b.byteLength>MAX)return reply({error:"Image exceeds size limit."},413);
    return new Response(b,{headers:{"Content-Type":type.split(";")[0],"Cache-Control":"private, max-age=60","Content-Security-Policy":"default-src 'none'; sandbox","X-Content-Type-Options":"nosniff"}});
  }
  if(type.includes("text/html")){
    const out=new HTMLRewriter()
      .on("script,style,iframe,frame,object,embed,form,input,button,textarea,select,base,link,meta,noscript,template,svg,math",new Strip())
      .on("*",new Clean(u,token))
      .transform(new Response(upstream.body,{headers:{"Content-Type":"text/html; charset=utf-8"}}));
    const h=new Headers(out.headers);h.set("Content-Security-Policy","default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");h.set("Referrer-Policy","no-referrer");h.set("X-Content-Type-Options","nosniff");h.set("Cache-Control","private, no-store");h.delete("Content-Length");
    return new Response(out.body,{headers:h});
  }
  if(type.startsWith("text/plain")){
    const b=await upstream.arrayBuffer();if(b.byteLength>MAX)return reply({error:"Page exceeds size limit."},413);
    return new Response("<!doctype html><meta charset=utf-8><pre style='white-space:pre-wrap'>"+esc(new TextDecoder().decode(b))+"</pre>",{headers:{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; sandbox"}});
  }
  return reply({error:"This content type is not supported."},415);
}
export default {async fetch(req,env){
  const ch=cors(req);if(ch===null)return reply({error:"Origin not allowed."},403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:ch});
  const u=new URL(req.url);
  try{
    if(u.pathname==="/health"&&req.method==="GET")return reply({service:"BSMS Web Cloud Reader",status:"ok",egress:"cloudflare"},200,ch);
    if(u.pathname==="/session"&&req.method==="POST"){
      const uid=req.headers.get("X-UID")||"",sid=req.headers.get("X-Session-ID")||"";
      if(!await accountValid(env,uid,sid))return reply({error:"Sign in and accept the current policies to use Reader."},401,ch);
      return reply({token:await signToken(uid,sid,env.READER_SIGNING_SECRET),expiresIn:TTL*1000},200,ch);
    }
    if(u.pathname==="/page"&&req.method==="GET"){
      const r=await fetchPage(req,env,u.searchParams.get("url"),u.searchParams.get("token"));
      const h=new Headers(r.headers);for(const [k,v] of Object.entries(ch))h.set(k,v);
      return new Response(r.body,{status:r.status,headers:h});
    }
    return reply({error:"Not found."},404,ch);
  }catch(e){console.error("[BSMS Reader]",e);return reply({error:"Reader service temporarily unavailable."},503,ch);}
}};
