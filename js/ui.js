// ui.js — reusable pieces used by several pages: badges, complaint cards, pager,
// list/grid toggle, before/after compare, timeline, form field wrapper.

import { h, icon, shortDate, dayDate, distanceM } from "./helpers.js";
import { t, lang, catName, statusLabel, statusClass, ago, zoneName } from "./i18n.js";
import { setImg } from "./photos.js";

/** Status badge. */
export const badge = (status, forOfficer = false) => h("span", { class: statusClass(status), text: statusLabel(status, forOfficer) });

/** Picture that loads from a stored reference (path or IndexedDB). */
export function photo(ref, alt, cls = "") {
  const img = h("img", { alt, class: cls, loading: "lazy", decoding: "async", width: 640, height: 400 });
  setImg(img, ref);
  return img;
}

/** Promised fix date of an In-progress complaint: { text, late } or null. */
export function dueInfo(c, now = Date.now()) {
  if (c.status !== "In progress" || !c.dueBy) return null;
  const d = dayDate(c.dueBy, lang());
  return now > Date.parse(c.dueBy) ? { late: true, text: t("Overdue · promised by {d}", { d }) } : { late: false, text: t("Fix promised by {d}", { d }) };
}

/** Was the fix done by the promised date? { text, late } or null. */
export function fixTiming(c) {
  if (!c.dueBy || !c.fixedAt) return null;
  const d = dayDate(c.dueBy, lang()), lateDays = Math.ceil((Date.parse(c.fixedAt) - Date.parse(c.dueBy)) / 86400000);
  if (lateDays <= 0) return { late: false, text: t("Fixed on time (promised by {d})", { d }) };
  return { late: true, text: lateDays === 1 ? t("Fixed 1 day late (promised by {d})", { d }) : t("Fixed {n} days late (promised by {d})", { n: lateDays, d }) };
}

/** One complaint for "My complaints" (list row or grid card share the same markup). */
export function complaintItem(c, { isNew = false, onWithdraw = null } = {}) {
  const action = c.status === "Fixed"
    ? h("a", { href: `verify.html?id=${encodeURIComponent(c.id)}`, class: "btn btn-sm btn-primary" }, t("Check the fix"), icon("arrow", 16))
    : h("a", { href: `verify.html?id=${encodeURIComponent(c.id)}`, class: "btn btn-sm btn-ghost", text: t("View") });
  return h("article", { class: "item" + (c.status === "Fixed" ? " item-attn" : "") + (isNew ? " item-new" : "") },
    h("div", { class: "item-thumb" }, photo(c.beforePhoto, catName(c.cat))),
    h("div", { class: "item-body" },
      h("div", { class: "item-top" },
        h("span", { class: "item-id", text: c.id }),
        isNew ? h("span", { class: "new-tag", text: t("NEW") }) : null,
        badge(c.status)),
      h("h2", { class: "item-title", text: catName(c.cat) }),
      h("p", { class: "item-meta", text: `${c.area} · ${ago(c.createdAt)}` }),
      c.status === "Reopened" ? h("p", { class: "item-note warn", text: t("Reopened by you · waiting for the officer to start again") }) : null,
      c.status === "Submitted" ? h("p", { class: "item-note muted", text: t("Waiting for an officer to start work") }) : null,
      dueInfo(c) ? h("p", { class: "item-note" + (dueInfo(c).late ? " warn" : ""), text: dueInfo(c).text }) : null,
      h("div", { class: "item-actions" }, action,
        c.status === "Submitted" && onWithdraw ? h("button", { type: "button", class: "btn btn-sm btn-quiet", onclick: () => onWithdraw(c) }, t("Withdraw")) : null)));
}

/** Pager: hidden when everything fits on one page. */
export function pager(page, pages, total, per, onGo) {
  if (pages <= 1) return null;
  const from = (page - 1) * per + 1, to = Math.min(page * per, total);
  const btn = (label, p, cur, aria) => h("button", { type: "button", class: "pg" + (cur ? " on" : ""), disabled: p < 1 || p > pages || null, "aria-current": cur ? "page" : null, "aria-label": aria || null, onclick: () => onGo(p) }, label);
  return h("nav", { class: "pager", "aria-label": t("Pages") },
    h("span", { class: "pager-text", text: t("Showing {a}–{b} of {n}", { a: from, b: to, n: total }) }),
    h("div", { class: "pager-btns" },
      btn(icon("back", 16), page - 1, false, t("Previous page")),
      Array.from({ length: pages }, (_, i) => btn(String(i + 1), i + 1, i + 1 === page)),
      btn(icon("arrow", 16), page + 1, false, t("Next page"))));
}

/** List / grid switch. */
export function viewToggle(view, onSet) {
  const b = (v, ico, label) => h("button", { type: "button", class: "vt" + (view === v ? " on" : ""), "aria-pressed": view === v ? "true" : "false", "aria-label": label, title: label, onclick: () => onSet(v) }, icon(ico, 18));
  return h("div", { class: "vtoggle", role: "group", "aria-label": t("View") }, b("list", "list", t("List view")), b("grid", "grid", t("Grid view")));
}

