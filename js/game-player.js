(() => {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("src");
  const requestedAssetBase = params.get("assetBase") || "";
  const title = params.get("title") || "Game";
  const frame = document.getElementById("gameFrame");
  const titleNode = document.getElementById("playerTitle");
  const loading = document.getElementById("playerLoading");
  const backLink = document.getElementById("vaultBack");

  document.title = title + " | BSMS Web";
  titleNode.textContent = title;

  const MAIN_RAW = "https://raw.githubusercontent.com/55gms/55GMS/main/static/";
  const GITHUB_RAW = "https://raw.githubusercontent.com/";

  let gameUrl;
  let assetBase = "";
  try {
    gameUrl = new URL(source || "");
    if (gameUrl.protocol !== "https:" ||
        gameUrl.hostname !== "raw.githubusercontent.com" ||
        !gameUrl.pathname.startsWith("/55gms/55GMS/")) {
      throw new Error("The game must be loaded from the 55GMS GitHub repository.");
    }
    if (requestedAssetBase) {
      const parsedBase = new URL(requestedAssetBase);
      if (parsedBase.hostname !== "raw.githubusercontent.com" ||
          !parsedBase.pathname.startsWith("/55gms/assets/")) {
        throw new Error("Invalid GitHub asset location.");
      }
      assetBase = parsedBase.href;
    }
  } catch (error) {
    loading.textContent = "This game's GitHub link is invalid.";
    frame.remove();
    return;
  }

  let returning = false;
  function returnToVault() {
    if (returning) return;
    returning = true;
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: "bsms-return-game-vault" }, window.location.origin);
      }
    } catch (error) {}
    try { window.close(); } catch (error) {}
    window.setTimeout(() => {
      if (!window.closed) window.location.replace("/g");
    }, 250);
  }

  history.pushState({ bsmsGame: true }, "", window.location.href + "#playing");
  window.addEventListener("popstate", returnToVault);
  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    returnToVault();
  });

  function rewriteGitHubSources(html) {
    // Move 55GMS asset-CDN URLs to the corresponding immutable GitHub raw files.
    html = html.replace(
      /https?:\/\/cdn\.jsdelivr\.net\/gh\/55gms\/assets@([^/]+)\//gi,
      "https://raw.githubusercontent.com/55gms/assets/$1/"
    );
    html = html.replace(
      /https?:\/\/cdn\.jsdelivr\.net\/gh\/55gms\/gms-ads@([^/]+)\//gi,
      "https://raw.githubusercontent.com/55gms/gms-ads/$1/"
    );

    // Replace 55GMS root-hosted files with their equivalents in the main GitHub repository.
    html = html.replace(/https?:\/\/(?:www\.)?55gms\.com\/assets\//gi, MAIN_RAW + "assets/");
    html = html.replace(/https?:\/\/(?:www\.)?55gms\.com\/img\//gi, MAIN_RAW + "img/");
    html = html.replace(/https?:\/\/(?:www\.)?55gms\.com\/misc\//gi, MAIN_RAW + "misc/");
    html = html.replace(/(["'(=])\/assets\//g, "$1" + MAIN_RAW + "assets/");
    html = html.replace(/(["'(=])\/img\//g, "$1" + MAIN_RAW + "img/");

    // Also rewrite any remaining literal references to the 55GMS origin to GitHub's raw host.
    html = html.replace(/https?:\/\/(?:www\.)?55gms\.com/gi, "https://raw.githubusercontent.com/55gms/55GMS/main/static");
    html = html.replace(/<script\b[^>]*src=["'][^"']*55gms\/gms-ads[^"']*["'][^>]*>\s*<\/script>/gi, "");

    // Replace an existing base URL, or add one so relative game files resolve against GitHub.
    const baseTag = assetBase
      ? '<base href="' + assetBase.replace(/"/g, "&quot;") + '">'
      : "";
    if (/<base\b[^>]*>/i.test(html)) {
      if (assetBase) html = html.replace(/<base\b[^>]*>/i, baseTag);
    } else if (baseTag) {
      html = html.replace(/<head([^>]*)>/i, "<head$1>" + baseTag);
    }
    return html;
  }

  async function loadGame() {
    try {
      const response = await fetch(gameUrl.href, { mode: "cors", credentials: "omit" });
      if (!response.ok) throw new Error("GitHub returned HTTP " + response.status);
      let html = await response.text();
      html = rewriteGitHubSources(html);
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
