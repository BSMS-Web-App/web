(() => {
"use strict";

const slug = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
const frame = document.getElementById("gameFrame");
const title = document.getElementById("playerTitle");
const loading = document.getElementById("playerLoading");
const loadingTitle = document.getElementById("loadingTitle");
const loadingCaption = document.getElementById("loadingCaption");
const back = document.getElementById("vaultBack");
const MAIN = "/game-assets/55gms/55GMS/main/static/";

const sid = localStorage.getItem("session_id") || "";
let auth = null;
try { auth = JSON.parse(localStorage.getItem("bsms_auth_session") || "null"); } catch {}
const uid = auth && auth.loggedIn === true ? String(auth.uid || "") : "";
const cloud = !!(sid && uid);

let id = "";
let prefix = "";
let ready = false;
let busy = false;
let again = false;
let last = "";
let timer = null;
let syncInterval = null;

function gameSlug(game) {
  try {
    const path = new URL(game.launchUrl).pathname.split("/misc/")[1];
    if (path) return path.split("/")[0].toLowerCase();
  } catch {}
  return String(game.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}


function assetBase(image) {
  const match = String(image || "").match(/^https:\/\/raw\.githubusercontent\.com\/55gms\/assets\/([^/]+)\/(misc\/[^/]+\/)/i);
  return match ? "/game-assets/55gms/assets/" + match[1] + "/" + match[2] : "";
}

function saveData() {
  const output = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) output[key.slice(prefix.length)] = localStorage.getItem(key);
  }
  return output;
}

function restore(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && key.length <= 500) localStorage.setItem(prefix + key, value);
  }
}

async function getCloud() {
  const response = await fetch("/api/games/saves?gameId=" + encodeURIComponent(id), {
    headers: { "X-Session-ID": sid, "X-UID": uid },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || "Cloud save unavailable");
  return data;
}

async function sync(keep = false) {
  if (!cloud || !ready || !id) return;
  if (busy) { again = true; return; }
  busy = true;
  try {
    const data = saveData();
    const serialized = JSON.stringify(data);
    if (serialized !== last) {
      const body = JSON.stringify({ action: "saveImportedGame", gameId: id, saveData: data });
      const response = await fetch("/api/games/saves", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": sid,
          "X-UID": uid
        },
        body,
        keepalive: !!keep && new Blob([body]).size <= 60000,
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(result.error || "Cloud save failed");
      last = serialized;
    }
  } catch (error) {
    console.warn("[BSMS Web :: Game Player] Save sync failed", error);
  } finally {
    busy = false;
    if (again) { again = false; sync(); }
  }
}

function scheduleSync() {
  if (!cloud || !ready) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync(), 1000);
}

function saveBridge() {
  const code = [
    "(function(){",
    "var p=" + JSON.stringify(prefix) + ";",
    "var s=Storage.prototype,g=s.getItem,a=s.setItem,r=s.removeItem,k=s.key,d=Object.getOwnPropertyDescriptor(s,'length');",
    "s.getItem=function(x){return g.call(this,p+String(x))};",
    "s.setItem=function(x,v){a.call(this,p+String(x),String(v));try{parent.postMessage({type:'bsms-55gms-save-change'},location.origin)}catch(e){}};",
    "s.removeItem=function(x){r.call(this,p+String(x));try{parent.postMessage({type:'bsms-55gms-save-change'},location.origin)}catch(e){}};",
    "s.clear=function(){var z=[];for(var i=0;i<d.get.call(this);i++){var x=k.call(this,i);if(x&&x.indexOf(p)===0)z.push(x)}z.forEach(function(x){r.call(this,x)},this);try{parent.postMessage({type:'bsms-55gms-save-change'},location.origin)}catch(e){}};",
    "s.key=function(i){var z=[];for(var n=0;n<d.get.call(this);n++){var x=k.call(this,n);if(x&&x.indexOf(p)===0)z.push(x.slice(p.length))}return z[i]===undefined?null:z[i]};",
    "try{Object.defineProperty(s,'length',{configurable:true,get:function(){var n=0;for(var i=0;i<d.get.call(this);i++){var x=k.call(this,i);if(x&&x.indexOf(p)===0)n++}return n}})}catch(e){}",
    "})();"
  ];
  return "<script>" + code.join("") + "<\/script>";
}

