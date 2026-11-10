const form = document.querySelector("#addressForm");
const input = document.querySelector("#addressInput");
const hint = document.querySelector("#formHint");
const dialog = document.querySelector("#aboutDialog");
const toast = document.querySelector("#toast");
const testButton = document.querySelector("#connectionTestButton");
const connectionTitle = document.querySelector("#connectionTitle");
const connectionDescription = document.querySelector("#connectionDescription");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function getOwnedSitePath(value) {
  let candidate = value.trim();
  if (!candidate) throw new Error("Enter a BSMS Web website address.");

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:" ||
      !["bsms-web.com", "www.bsms-web.com"].includes(parsed.hostname) ||
      parsed.port || parsed.username || parsed.password) {
    throw new Error("For this first test, enter a page on https://bsms-web.com.");
  }
  return parsed.pathname + parsed.search;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  let sitePath;

  try {
    sitePath = getOwnedSitePath(input.value);
  } catch (error) {
    hint.textContent = error.message;
    input.focus();
    return;
  }

  hint.textContent = "Requesting the BSMS Web page from the proxy server…";
  connectionTitle.textContent = "Fetching BSMS Web";
  connectionDescription.textContent = "The server is requesting the page. Its HTML will not be executed.";
  const goButton = form.querySelector("button[type=submit]");
  goButton.disabled = true;
  goButton.textContent = "Checking…";

  try {
    const response = await fetch(`/api/site-check?path=${encodeURIComponent(sitePath)}`, {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The site request failed.");

    connectionTitle.textContent = `BSMS Web responded · HTTP ${result.statusCode}`;
    connectionDescription.textContent = `${result.title} · ${result.bytesReceived.toLocaleString()} bytes received by the server`;
    hint.textContent = `Successfully requested ${result.destination}${result.finalPath}`.replace(/\s+/g, " ");
    showToast("The proxy server reached BSMS Web.");
  } catch (error) {
    connectionTitle.textContent = "Website request failed";
    connectionDescription.textContent = error.message || "The proxy server could not fetch that page.";
    hint.textContent = "Check the address and try again.";
    showToast("The BSMS Web request could not be completed.");
  } finally {
    goButton.disabled = false;
    goButton.innerHTML = 'Continue <span aria-hidden="true">→</span>';
  }
});

testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  testButton.textContent = "Testing…";
  connectionTitle.textContent = "Checking outbound connection";
  connectionDescription.textContent = "Contacting the fixed IP-check service from the proxy server.";

  try {
    const response = await fetch("/api/egress-check", {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Connection test failed.");

    connectionTitle.textContent = "Server connection verified";
    connectionDescription.textContent = `Server outbound IP: ${result.outboundIp}`;
    showToast("The server's outbound connection is working.");
  } catch (error) {
    connectionTitle.textContent = "Connection test unavailable";
    connectionDescription.textContent = error.message || "The server could not complete the test.";
    showToast("Could not verify the server connection.");
  } finally {
    testButton.disabled = false;
    testButton.textContent = "Test again";
  }
});

document.querySelector("#aboutButton").addEventListener("click", () => dialog.showModal());
document.querySelector("#closeAbout").addEventListener("click", () => dialog.close());
document.querySelector("#doneAbout").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
