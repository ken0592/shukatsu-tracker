(function (global) {
  "use strict";

  // Use the device's local date, matching the calendar and mascot.
  function getSeason(date = new Date()) {
    const month = date.getMonth() + 1;
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
  }

  const api = { getSeason };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SHUKATSU_SEASONS = api;
  const doc = global.document;
  if (!doc) return;

  const colors = { spring: "#a33b67", summer: "#087b79", autumn: "#a44924", winter: "#3e63a3" };
  let timer;
  function refresh() {
    global.clearTimeout(timer);
    const now = new Date();
    const season = getSeason(now);
    if (doc.documentElement.dataset.season !== season) {
      doc.documentElement.dataset.season = season;
      doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors[season]);
    }
    // Recheck at local midnight, and when a sleeping/hidden page returns.
    if (doc.visibilityState !== "hidden") {
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = global.setTimeout(refresh, midnight - now + 100);
    }
  }
  refresh();
  doc.addEventListener("visibilitychange", refresh);
  global.addEventListener("pageshow", refresh);
})(typeof window !== "undefined" ? window : globalThis);