/** Labelled field with a red error line. */
export function field({ id, label, hint = null, error = "", control, optional = false, counter = null }) {
  return h("div", { class: "field" + (error ? " has-err" : "") },
    h("div", { class: "field-head" },
      h("label", { for: id, class: "field-label" }, label, optional ? h("span", { class: "opt", text: " " + t("(optional)") }) : null),
      counter),
    control,
    hint ? h("p", { class: "field-hint", id: id + "-hint", text: hint }) : null,
    error ? h("p", { class: "field-err", id: id + "-err", role: "alert", text: error }) : null);
}

/**
 * Before/after compare: move the pointer (or finger) across the photo.
 * A hidden range input keeps it usable from the keyboard.
 */
export function compare(beforeRef, afterRef) {
  const box = h("div", { class: "cmp", style: null });
  const after = photo(afterRef, t("After photo"), "cmp-img");
  const beforeWrap = h("div", { class: "cmp-before" }, photo(beforeRef, t("Before photo"), "cmp-img"));
  const line = h("div", { class: "cmp-line", "aria-hidden": "true" }, h("span", { class: "cmp-knob" }, icon("back", 14), icon("arrow", 14)));
  const range = h("input", { type: "range", min: 0, max: 100, value: 50, class: "sr-only", "aria-label": t("Compare before and after (0 = after, 100 = before)") });
  const set = (pct) => {
    const p = Math.max(0, Math.min(100, pct));
    box.style.setProperty("--pos", p + "%");
    range.value = String(Math.round(p));
  };
  const fromEvent = (e) => {
    const r = box.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100);
  };
  let dragging = false;
  box.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || dragging) fromEvent(e); });
  box.addEventListener("pointerdown", (e) => { dragging = true; box.setPointerCapture?.(e.pointerId); fromEvent(e); });
  box.addEventListener("pointerup", () => { dragging = false; });
  box.addEventListener("pointercancel", () => { dragging = false; });
  range.addEventListener("input", () => set(Number(range.value)));
  set(50);
  box.append(after, beforeWrap, line,
    h("span", { class: "cmp-tag cmp-tag-b", text: t("BEFORE") }),
    h("span", { class: "cmp-tag cmp-tag-a", text: t("AFTER") }),
    h("span", { class: "cmp-hint", text: t("↔ Move across the photo to compare") }));
  return h("div", { class: "cmp-wrap" }, box, range);
}

/** Small before/after pair (Home cards). */
export function pair(beforeRef, afterRef) {
  return h("div", { class: "pair" },
    h("figure", {}, photo(beforeRef, t("Before photo")), h("figcaption", { class: "pt pt-b", text: t("BEFORE") })),
    h("figure", {}, photo(afterRef, t("After photo")), h("figcaption", { class: "pt pt-a", text: t("AFTER") })));
}

/** Timeline of what happened to a complaint. */
export function timeline(c) {
  const label = { Submitted: "Submitted", "In progress": "In progress", Fixed: "Fixed — after-photo posted", Verified: "Verified by citizen", Reopened: "Reopened by citizen", Withdrawn: "Withdrawn" };
  return h("ol", { class: "tl" }, (c.history || []).map((e) =>
    h("li", { class: "tl-item tl-" + e.status.toLowerCase().replace(/\s+/g, "") },
      h("span", { class: "tl-dot", "aria-hidden": "true" }),
      h("div", {},
        h("p", { class: "tl-title", text: t(label[e.status] || e.status) }),
        h("p", { class: "tl-when", text: shortDate(e.at, lang()) }),
        e.note ? h("p", { class: "tl-note", text: "“" + e.note + "”" }) : null,
        e.dueBy ? h("p", { class: "tl-note", text: t("Fix promised by {d}", { d: dayDate(e.dueBy, lang()) }) }) : null,
        e.photo ? photo(e.photo, t("After photo"), "tl-photo") : null))));
}

/** Location match line (after-photo distance from the citizen's pin). */
export function locationMatch(c) {
  if (typeof c.afterLat !== "number") return null;
  const d = distanceM(c.lat, c.lng, c.afterLat, c.afterLng);
  const ok = d <= 50;
  return h("p", { class: "match " + (ok ? "ok" : "far") }, icon(ok ? "check" : "info", 18),
    h("span", {}, h("b", { text: ok ? t("Location matched") : t("Location is far from the pin") }), " " + t("— the after-photo was taken {d} m from your pin", { d }) + (typeof c.afterAcc === "number" ? ` (${t("accuracy {m} m", { m: c.afterAcc })})` : "")));
}

/** "Anna Nagar · Zone 8" line. */
export const zoneLine = (c) => zoneName(c.zone);

/** Page heading block. */
export function pageHead(title, sub, right = null) {
  return h("div", { class: "page-head" }, h("div", {}, h("h1", { class: "page-title", text: title }), sub ? h("p", { class: "page-sub", text: sub }) : null), right);
}

/** Empty-state box. */
export const empty = (title, text) => h("div", { class: "empty" }, icon("search", 28), h("p", { class: "empty-title", text: title }), h("p", { text }));
