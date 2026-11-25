// layout.js — the parts every page shares: top bar, header, footer, phone tab bar,
// language and theme switches, the city menu, and the officer session.

import { h, icon, showPendingToast, toast, readJSON, writeJSON } from "./helpers.js";
import { t, prefs, setPref } from "./i18n.js";
import { CITIES, ZONES } from "./data.js";
import * as store from "./store.js";

const OFFICER = "cc.officer", PIN = "cc.officerPin.v1";

/** Is an officer signed in (this browser tab session)? */
export function isOfficer() {
  try { return sessionStorage.getItem(OFFICER) === "1"; } catch { return false; }
}
/** Sign the officer in or out. */
export function setOfficer(on) {
  try { on ? sessionStorage.setItem(OFFICER, "1") : sessionStorage.removeItem(OFFICER); } catch { /* ignore */ }
}

/** Has an officer PIN been set up on this device? */
export function hasOfficerPin() {
  const saved = readJSON(PIN, null);
  return !!(saved && saved.salt && saved.hash);
}

/** SHA-256 of salt + PIN, as hex (the PIN itself is never stored). */
async function pinHash(salt, pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Save a new officer PIN; returns false if storage refused. */
export async function setOfficerPin(pin) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  return writeJSON(PIN, { salt, hash: await pinHash(salt, pin) });
}

/** Does this PIN match the saved one? */
export async function checkOfficerPin(pin) {
  const saved = readJSON(PIN, null);
  return !!(saved && saved.salt) && saved.hash === (await pinHash(saved.salt, pin));
}

/** Apply theme: saved choice, else the device setting. */
function applyTheme() {
  const p = prefs().theme;
  const dark = p ? p === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", "#14306E");
  return dark;
}

/** Two-button switch (EN/தமிழ், light/dark). */
function switchGroup(label, items) {
  return h("div", { class: "switch", role: "group", "aria-label": label },
    items.map((it) => h("button", { type: "button", class: "switch-btn", "aria-pressed": it.on ? "true" : "false", "aria-label": it.aria || null, title: it.aria || null, lang: it.lang || null, onclick: it.onclick }, it.content)));
}

/** City chooser in the top bar (only Greater Chennai is live). */
function cityMenu(rerender) {
  const wrap = h("div", { class: "city" });
  const btn = h("button", { type: "button", class: "city-btn", "aria-haspopup": "listbox", "aria-expanded": "false" }, icon("pin", 16), t("Greater Chennai"), h("span", { class: "caret", "aria-hidden": "true", text: "▾" }));
  const list = h("ul", { class: "city-list", role: "listbox", "aria-label": t("Choose your city corporation"), hidden: true });
  const tagText = { live: "Live", next: "Coming next", planned: "Planned" };
  for (const c of CITIES) {
    list.append(h("li", {}, h("button", { type: "button", role: "option", class: "city-opt" + (c.state === "live" ? " on" : ""), "aria-selected": c.state === "live" ? "true" : "false",
      onclick: () => {
        close();
        if (c.state !== "live") {
          toast(c.state === "next" ? t("{city} is coming next — the pilot runs in Greater Chennai first", { city: t(c.en) }) : t("{city} is planned — the pilot runs in Greater Chennai first", { city: t(c.en) }), { kind: "info" });
        }
      } }, h("span", { text: t(c.en) }), h("span", { class: "tag tag-" + c.state, text: t(tagText[c.state]) }))));
  }
  const open = () => { list.hidden = false; btn.setAttribute("aria-expanded", "true"); list.querySelector("button")?.focus(); document.addEventListener("click", outside, true); document.addEventListener("keydown", esc); };
  const close = () => { list.hidden = true; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("click", outside, true); document.removeEventListener("keydown", esc); };
  const outside = (e) => { if (!wrap.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === "Escape") { close(); btn.focus(); } };
  btn.addEventListener("click", () => (list.hidden ? open() : close()));
  wrap.append(btn, list);
  return wrap;
}

/** Logo + name, links home. */
function brand() {
  return h("a", { href: "index.html", class: "brand" },
    h("img", { src: "img/logo-96.png", alt: "", width: 44, height: 44, class: "brand-logo" }),
    h("span", { class: "brand-text" },
      h("span", { class: "brand-name" }, "CITIZEN ", h("span", { class: "brand-accent", text: "CONNECT" })),
      h("span", { class: "brand-sub" }, h("span", { lang: "ta", text: "குடிமக்கள் இணைப்பு" }), h("span", { class: "dash", "aria-hidden": "true" }), h("span", { text: "NAMMA OORU FIX" }))));
}

