/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

(() => {
  const popup = document.getElementById("gameNoticePopup");
  const button = document.getElementById("gameNoticeGotIt");
  if (!popup || !button) return;

  const dismissedKey = "bsms_game_origin_notice_dismissed_v1";

  try {
    if (localStorage.getItem(dismissedKey) === "true") return;
  } catch {
    // If storage is unavailable, still show the notice for this visit.
  }

  popup.classList.add("show");
  button.focus();

  button.addEventListener("click", () => {
    try {
      localStorage.setItem(dismissedKey, "true");
    } catch {
      // The notice can still be dismissed for the current page view.
    }
    popup.classList.remove("show");
  });
})();