function rewriteGameHtml(html, base) {
  html = html
    .replace(/<script\b[^>]*src=["'][^"']*save-agent\.js[^"']*["'][^>]*>\s*<\/script>/gi, "")
    .replace(/<script\b[^>]*src=["'][^"']*(?:gms-ads|poki-sdk)[^"']*["'][^>]*>\s*<\/script>/gi, "");

  // Route raw GitHub files from the two approved 55GMS repositories through BSMS Web.
  html = html.replace(
    /https?:\/\/raw\.githubusercontent\.com\/(55gms)\/(55GMS|assets)\/([^/"'\s)]+)\/([^"'\s)]+)/gi,
    "/game-assets/$1/$2/$3/$4"
  ).replace(
    /https?:\/\/cdn\.jsdelivr\.net\/gh\/55gms\/(55GMS|assets)@([^/"'\s)]+)\/([^"'\s)]+)/gi,
    "/game-assets/55gms/$1/$2/$3"
  );

  // Rewrite old 55GMS absolute URLs to the same-origin static mirror.
  html = html
    .replace(/https?:\/\/(?:www\.)?55gms\.com\/assets\//gi, MAIN + "assets/")
    .replace(/https?:\/\/(?:www\.)?55gms\.com\/img\//gi, MAIN + "img/")
    .replace(/https?:\/\/(?:www\.)?55gms\.com\/misc\//gi, MAIN + "misc/")
    .replace(/(["'(=])\/assets\//g, "$1" + MAIN + "assets/")
    .replace(/(["'(=])\/img\//g, "$1" + MAIN + "img/")
    .replace(/(["'(=])\/misc\//g, "$1" + MAIN + "misc/");

  const bridge = saveBridge();
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, head => head + bridge);
  else html = bridge + html;

  if (base) {
    const baseTag = '<base href="' + base.replace(/"/g, "&quot;") + '">';
    if (/<base\b[^>]*>/i.test(html)) html = html.replace(/<base\b[^>]*>/i, baseTag);
    else if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, head => head + baseTag);
  }
  return html;
}

function showError(message) {
  loading.classList.remove("is-hidden");
  loading.classList.add("is-error");
  loadingTitle.textContent = "We couldn't load this game";
  loadingCaption.textContent = message || "Please return to the Game Vault and try again.";
}

async function load() {
  try {
    loadingTitle.textContent = "Preparing your game";
    loadingCaption.textContent = "Connecting to the game library…";

    const catalogResponse = await fetch("/data/55gms-games.json", { cache: "no-store" });
    if (!catalogResponse.ok) throw Error("The game library is unavailable.");
    const catalog = await catalogResponse.json();
    const game = catalog.find(item => gameSlug(item) === slug);
    if (!game) throw Error("This game could not be found in the library.");

    const sourceUrl = new URL(game.launchUrl);
    if (
      sourceUrl.protocol !== "https:" ||
      sourceUrl.hostname !== "raw.githubusercontent.com" ||
      !sourceUrl.pathname.startsWith("/55gms/55GMS/")
    ) throw Error("This game has an invalid source.");

    id = String(game.id || slug).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
    prefix = "bsms_55gms_" + (cloud ? "account_" + uid : "guest_" + (sid || "local")) + "_" + id + "_";

    document.title = game.name + " | BSMS Web";
    title.textContent = game.name;
    loadingTitle.textContent = "Loading " + game.name;
    loadingCaption.textContent = "Fetching game files through BSMS Web…";

    if (cloud) {
      try { restore((await getCloud()).saveData || {}); }
      catch (error) { console.warn("[BSMS Web] Cloud restore failed", error); }
    }

    last = JSON.stringify(saveData());
    ready = true;

    const sameOriginPath = sourceUrl.pathname.replace(
      /^\/55gms\/55GMS\//,
      "/game-assets/55gms/55GMS/"
    );
    const gameResponse = await fetch(sameOriginPath, { cache: "force-cache" });
    if (!gameResponse.ok) throw Error("The game HTML could not be retrieved.");
    const html = await gameResponse.text();

    frame.addEventListener("load", () => {
      loading.classList.add("is-hidden");
      if (cloud) syncInterval = setInterval(() => sync(), 20000);
    }, { once: true });

    frame.srcdoc = rewriteGameHtml(html, assetBase(game.image));
  } catch (error) {
    console.error("[BSMS Web :: Game Player]", error);
    showError(error.message);
  }
}

addEventListener("message", event => {
  if (event.origin === location.origin && event.data && event.data.type === "bsms-55gms-save-change") {
    scheduleSync();
  }
});
addEventListener("pagehide", () => sync(true));
addEventListener("beforeunload", () => sync(true));

back.addEventListener("click", event => {
  event.preventDefault();
  sync(true);
  location.assign("/g");
});

load();
})();