/** Header (two bars) for citizen or officer pages. */
function header(active, officerPage, rerender) {
  const p = prefs();
  const dark = document.documentElement.dataset.theme === "dark";
  const left = officerPage
    ? h("div", { class: "util-left" }, icon("shield", 16), h("span", { class: "util-strong", text: t("Officer mode · Greater Chennai") }))
    : h("div", { class: "util-left" }, cityMenu(rerender), h("span", { class: "util-muted hide-sm", text: t("Pilot city · Avadi and Tambaram next") }));
  const util = h("div", { class: "util" }, h("div", { class: "wrap util-in" }, left,
    h("div", { class: "util-right" },
      switchGroup(t("Language"), [
        { content: "EN", on: p.lang === "en", onclick: () => { setPref("lang", "en"); rerender(); } },
        { content: "தமிழ்", lang: "ta", on: p.lang === "ta", onclick: () => { setPref("lang", "ta"); rerender(); } },
      ]),
      switchGroup(t("Theme"), [
        { content: icon("sun", 16), aria: t("Light theme"), on: !dark, onclick: () => { setPref("theme", "light"); applyTheme(); rerender(true); } },
        { content: icon("moon", 16), aria: t("Dark theme"), on: dark, onclick: () => { setPref("theme", "dark"); applyTheme(); rerender(true); } },
      ]))));
  const need = store.myTabs().check;
  const tab = (href, key, label, extra) => h("a", { href, class: "nav-tab" + (active === key ? " on" : ""), "aria-current": active === key ? "page" : null }, label, extra);
  const nav = officerPage
    ? h("nav", { class: "nav nav-officer", "aria-label": t("Officer") },
        tab("officer.html", "officer", t("Dashboard")),
        h("button", { type: "button", class: "nav-btn", onclick: () => { setOfficer(false); location.href = "index.html"; } }, icon("out", 16), t("Sign out")))
    : h("nav", { class: "nav", "aria-label": t("Main") },
        tab("index.html", "home", t("Home")),
        tab("raise.html", "raise", t("Raise a complaint")),
        tab("my.html", "my", t("My complaints"), need ? h("span", { class: "count", "aria-label": t("{n} need your check", { n: need }), text: need }) : null),
        h("a", { href: isOfficer() ? "officer.html" : "login.html", class: "nav-btn" + (active === "login" ? " on" : "") }, icon("shield", 16), t("Officer login")));
  const main = h("header", { class: "head" }, h("div", { class: "wrap head-in" }, brand(), nav));
  return [util, main];
}

/** Bottom tab bar for phones. */
function tabbar(active, officerPage) {
  if (officerPage) return null;
  const need = store.myTabs().check;
  const item = (href, key, ico, label, badge) => h("a", { href, class: "tb-item" + (active === key ? " on" : ""), "aria-current": active === key ? "page" : null },
    h("span", { class: "tb-ico" }, icon(ico, 22), badge ? h("span", { class: "tb-badge", text: badge }) : null), h("span", { class: "tb-label", text: label }));
  return h("nav", { class: "tabbar", "aria-label": t("Main") },
    item("index.html", "home", "home", t("Home")),
    item("raise.html", "raise", "plus", t("Raise")),
    item("my.html", "my", "list", t("My complaints"), need || null),
    item(isOfficer() ? "officer.html" : "login.html", "login", "shield", t("Officer")));
}

/** Footer: zones, honesty note, school credit, CM helpline, erase data. */
function footer() {
  return h("footer", { class: "foot" }, h("div", { class: "wrap foot-in" },
    h("div", {},
      h("p", { class: "foot-title", text: t("Covers all 15 zones of Greater Chennai") }),
      h("p", { class: "foot-zones", text: ZONES.map((z) => t(z.en)).join(" · ") })),
    h("div", { class: "foot-meta" },
      h("p", { text: t("Student prototype — not an official Greater Chennai Corporation app.") }),
      h("p", { text: t("For other government services, call 1100 (CM Helpline).") }),
      h("p", { class: "foot-muted" }, t("Made by Class XII students of"), " ", h("b", { text: t("Gandhiji Matriculation School, Avadi") }), " ", t("· Inter-School Hackathon 2026")),
      h("button", { type: "button", class: "link-btn", onclick: async () => {
        if (!confirmReset()) return;
        await store.reset();
        try { localStorage.removeItem(PIN); } catch { /* ignore */ }
        setOfficer(false);
        toast(t("All data on this device erased"));
        setTimeout(() => { location.href = "index.html"; }, 600);
      } }, t("Erase data on this device")))));
}

/** Ask before wiping (uses a simple built-in prompt-free two-tap confirm). */
let resetArmed = 0;
function confirmReset() {
  const now = Date.now();
  if (now - resetArmed < 4000) { resetArmed = 0; return true; }
  resetArmed = now;
  toast(t("This deletes every complaint, photo and the officer PIN on this device. Tap again to confirm."), { kind: "info", ms: 4000 });
  return false;
}

/**
 * Start a page: builds the shared layout and calls render(main) now and after every language change.
 * opts: { page, officer: bool, render(main), title() }
 */
export function boot({ page, officer = false, render, title }) {
  applyTheme();
  const body = document.body;
  const top = h("div", { id: "top" });
  const main = h("main", { id: "main", class: "main", tabindex: "-1" });
  const skip = h("a", { href: "#main", class: "skip", text: t("Skip to content") });
  body.replaceChildren(skip, top, main);

  const draw = (themeOnly = false) => {
    document.documentElement.lang = prefs().lang;
    if (title) document.title = "Citizen Connect — " + title();
    top.replaceChildren(...header(page, officer, draw));
    if (themeOnly) return;
    skip.textContent = t("Skip to content");
    render(main);
    body.querySelector(".foot")?.remove();
    body.querySelector(".tabbar")?.remove();
    body.append(footer());
    const tb = tabbar(page, officer);
    if (tb) body.append(tb);
  };
  main.classList.add("enter");
  draw();
  setTimeout(() => main.classList.remove("enter"), 600);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!prefs().theme) { applyTheme(); draw(true); } });
  showPendingToast();
  registerSW();
  return draw;
}

/** Register the service worker (offline + install) on https or localhost only. */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
