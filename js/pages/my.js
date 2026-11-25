// pages/my.js — My complaints: tabs, search, list/grid, 10 per page, withdraw with Undo.

import { h, icon, toast, param } from "../helpers.js";
import { t, catName, prefs, setPref } from "../i18n.js";
import { boot } from "../layout.js";
import * as store from "../store.js";
import { bucket } from "../rules.js";
import { complaintItem, pager, viewToggle, pageHead, empty } from "../ui.js";

const PER = 10;
const newId = (param("new") || "").toUpperCase();
let tab = param("tab") || "all", query = "", page = 1;
let redraw = () => {};

/** Complaints after tab + search, newest first. */
function filtered() {
  const q = query.trim().toLowerCase();
  return store.mine()
    .filter((c) => tab === "all" || bucket(c.status) === tab)
    .filter((c) => !q || [c.id, c.area, catName(c.cat), c.status].some((v) => String(v).toLowerCase().includes(q)))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/** Withdraw a Submitted complaint, with a 5-second Undo. */
function withdraw(c) {
  try {
    const { previous } = store.move(c.id, "Withdrawn", "citizen");
    redraw();
    toast(t("Complaint {id} withdrawn", { id: c.id }), { action: t("Undo"), ms: 5000, onAction: () => { store.restore(previous); redraw(); toast(t("Withdraw undone")); } });
  } catch {
    toast(t("This complaint can no longer be withdrawn."), { kind: "err" });
  }
}

/** Draw the page. */
function render(main) {
  const counts = store.myTabs();
  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / PER));
  if (page > pages) page = pages;
  const shown = list.slice((page - 1) * PER, page * PER);
  const view = prefs().view;

  const tabBtn = (key, label, n) => h("button", { type: "button", role: "tab", class: "tab" + (tab === key ? " on" : "") + (key === "check" && n ? " attn" : ""), "aria-selected": tab === key ? "true" : "false", onclick: () => { tab = key; page = 1; redraw(); } }, `${label} · ${n}`);
  const search = h("input", { id: "q", type: "search", placeholder: t("Search by ID, problem or area"), value: query, "aria-label": t("Search my complaints"), maxlength: 60 });
  let timer;
  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { query = search.value; page = 1; redraw(true); }, 200); });

  main.replaceChildren(h("div", { class: "wrap page" },
    pageHead(t("My complaints"), t("{total} complaints raised from this browser · {n} need your check. Nothing is closed without your OK.", { total: counts.all, n: counts.check }),
      h("a", { href: "raise.html", class: "btn btn-primary" }, icon("plus", 18), t("Raise another"))),
    h("div", { class: "toolbar" },
      h("div", { class: "tabs", role: "tablist", "aria-label": t("Filter") },
        tabBtn("all", t("All"), counts.all), tabBtn("check", t("Needs my check"), counts.check), tabBtn("open", t("Open"), counts.open), tabBtn("closed", t("Closed"), counts.closed)),
      h("div", { class: "toolbar-right" }, h("label", { class: "search" }, icon("search", 18), search), viewToggle(view, (v) => { setPref("view", v); redraw(); }))),
    shown.length
      ? h("div", { class: "items " + (view === "grid" ? "grid" : "list") }, shown.map((c) => complaintItem(c, { isNew: c.id === newId, onWithdraw: withdraw })))
      : counts.all === 0
        ? h("div", {}, empty(t("You have not raised any complaints yet"), t("Spotted a pothole, open drain or broken streetlight? Report it with a photo.")), h("p", { class: "center" }, h("a", { href: "raise.html", class: "btn btn-primary" }, icon("plus", 18), t("Raise a complaint"))))
        : empty(t("No complaints match"), t("Try another filter or search word.")),
    pager(page, pages, list.length, PER, (p) => { page = p; redraw(); window.scrollTo({ top: 0 }); })));
}

const draw = boot({ page: "my", render, title: () => t("My complaints") });
redraw = (keepSearch = false) => {
  const y = window.scrollY;
  draw();
  window.scrollTo(0, y);
  if (keepSearch) { const s = document.getElementById("q"); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
};
