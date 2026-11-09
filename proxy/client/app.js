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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = input.value.trim();

  if (!value) {
    hint.textContent = "Enter a website address to prepare a session.";
    input.focus();
    return;
  }

  let candidate = value;
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported protocol");
    if (!parsed.hostname || !parsed.hostname.includes(".")) throw new Error("Invalid host");
    hint.textContent = `Address recognized: ${parsed.hostname}. Website navigation is not connected yet.`;
    showToast("Website browsing is not available in this preview.");
  } catch {
    hint.textContent = "That address doesn't look valid. Try a full website domain.";
    input.focus();
  }
});

testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  testButton.textContent = "Testing…";
  connectionTitle.textContent = "Checking outbound connection";
  connectionDescription.textContent = "Contacting the fixed IP-check service from the proxy server.";

  try {
    const response = await fetch("/api/egress-check", {
      method: "GET",
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
