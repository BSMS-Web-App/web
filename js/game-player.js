(() => {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("src");
  const title = params.get("title") || "Game";
  const frame = document.getElementById("gameFrame");
  const titleNode = document.getElementById("playerTitle");
  const loading = document.getElementById("playerLoading");
  const backLink = document.getElementById("vaultBack");

  document.title = title + " | BSMS Web";
  titleNode.textContent = title;

  let gameUrl;
  try {
    gameUrl = new URL(source || "");
    if (gameUrl.protocol !== "https:") throw new Error("Only HTTPS game links are supported.");
  } catch (error) {
    loading.textContent = "This game link is invalid.";
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

  // The extra same-document history entry lets the browser Back button
  // return to the originating Game Vault tab where supported.
  history.pushState({ bsmsGame: true }, "", window.location.href + "#playing");
  window.addEventListener("popstate", returnToVault);
  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    returnToVault();
  });

  frame.addEventListener("load", () => {
    loading.style.display = "none";
  }, { once: true });

  frame.src = gameUrl.href;
})();
