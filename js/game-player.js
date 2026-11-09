(() => {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("src");
  const requestedAssetBase = params.get("assetBase") || "";
  const gameId = (params.get("id") || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  const title = params.get("title") || "Game";
  const frame = document.getElementById("gameFrame");
  const titleNode = document.getElementById("playerTitle");
  const loading = document.getElementById("playerLoading");
  const backLink = document.getElementById("vaultBack");

  document.title = title + " | BSMS Web";
  titleNode.textContent = title;

  const MAIN_RAW = "https://raw.githubusercontent.com/55gms/55GMS/main/static/";
  let gameUrl;
  let assetBase = "";

  try {
    gameUrl = new URL(source || "");
    if (gameUrl.protocol !== "https:" ||
        gameUrl.hostname !== "raw.githubusercontent.com" ||
        !gameUrl.pathname.startsWith("/55gms/55GMS/")) {
      throw new Error("Invalid game source.");
    }
    if (requestedAssetBase) {
      const parsedBase = new URL(requestedAssetBase);
      if (parsedBase.protocol !== "https:" ||
          parsedBase.hostname !== "raw.githubusercontent.com" ||
          !parsedBase.pathname.startsWith("/55gms/assets/")) {
        throw new Error("Invalid asset source.");
      }
      assetBase = parsedBase.href;
    }
  } catch (error) {
    loading.textContent = "This game's GitHub link is invalid.";
    frame.remove();
    return;
  }

  const sessionId = localStorage.getItem("session_id") || "";
  let authSession = null;
  try {
    authSession = JSON.parse(localStorage.getItem("bsms_auth_session") || "null");
  } catch (error) {}
  const accountUid = authSession && authSession.loggedIn === true ? String(authSession.uid || "") : "";
  const isAccountSave = !!(sessionId && accountUid);
  const saveScope = isAccountSave ? "account_" + accountUid : "guest_" + (sessionId || "local");
  const storagePrefix = "bsms_55gms_" + saveScope + "_" + gameId + "_";
  const cloudEndpoint = "/api/games/saves";
  let saveTimer = null;
  let syncBusy = false;
  let syncAgain = false;
  let cloudReady = false;
  let lastSerialized = "";

  function getScopedSaveData() {
    const result = {};
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && key.startsWith(storagePrefix)) {
        result[key.slice(storagePrefix.length)] = localStorage.getItem(key);
      }
    }
    return result;
  }

  function storeScopedSaveData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    for (const key of Object.keys(data)) {
      if (key.length <= 500 && typeof data[key] === "string") {
        localStorage.setItem(storagePrefix + key, data[key]);
      }
    }
  }

  async function requestCloudSave(method, body) {
    const headers = {
      "X-Session-ID": sessionId,
      "X-UID": accountUid
    };
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(cloudEndpoint + (method === "GET" ? "?gameId=" + encodeURIComponent(gameId) : ""), {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Cloud save request failed.");
    return data;
  }

  async function syncCloudSave(keepalive) {
    if (!isAccountSave || !cloudReady) return;
    if (syncBusy) {
      syncAgain = true;
      return;
    }
    syncBusy = true;
    try {
      const saveData = getScopedSaveData();
      const serialized = JSON.stringify(saveData);
      if (serialized !== lastSerialized) {
        const headers = {
          "Content-Type": "application/json",
          "X-Session-ID": sessionId,
          "X-UID": accountUid
        };
        const requestBody = JSON.stringify({ action: "saveImportedGame", gameId, saveData });
        const response = await fetch(cloudEndpoint, {
          method: "POST",
          headers,
          body: requestBody,
          keepalive: !!keepalive && new Blob([requestBody]).size <= 60000,
          cache: "no-store"
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Cloud save failed.");
        lastSerialized = serialized;
      }
    } catch (error) {
      console.warn("[BSMS Web :: Game Player] Cloud save sync failed:", error);
    } finally {
      syncBusy = false;
      if (syncAgain) {
        syncAgain = false;
        syncCloudSave(false);
      }
    }
  }

  function scheduleCloudSave() {
    if (!isAccountSave || !cloudReady) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => syncCloudSave(false), 1200);
  }

  async function restoreCloudSave() {
    if (!isAccountSave) {
      cloudReady = true;
      return;
    }
    try {
      const result = await requestCloudSave("GET");
      storeScopedSaveData(result.saveData || {});
      lastSerialized = JSON.stringify(getScopedSaveData());
    } catch (error) {
      console.warn("[BSMS Web :: Game Player] Could not restore cloud save:", error);
    }
    cloudReady = true;
  }

  function makeStorageBridge() {
    const bridge = [
      "(function(){",
      "var prefix=" + JSON.stringify(storagePrefix) + ";",
      "var proto=Storage.prototype;",
      "var originalGet=proto.getItem;",
      "var originalSet=proto.setItem;",
      "var originalRemove=proto.removeItem;",
      "var originalClear=proto.clear;",
      "var originalKey=proto.key;",
      "var originalLength=Object.getOwnPropertyDescriptor(proto,'length');",
      "proto.getItem=function(key){return originalGet.call(this,prefix+String(key));};",
      "proto.setItem=function(key,value){originalSet.call(this,prefix+String(key),String(value));try{parent.postMessage({type:'bsms-55gms-save-change'},location.origin);}catch(e){}};",
      "proto.removeItem=function(key){originalRemove.call(this,prefix+String(key));try{parent.postMessage({type:'bsms-55gms-save-change'},location.origin);}catch(e){}};",
      "proto.clear=function(){var keys=[];for(var i=0;i<originalLength.get.call(this);i++){var key=originalKey.call(this,i);if(key&&key.indexOf(prefix)===0)keys.push(key);}keys.forEach(function(key){originalRemove.call(this,key);},this);try{parent.postMessage({type:'bsms-55gms-save-change'},location.origin);}catch(e){}};",
      "proto.key=function(index){var keys=[];for(var i=0;i<originalLength.get.call(this);i++){var key=originalKey.call(this,i);if(key&&key.indexOf(prefix)===0)keys.push(key.slice(prefix.length));}return keys[index]===undefined?null:keys[index];};",
      "if(originalLength&&originalLength.get){try{Object.defineProperty(proto,'length',{configurable:true,get:function(){var count=0;for(var i=0;i<originalLength.get.call(this);i++){var key=originalKey.call(this,i);if(key&&key.indexOf(prefix)===0)count++;}return count;}});}catch(e){}}",
      "})();"
    ];
    return "<script>" + bridge.join("") + "<\/script>";
  }

  function rewriteGitHubSources(html) {
    html = html.replace(
      /https?:\/\/cdn\.jsdelivr\.net\/gh\/55gms\/assets@([^/]+)\//gi,
      "https://raw.githubusercontent.com/55gms/assets/$1/"
    );
    html = html.replace(
      /https?:\/\/cdn\.jsdelivr\.net\/gh\/55gms\/gms-ads@([^/]+)\//gi,
      "https://raw.githubusercontent.com/55gms/gms-ads/$1/"
    );
    html = html.replace(/https?:\/\/(?:www\.)?55gms\.com\/assets\//gi, MAIN_RAW + "assets/");
    html = html.replace(/https?:\/\/(?:www\.)?55gms\.com\/img\//gi, MAIN_RAW + "img/");
    html = html.replace(/https?:\/\/(?:www\.)?55gms\.com\/misc\//gi, MAIN_RAW + "misc/");
    html = html.replace(/([\"'(=])\/assets\//g, "$1" + MAIN_RAW + "assets/");
    html = html.replace(/([\"'(=])\/img\//g, "$1" + MAIN_RAW + "img/");
    html = html.replace(/https?:\/\/(?:www\.)?55gms\.com/gi, MAIN_RAW.slice(0, -1));
    html = html.replace(/<script\b[^>]*src=[\"'][^\"']*raw\.githubusercontent\.com\/55gms\/gms-ads[^\"']*[\"'][^>]*>\s*<\/script>/gi, "");

    const baseTag = assetBase ? '<base href="' + assetBase.replace(/"/g, "&quot;") + '">' : "";
    if (/<base\b[^>]*>/i.test(html)) {
      if (baseTag) html = html.replace(/<base\b[^>]*>/i, baseTag);
    } else if (baseTag) {
      html = html.replace(/<head([^>]*)>/i, "<head$1>" + baseTag);
    }

    const bridge = makeStorageBridge();
    if (/<head\b[^>]*>/i.test(html)) {
      html = html.replace(/<head\b[^>]*>/i, function (head) { return head + bridge; });
    } else {
      html = bridge + html;
    }
    return html;
  }

  let returning = false;
  function returnToVault() {
    if (returning) return;
    returning = true;
    syncCloudSave(true);
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: "bsms-return-game-vault" }, window.location.origin);
      }
    } catch (error) {}
    try { window.close(); } catch (error) {}
    setTimeout(() => {
      if (!window.closed) window.location.replace("/g");
    }, 250);
  }

  history.pushState({ bsmsGame: true }, "", window.location.href + "#playing");
  window.addEventListener("popstate", returnToVault);
  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    returnToVault();
  });

  window.addEventListener("message", (event) => {
    if (event.origin === window.location.origin && event.data && event.data.type === "bsms-55gms-save-change") {
      scheduleCloudSave();
    }
  });
  window.addEventListener("pagehide", () => syncCloudSave(true));
  window.addEventListener("beforeunload", () => syncCloudSave(true));
  window.setInterval(() => syncCloudSave(false), 20000);

  async function loadGame() {
    try {
      await restoreCloudSave();
      const response = await fetch(gameUrl.href, { mode: "cors", credentials: "omit" });
      if (!response.ok) throw new Error("GitHub returned HTTP " + response.status);
      const html = rewriteGitHubSources(await response.text());
      frame.srcdoc = html;
      frame.addEventListener("load", () => {
        loading.style.display = "none";
      }, { once: true });
    } catch (error) {
      console.error("[BSMS Web :: Game Player] GitHub game load failed:", error);
      loading.textContent = "Unable to load this game from GitHub. Please try again later.";
    }
  }

  loadGame();
})();
