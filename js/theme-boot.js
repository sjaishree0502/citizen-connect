// theme-boot.js — runs before the first paint (a normal, blocking script in <head>) so each page opens
// straight in the saved theme and language, without a light-to-dark flash. Mirrors prefs() in i18n.js.
(function () {
  var p = {};
  try { p = JSON.parse(localStorage.getItem("cc.prefs.v1")) || {}; } catch (e) { /* use defaults */ }
  var dark = p.theme === "dark" || (p.theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.lang = p.lang === "ta" ? "ta" : "en";
})();
