// pages/officer.js — Officer dashboard: counts that filter, reopened and oldest first, list/grid.

import { h, icon } from "../helpers.js";
import { t, catName, age, prefs, setPref } from "../i18n.js";
import { boot, isOfficer } from "../layout.js";
import * as store from "../store.js";
import { officerOrder } from "../rules.js";
import { badge, viewToggle, pageHead, empty, photo, pager, dueInfo } from "../ui.js";

if (!isOfficer()) location.replace("login.html");

const PER = 10;
let filter = "all", page = 1;
let redraw = () => {};

/** Complaints for the chosen filter in officer order. */
function rows() {
  return store.all().filter((c) => c.status !== "Withdrawn").filter((c) => filter === "all" || c.status === filter).sort(officerOrder);
}

/** Next step text for a complaint. */
function actionLabel(c) {
  if (c.status === "Submitted" || c.status === "Reopened") return t("Start work");
  if (c.status === "In progress") return t("Mark fixed");
  return t("View");
}

/** Draw the page. */
function render(main) {
  const n = store.counts();
  const view = prefs().view;
  const list = rows();
  const pages = Math.max(1, Math.ceil(list.length / PER));
  if (page > pages) page = pages;
  const shown = list.slice((page - 1) * PER, page * PER);

  const stat = (key, num, label, sub, cls, ico) => h("button", { type: "button", class: "stat " + cls + (filter === key ? " on" : ""), "aria-pressed": filter === key ? "true" : "false", onclick: () => { filter = filter === key ? "all" : key; page = 1; redraw(); } },
    h("span", { class: "stat-ico" }, icon(ico, 20)), h("div", {}, h("p", { class: "stat-n", text: num }), h("p", { class: "stat-l", text: label }), h("p", { class: "stat-s", text: sub })));

  const open = (c) => `update.html?id=${encodeURIComponent(c.id)}`;
  const rowEl = (c) => h("a", { href: open(c), class: "orow" + (c.status === "Reopened" ? " reo" : "") },
    h("span", { class: "o-id" }, h("b", { text: c.id }), h("span", { class: "o-cat", text: catName(c.cat) })),
    h("span", { class: "o-area", text: c.area }),
    h("span", { class: "o-age", text: age(c.createdAt) }),
    h("span", { class: "o-st" }, badge(c.status, true), c.reopenCount ? h("small", { class: "warn-text", text: t("Reopened · {n}×", { n: c.reopenCount }) }) : null,
      dueInfo(c) ? h("small", { class: dueInfo(c).late ? "warn-text" : "muted", text: dueInfo(c).text }) : null),
    h("span", { class: "o-act" }, h("span", { class: "btn btn-sm " + (c.status === "Fixed" || c.status === "Verified" ? "btn-ghost" : "btn-primary"), text: actionLabel(c) })));
  const cardEl = (c) => h("a", { href: open(c), class: "ocard card" + (c.status === "Reopened" ? " reo" : "") },
    h("div", { class: "item-thumb" }, photo(c.beforePhoto, catName(c.cat))),
    h("div", { class: "ocard-body" }, h("div", { class: "item-top" }, h("b", { text: c.id }), badge(c.status, true)), h("p", { class: "item-title", text: catName(c.cat) }), h("p", { class: "item-meta", text: `${c.area} · ${age(c.createdAt)}` }),
      c.status === "Reopened" && c.reText ? h("p", { class: "item-note warn", text: t("Reopened: {r}", { r: c.reText }) }) : null,
      dueInfo(c) ? h("p", { class: "item-note" + (dueInfo(c).late ? " warn" : ""), text: dueInfo(c).text }) : null,
      h("span", { class: "btn btn-sm btn-primary", text: actionLabel(c) })));

  main.replaceChildren(h("div", { class: "wrap page" },
    pageHead(t("Complaints"), t("Reopened and oldest complaints first. Tap a number to filter.")),
    h("div", { class: "stats stats-o" },
      stat("Submitted", n.submitted, t("New"), t("not started"), "s-new", "plus"),
      stat("In progress", n.inprogress, t("In progress"), t("ward team on it"), "s-prog", "clock"),
      stat("Fixed", n.fixed, t("Waiting for citizen"), t("after-photo posted"), "s-fix", "search"),
      stat("Verified", n.verified, t("Verified"), t("closed with proof"), "s-ver", "check"),
      stat("Reopened", n.reopened, t("Reopened"), t("fix again"), "s-re", "reopen")),
    h("div", { class: "toolbar" },
      h("p", { class: "muted", text: filter === "all" ? t("Showing all complaints") : t("Showing: {s}", { s: badge(filter, true).textContent }) }),
      h("div", { class: "toolbar-right" }, filter !== "all" ? h("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => { filter = "all"; redraw(); }, text: t("Show all") }) : null, viewToggle(view, (v) => { setPref("view", v); redraw(); }))),
    h("p", { class: "rule" }, icon("info", 16), t("A complaint closes only when the citizen confirms the fix")),
    !shown.length ? empty(n.total ? t("No complaints with this status.") : t("No complaints yet"), n.total ? "" : t("Complaints raised on this device will appear here."))
      : view === "grid" ? h("div", { class: "items grid" }, shown.map(cardEl))
      : h("div", { class: "otable", role: "table", "aria-label": t("Complaints") },
          h("div", { class: "orow ohead", role: "row" }, [t("Complaint"), t("Area"), t("Age"), t("Status"), t("Action")].map((x) => h("span", { role: "columnheader", text: x }))),
          shown.map(rowEl)),
    pager(page, pages, list.length, PER, (p) => { page = p; redraw(); window.scrollTo({ top: 0 }); })));
}

const draw = boot({ page: "officer", officer: true, render, title: () => t("Officer dashboard") });
redraw = () => { const y = window.scrollY; draw(); window.scrollTo(0, y); };
