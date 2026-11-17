(() => {
"use strict";

const slug = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
const frame = document.getElementById("gameFrame");
const title = document.getElementById("playerTitle");
const saveStatus = document.getElementById("saveStatus");
const loading = document.getElementById("playerLoading");
const loadingTitle = document.getElementById("loadingTitle");
const loadingCaption = document.getElementById("loadingCaption");
const back = document.getElementById("vaultBack");
const CDN_MAIN = "https://cdn.jsdelivr.net/gh/55gms/55GMS@main/static/";

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
let frameLoadTimer = null;
let cloudRestoreAvailable = false;

function gameSlug(game) {
  try {
    const path = new URL(game.launchUrl).pathname.split("/misc/")[1];
    if (path) return path.split("/")[0].toLowerCase();
  } catch {}
  return String(game.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}


function assetBase(image) {
  const match = String(image || "").match(/^https:\/\/raw\.githubusercontent\.com\/55gms\/assets\/([^/]+)\/(misc\/[^/]+\/)/i);
  return match ? "https://cdn.jsdelivr.net/gh/55gms/assets@" + match[1] + "/" + match[2] : "";
}

function setSaveStatus(message, state = "idle", detail = "") {
  if (!saveStatus) return;
  saveStatus.textContent = message;
  saveStatus.dataset.state = state;
  saveStatus.title = detail || message;
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
  setSaveStatus("Saving to your account…", "saving");
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
    setSaveStatus("Saved to your account", "saved", "Your supported game save data is synced to your BSMS Web account.");
  } catch (error) {
    console.warn("[BSMS Web :: Game Player] Save sync failed", error);
    setSaveStatus("Cloud save unavailable — retrying", "error", error.message || "Cloud save failed.");
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
    .replace(/<script\b[^>]*src=["'][^"']*(?:gms-ads|poki-sdk(?:-core)?\.js)[^"']*["'][^>]*>\s*<\/script>/gi, "");

  // Many 55GMS titles include Poki's advertising SDK. It is not needed to run
  // the game itself and can fail outside Poki's hosted environment. Remove
  // those SDK loaders and provide a compatible no-ad API instead.
  const pokiShim = '<script>(function(){var noop=function(){};var done=function(v){return Promise.resolve(v)};window.PokiSDK={init:function(){return done()},initWithVideoHB:function(){return done()},gameLoadingStart:noop,gameLoadingFinished:noop,gameInteractive:noop,gameplayStart:noop,gameplayStop:noop,roundStart:noop,roundEnd:noop,muteAd:noop,disableProgrammatic:noop,customEvent:noop,destroyAd:noop,commercialBreak:function(){return done()},rewardedBreak:function(){return done(false)},getLeaderboard:function(){return done([])},setDebug:noop,gameLoadingProgress:noop,happyTime:noop,setPlayerAge:noop,togglePlayerAdvertisingConsent:noop,toggleNonPersonalized:noop,setConsentString:noop,logError:noop,sendHighscore:noop};})();<\/script>';
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, head => head + pokiShim);
  else html = pokiShim + html;

  // Send game files directly to jsDelivr. No game HTML or asset request is
  // proxied through Vercel or the BSMS asset server.
  html = html.replace(
    /https?:\/\/raw\.githubusercontent\.com\/55gms\/(55GMS|assets)\/([^/"'\s)]+)\/([^"'\s)]+)/gi,
    "https://cdn.jsdelivr.net/gh/55gms/$1@$2/$3"
  );

  // Rewrite legacy 55GMS paths to the public 55GMS CDN.
  html = html
    .replace(/https?:\/\/(?:www\.)?55gms\.com\/assets\//gi, CDN_MAIN + "assets/")
    .replace(/https?:\/\/(?:www\.)?55gms\.com\/img\//gi, CDN_MAIN + "img/")
    .replace(/https?:\/\/(?:www\.)?55gms\.com\/misc\//gi, CDN_MAIN + "misc/")
    .replace(/(["'(=])\/assets\//g, "$1" + CDN_MAIN + "assets/")
    .replace(/(["'(=])\/img\//g, "$1" + CDN_MAIN + "img/")
    .replace(/(["'(=])\/misc\//g, "$1" + CDN_MAIN + "misc/");

  const bridge = saveBridge();
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, head => head + bridge);
  else html = bridge + html;

  // Keep the base URL supplied by the game itself. It points to the exact
  // asset directory/version and is more reliable than guessing from a thumbnail.
  // Only inject a fallback when the source HTML has no base element.
  if (base && !/<base\b[^>]*>/i.test(html)) {
    const baseTag = '<base href="' + base.replace(/"/g, "&quot;") + '">';
    if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, head => head + baseTag);
    else html = baseTag + html;
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
    loadingCaption.textContent = "Connecting directly to the game CDN…";

    if (cloud) {
      setSaveStatus("Loading your cloud save…", "saving");
      try {
        restore((await getCloud()).saveData || {});
        cloudRestoreAvailable = true;
        setSaveStatus("Cloud save ready", "saved", "Your account save has been loaded. Changes will sync automatically.");
      } catch (error) {
        console.warn("[BSMS Web] Cloud restore failed", error);
        setSaveStatus("Cloud save unavailable — using device save", "error", error.message || "Could not load the account save.");
      }
    } else {
      setSaveStatus("Saved on this device", "idle", "Sign in to BSMS Web to sync supported game saves across devices.");
    }

    last = JSON.stringify(saveData());
    ready = true;

    // Retrieve the HTML straight from GitHub. Game resources load directly
    // from their jsDelivr base URL or the CDN fallback below.
    const gameResponse = await fetch(sourceUrl.href, { cache: "force-cache" });
    if (!gameResponse.ok) throw Error("The game HTML could not be retrieved.");
    const html = await gameResponse.text();

    frame.addEventListener("load", () => {
      clearTimeout(frameLoadTimer);
      frameLoadTimer = null;
      loading.classList.add("is-hidden");
      if (cloud) syncInterval = setInterval(() => sync(), 20000);
    }, { once: true });

    // Avoid leaving the player on an endless spinner if the document or one
    // of its required resources never finishes loading.
    frameLoadTimer = setTimeout(() => {
      if (!loading.classList.contains("is-hidden")) {
        showError("The game files did not finish loading. A required asset may be unavailable. Please return to the Game Vault and try again.");
      }
    }, 60000);

    // Prefer the exact base URL embedded in the source HTML. If it is absent,
    // use the catalog image directory as a fallback, then the launch file's folder.
    const launchPath = sourceUrl.pathname.replace(/^\/55gms\/55GMS\/main\/static\//i, "");
    const launchDirectory = launchPath.slice(0, launchPath.lastIndexOf("/") + 1);
    const launchBase = CDN_MAIN + launchDirectory;
    const fallbackBase = assetBase(game.image) || launchBase;
    frame.srcdoc = rewriteGameHtml(html, fallbackBase);
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
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sync(true); });

back.addEventListener("click", event => {
  event.preventDefault();
  sync(true);
  location.assign("/g");
});

load();
})();