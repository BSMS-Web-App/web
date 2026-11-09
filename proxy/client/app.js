const form = document.querySelector("#addressForm");
const input = document.querySelector("#addressInput");
const hint = document.querySelector("#formHint");
const dialog = document.querySelector("#aboutDialog");
const toast = document.querySelector("#toast");

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
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Unsupported protocol");
    }
    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      throw new Error("Invalid host");
    }
    hint.textContent = `Address recognized: ${parsed.hostname}. The browsing gateway is not connected yet.`;
    showToast("The proxy gateway is still being built.");
  } catch {
    hint.textContent = "That address doesn't look valid. Try a full website domain.";
    input.focus();
  }
});

document.querySelector("#aboutButton").addEventListener("click", () => dialog.showModal());
document.querySelector("#closeAbout").addEventListener("click", () => dialog.close());
document.querySelector("#doneAbout").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
