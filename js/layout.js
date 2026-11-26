// layout.js — the parts every page shares: top bar, header, phone menu, footer,
// language and theme switches, the city menu, and the officer session.

import { h, icon, showPendingToast, toast, toastNext, readJSON, writeJSON, param } from "./helpers.js";
import { t, prefs, setPref, cityName } from "./i18n.js";
import { CITIES, ZONES } from "./data.js";
import * as store from "./store.js";

const OFFICER = "cc.officer", PIN = "cc.officerPin.v1", INTRO = "cc.introShown";

/** Is an officer signed in (this browser tab session)? A demo officer counts only while Demo mode is on. */
export function isOfficer() {
  try {
    const v = sessionStorage.getItem(OFFICER);
    return v === "1" || (v === "demo" && prefs().demo);
  } catch { return false; }
}
/** Sign the officer in (true, or "demo" for the no-PIN demo officer) or out (false). */
export function setOfficer(on) {
  try { on ? sessionStorage.setItem(OFFICER, on === "demo" ? "demo" : "1") : sessionStorage.removeItem(OFFICER); } catch { /* ignore */ }
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

/**
 * City chooser in the top bar. One live city (Greater Chennai or Avadi) is chosen at a time, and
 * every list and count shows only its complaints. Cities not live yet just say when they are coming.
 */
function cityMenu(rerender) {
  const chosen = prefs().city;
  const wrap = h("div", { class: "city" });
  const btn = h("button", { type: "button", class: "city-btn", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": t("City: {city}. Change city", { city: cityName(chosen) }) },
    icon("pin", 16), h("span", { class: "city-name", text: cityName(chosen) }), h("span", { class: "caret", "aria-hidden": "true", text: "▾" }));
  const list = h("ul", { class: "city-list", role: "listbox", "aria-label": t("Choose your city corporation"), hidden: true });
  const tagText = { live: "Live", next: "Coming next", planned: "Planned" };
  const choose = (c) => {
    close();
    if (c.state !== "live") {
      toast(c.state === "next" ? t("{city} is coming next — the pilot runs in Greater Chennai and Avadi first", { city: t(c.en) }) : t("{city} is planned — the pilot runs in Greater Chennai and Avadi first", { city: t(c.en) }), { kind: "info" });
      return;
    }
    if (c.key === chosen) return;
    setPref("city", c.key);
    rerender();
    document.querySelector(".city-btn")?.focus();
    toast(t("Showing complaints in {city}", { city: t(c.en) }), { kind: "info" });
  };
  for (const c of CITIES) {
    const on = c.key === chosen;
    list.append(h("li", {}, h("button", { type: "button", role: "option", class: "city-opt" + (on ? " on" : "") + (c.state === "live" ? "" : " soon"), "aria-selected": on ? "true" : "false", "aria-disabled": c.state === "live" ? null : "true", onclick: () => choose(c) },
      h("span", { class: "city-name" }, h("span", { class: "city-tick", "aria-hidden": "true" }, on ? icon("check", 16) : null), t(c.en)),
      h("span", { class: "tag tag-" + c.state, text: t(tagText[c.state]) }))));
  }
  const open = () => { list.hidden = false; btn.setAttribute("aria-expanded", "true"); list.querySelector("button")?.focus(); document.addEventListener("click", outside, true); document.addEventListener("keydown", esc); };
  const close = () => { list.hidden = true; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("click", outside, true); document.removeEventListener("keydown", esc); };
  const outside = (e) => { if (!wrap.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === "Escape") { close(); btn.focus(); } };
  btn.addEventListener("click", () => (list.hidden ? open() : close()));
  wrap.append(btn, list);
  return wrap;
}

/** True only the first time it is called in this browser tab (so the logo intro plays once, not on every redraw). */
function firstIntro() {
  try {
    if (sessionStorage.getItem(INTRO)) return false;
    sessionStorage.setItem(INTRO, "1");
  } catch { /* ignore */ }
  return true;
}
const firstPage = firstIntro(); // the first page of this visit: logo intro and content fade play once
let introPending = firstPage;     // only on that page's first draw, never on redraws

/** Logo + name, links home. */
function brand() {
  const intro = introPending;
  introPending = false;
  return h("a", { href: "index.html", class: "brand" },
    h("img", { src: "img/logo-96.png", alt: "", width: 44, height: 44, class: "brand-logo" + (intro ? " intro" : "") }),
    h("span", { class: "brand-text" },
      h("span", { class: "brand-name" }, "CITIZEN ", h("span", { class: "brand-accent", text: "CONNECT" })),
      h("span", { class: "brand-sub" }, h("span", { lang: "ta", text: "குடிமக்கள் இணைப்பு" }), h("span", { class: "dash", "aria-hidden": "true" }), h("span", { text: "NAMMA OORU FIX" }))));
}

/** Header (two bars) for citizen or officer pages. */
function header(active, officerPage, rerender) {
  const p = prefs();
  const dark = document.documentElement.dataset.theme === "dark";
  const left = officerPage
    ? h("div", { class: "util-left" }, h("span", { class: "util-strong util-officer" }, icon("shield", 16), h("span", { class: "hide-sm", text: t("Officer mode") })), cityMenu(rerender))
    : h("div", { class: "util-left" }, cityMenu(rerender), h("span", { class: "util-muted hide-sm", text: t("Live pilot · Tambaram coming next") }));
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
  const { all: mineCount, check: need } = store.myTabs();
  const tab = (href, key, label, extra) => h("a", { href, class: "nav-tab" + (active === key ? " on" : ""), "aria-current": active === key ? "page" : null }, label, extra);
  const nav = officerPage
    ? h("nav", { class: "nav nav-officer", "aria-label": t("Officer") },
        tab("officer.html", "officer", t("Dashboard")),
        h("button", { type: "button", class: "nav-btn", onclick: () => { setOfficer(false); location.href = "index.html"; } }, icon("out", 16), t("Sign out")))
    : h("nav", { class: "nav", "aria-label": t("Main") },
        tab("index.html", "home", t("Home")),
        tab("raise.html", "raise", t("Raise a complaint")),
        tab("my.html", "my", t("My complaints"), myCount(mineCount, need)),
        h("a", { href: isOfficer() ? "officer.html" : "login.html", class: "nav-btn" + (active === "login" ? " on" : "") }, icon("shield", 16), t("Officer login")));
  const menu = phoneMenu(active, officerPage, need, myCount(mineCount, need));
  const main = h("header", { class: "head" }, h("div", { class: "wrap head-in" }, brand(), nav, menu.btn), menu.panel);
  const demo = p.demo ? h("div", { class: "demo-strip", role: "status" }, h("div", { class: "wrap" }, icon("info", 16),
    h("span", { class: "demo-text", text: t("Demo mode — showing sample complaints. Your own are safe and come back when you turn it off.") }),
    h("button", { type: "button", class: "demo-off", onclick: () => setDemo(false, officerPage, rerender), text: t("Turn off") }))) : null;
  return [util, main, demo].filter(Boolean);
}

/** Hamburger button + drop-down panel for phones and small tablets (the desktop nav hides there). */
/** Number of my complaints (in the chosen city) for the "My complaints" pill; yellow when some need my check. */
function myCount(total, need) {
  if (!total) return null;
  const label = t("{n} complaints", { n: total }) + (need ? " · " + t("{n} need your check", { n: need }) : "");
  return h("span", { class: "count" + (need ? " attn" : ""), "aria-label": label, title: label, text: total });
}

function phoneMenu(active, officerPage, need, count) {
  const row = (ico, label, extra) => [h("span", { class: "menu-ico" }, icon(ico, 20)), h("span", { class: "menu-label", text: label }), extra || icon("arrow", 16)];
  const link = (href, key, ico, label, extra) => h("a", { href, class: "menu-item" + (active === key ? " on" : ""), "aria-current": active === key ? "page" : null }, row(ico, label, extra));
  const items = officerPage
    ? [link("officer.html", "officer", "grid", t("Dashboard")),
       h("hr", { class: "menu-sep" }),
       h("button", { type: "button", class: "menu-item", onclick: () => { setOfficer(false); location.href = "index.html"; } }, row("out", t("Sign out")))]
    : [link("index.html", "home", "home", t("Home")),
       link("raise.html", "raise", "plus", t("Raise a complaint")),
       link("my.html", "my", "list", t("My complaints"), count),
       h("hr", { class: "menu-sep" }),
       isOfficer() ? link("officer.html", "officer", "grid", t("Officer dashboard")) : link("login.html", "login", "shield", t("Officer login"))];
  const panel = h("nav", { id: "site-menu", class: "menu", "aria-label": t("Menu"), hidden: true }, h("div", { class: "wrap menu-in" }, items));
  const btn = h("button", { type: "button", class: "menu-btn", "aria-label": need && !officerPage ? t("Menu") + " — " + t("{n} need your check", { n: need }) : t("Menu"), "aria-expanded": "false", "aria-controls": "site-menu" },
    icon("menu", 24), need && !officerPage ? h("span", { class: "menu-badge", "aria-hidden": "true", text: need }) : null);
  const wide = window.matchMedia("(min-width: 761px)");
  const open = () => { panel.hidden = false; btn.setAttribute("aria-expanded", "true"); btn.replaceChild(icon("x", 24), btn.firstChild); document.addEventListener("click", outside, true); document.addEventListener("keydown", esc); document.addEventListener("focusin", away); wide.addEventListener("change", close); };
  const close = () => { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.replaceChild(icon("menu", 24), btn.firstChild); document.removeEventListener("click", outside, true); document.removeEventListener("keydown", esc); document.removeEventListener("focusin", away); wide.removeEventListener("change", close); };
  const inside = (el) => btn.contains(el) || panel.contains(el);
  const outside = (e) => { if (!inside(e.target)) close(); };
  const away = (e) => { if (!inside(e.target)) close(); };
  const esc = (e) => { if (e.key === "Escape") { close(); btn.focus(); } };
  btn.addEventListener("click", () => (panel.hidden ? open() : close()));
  panel.addEventListener("click", (e) => { if (e.target.closest("a, button")) close(); });
  return { btn, panel };
}

/**
 * Turn Demo mode on or off. It swaps between the sample complaints and the user's own, so a page
 * showing a complaint (or an officer page) that is not in the other set goes to its list instead.
 */
function setDemo(on, officerPage, redrawAll) {
  setPref("demo", on);
  const msg = on ? t("Demo mode on — showing sample complaints. Your own data is kept safe.") : t("Demo mode off — your own complaints are back");
  const id = param("id");
  const away = officerPage && !isOfficer() ? "login.html" : id && !store.get(id) ? (officerPage ? "officer.html" : "my.html") : "";
  if (away) { toastNext(msg); location.href = away; return; }
  redrawAll();
  toast(msg, { kind: "info" });
}

/** "On this device" tools: demo mode switch (applies at once) and erase (or, in Demo mode, reset the samples) with a two-tap confirm. */
function deviceTools(officerPage, redrawAll) {
  const demo = prefs().demo;
  const sw = h("button", { type: "button", class: "tool tool-switch", role: "switch", "aria-checked": demo ? "true" : "false", onclick: () => setDemo(!demo, officerPage, redrawAll) },
    h("span", { class: "tool-ico" }, icon("camera", 18)),
    h("span", { class: "tool-text" }, h("b", { text: t("Demo mode") }), h("small", { text: t("Sample complaints, photos and location for presenting") })),
    h("span", { class: "sw", "aria-hidden": "true" }, h("span", { class: "sw-knob" })));
  const words = demo
    ? { title: t("Reset demo data"), sub: t("Puts the sample complaints back. Your own data is not touched."), again: t("Tap again to reset the demo data") }
    : { title: t("Erase data on this device"), sub: t("Every complaint, photo and the officer PIN"), again: t("Tap again to erase everything") };
  const label = h("span", { class: "tool-text" }, h("b", { text: words.title }), h("small", { text: words.sub }));
  const erase = h("button", { type: "button", class: "tool tool-danger", onclick: async () => {
    if (!confirmReset(erase, label, words)) return;
    if (demo) {
      await store.resetDemo();
      toast(t("Demo data reset — the sample complaints are back"));
    } else {
      await store.reset();
      try { localStorage.removeItem(PIN); } catch { /* ignore */ }
      setOfficer(false);
      toast(t("All data on this device erased"));
    }
    setTimeout(() => { location.href = "index.html"; }, 600);
  } }, h("span", { class: "tool-ico" }, icon(demo ? "reopen" : "trash", 18)), label);
  return h("div", { class: "foot-tools" }, h("p", { class: "foot-tools-title", text: t("On this device") }), h("div", { class: "tools" }, sw, erase));
}

/** Footer: zones, honesty note, school credit, CM helpline, device tools. */
function footer(officerPage, redrawAll) {
  return h("footer", { class: "foot" }, h("div", { class: "wrap foot-in" },
    h("div", {},
      h("p", { class: "foot-title", text: t("Covers all 15 zones of Greater Chennai, and Avadi City Corporation") }),
      h("p", { class: "foot-zones", text: ZONES.map((z) => t(z.en)).join(" · ") + " · " + t("Avadi") })),
    h("div", { class: "foot-meta" },
      h("p", { text: t("Student prototype — not an official Greater Chennai Corporation app.") }),
      h("p", { text: t("For other government services, call 1100 (CM Helpline).") }),
      h("p", { class: "foot-muted" }, t("Made by Class XII students of"), " ", h("b", { text: t("Gandhiji Matriculation School, Avadi") }), " ", t("· Inter-School Hackathon 2026")))),
    h("div", { class: "wrap" }, deviceTools(officerPage, redrawAll)));
}

/** Two-tap confirm before wiping: the first tap turns the button red and asks again for 4 seconds. */
let resetArmed = 0;
function confirmReset(btn, label, words) {
  const now = Date.now();
  if (now - resetArmed < 4000) { resetArmed = 0; return true; }
  resetArmed = now;
  btn.classList.add("armed");
  label.firstChild.textContent = words.again;
  setTimeout(() => { btn.classList.remove("armed"); label.firstChild.textContent = words.title; }, 4000);
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
    body.append(footer(officer, () => draw()));
  };
  if (firstPage) main.classList.add("enter"); // fade content in on the first page of a visit only
  draw();
  setTimeout(() => main.classList.remove("enter"), 600);
  requestAnimationFrame(() => document.documentElement.classList.add("ready")); // theme transitions on from now
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
