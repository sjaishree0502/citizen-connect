// helpers.js — small shared tools: safe DOM building, dates, distance, toasts.

/** Build an element safely. Text is always set with textContent, never innerHTML. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

/** Append children (strings become text nodes; arrays are flattened; null is skipped). */
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Build an inline SVG icon from a known name (paths are fixed strings, never user input). */
const ICONS = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  plus: "M12 5v14M5 12h14",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  out: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  camera: "M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  reopen: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 18l-6-6 6-6",
  x: "M6 6l12 12M18 6L6 18",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
};
export function icon(name, size = 20) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ico");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", ICONS[name] || ICONS.info);
  svg.append(p);
  return svg;
}

/** Read a URL query value. */
export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

/** Distance in metres between two GPS points (haversine). */
export function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Whole days/hours between an ISO date and now, as {n, unit}. */
export function ageParts(iso, now = Date.now()) {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return { n: 0, unit: "now" };
  if (hours < 24) return { n: hours, unit: "hour" };
  return { n: Math.floor(hours / 24), unit: "day" };
}

/** Format a date like "24 Nov, 4:02 pm". */
export function shortDate(iso, lang = "en") {
  const d = new Date(iso);
  return d.toLocaleString(lang === "ta" ? "ta-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Format a day like "Thu, 27 Nov". */
export function dayDate(iso, lang = "en") {
  return new Date(iso).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** Read JSON from localStorage without ever throwing. */
export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Write JSON to localStorage; returns false if storage is full or blocked. */
export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

let toastTimer = null;
/** Show a short message at the bottom of the screen; optional action button (e.g. Undo). */
export function toast(message, { action = null, onAction = null, ms = 3200, kind = "ok" } = {}) {
  let box = document.getElementById("toast");
  if (!box) {
    box = h("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" });
    document.body.append(box);
  }
  box.replaceChildren(h("span", { class: "toast-dot " + kind }), h("span", { class: "toast-text", text: message }));
  if (action && onAction) {
    box.append(h("button", { type: "button", class: "toast-btn", text: action, onclick: () => { hideToast(); onAction(); } }));
  }
  box.classList.remove("show");
  void box.offsetWidth; // restart the slide-in animation
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}

/** Hide the toast. */
export function hideToast() {
  const box = document.getElementById("toast");
  if (box) box.classList.remove("show");
}

/** Keep a toast across a page change (shown by the next page on load). */
export function toastNext(message) {
  try { sessionStorage.setItem("cc.toast", message); } catch { /* ignore */ }
}

/** Show the toast saved by the previous page, if any. */
export function showPendingToast() {
  try {
    const m = sessionStorage.getItem("cc.toast");
    if (m) { sessionStorage.removeItem("cc.toast"); toast(m, { ms: 4200 }); }
  } catch { /* ignore */ }
}

/** True when the visitor asked the device for less motion. */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
