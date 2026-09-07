/* South Coast Cane - shared interactions
   No frameworks. Mockup-level behavior only. */

(function () {
  "use strict";

  /* ---- Mobile nav toggle ---- */
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      links.classList.toggle("open");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") links.classList.remove("open");
    });
  }

  /* ---- Library filter (mockup) ---- */
  var filterBtns = document.querySelectorAll(".filter-btn");
  var items = document.querySelectorAll("[data-series]");
  if (filterBtns.length) {
    filterBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterBtns.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var key = btn.getAttribute("data-filter");
        items.forEach(function (item) {
          var match = key === "all" || item.getAttribute("data-series") === key;
          item.style.display = match ? "" : "none";
        });
      });
    });
  }

  /* ---- Simulated live-status toggle ----
     In production this is driven by the Cloudflare Stream / YouTube API.
     Here a button lets you preview both states. */
  var demoBtn = document.querySelector("[data-toggle-live]");
  if (demoBtn) {
    demoBtn.addEventListener("click", function () {
      var live = document.body.classList.toggle("state-live");
      demoBtn.textContent = live ? "Preview offline state" : "Preview live state";

      document.querySelectorAll(".live-pill").forEach(function (pill) {
        pill.classList.toggle("is-live", live);
        var label = pill.querySelector(".label");
        if (label) label.textContent = live ? "Live now" : "Offline";
      });

      var offlineTag = document.querySelector(".player-offline-tag .live-pill");
      var playerArt = document.querySelector(".player-art .big");
      if (playerArt) {
        playerArt.textContent = live
          ? "Live stream playing"
          : "Stream is offline";
      }
    });
  }

  /* ---- Footer year ---- */
  var yr = document.querySelector("[data-year]");
  if (yr) yr.textContent = new Date().getFullYear();
})();
