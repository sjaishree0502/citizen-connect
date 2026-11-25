// pages/verify.js — Check the fix: compare before/after, see the officer's note,
// then "Yes, it's fixed" (closes it) or "No, reopen it" with a reason. Also the detail view for any complaint.

import { h, icon, toast, param, shortDate } from "../helpers.js";
import { t, lang, catName, ago } from "../i18n.js";
import { boot } from "../layout.js";
import * as store from "../store.js";
import { checkReason, LIMITS } from "../validate.js";
import { badge, compare, photo, timeline, locationMatch, zoneLine, empty, field, dueInfo, fixTiming } from "../ui.js";

const id = (param("id") || "").toUpperCase();
let reopening = false, reason = "", reasonErr = "";
let redraw = () => {};

/** Citizen accepts the fix. */
function accept(c) {
  try {
    const { previous } = store.move(c.id, "Verified", "citizen");
    redraw();
    toast(t("✓ Verified — complaint closed"), { action: t("Undo"), ms: 5000, onAction: () => { store.restore(previous); redraw(); } });
  } catch { toast(t("This complaint can no longer be changed."), { kind: "err" }); }
}

/** Citizen sends it back with a reason. */
function reopen(c) {
  reasonErr = checkReason(reason) ? t(checkReason(reason)) : "";
  if (reasonErr) { redraw(); document.getElementById("reason")?.focus(); return; }
  try {
    store.move(c.id, "Reopened", "citizen", { reason });
    reopening = false; reason = "";
    redraw();
    toast(t("Reopened — sent back to the officer"));
  } catch { toast(t("This complaint can no longer be changed."), { kind: "err" }); }
}

/** Decision box (only for the citizen's own Fixed complaint). */
function decide(c) {
  if (!(c.mine && c.status === "Fixed")) return null;
  if (!reopening) {
    return h("section", { class: "card block decide" },
      h("h2", { class: "block-title", text: t("Is the problem really fixed?") }),
      h("p", { class: "muted", text: t("Only you can close this complaint. If it is not fixed, it goes straight back to the officer.") }),
      h("div", { class: "two" },
        h("button", { type: "button", class: "btn btn-green btn-lg", onclick: () => accept(c) }, icon("check", 20), t("Yes, it's fixed")),
        h("button", { type: "button", class: "btn btn-red-outline btn-lg", onclick: () => { reopening = true; redraw(); document.getElementById("reason")?.focus(); } }, icon("reopen", 20), t("No, reopen it"))));
  }
  const counter = h("span", { class: "counter", text: `${reason.length} / ${LIMITS.reasonMax}` });
  const ta = h("textarea", { id: "reason", rows: 3, maxlength: LIMITS.reasonMax, placeholder: t("e.g. Only half the pothole is filled"), "aria-invalid": reasonErr ? "true" : "false", "aria-describedby": reasonErr ? "reason-err" : null });
  ta.value = reason;
  ta.addEventListener("input", () => { reason = ta.value; counter.textContent = `${reason.length} / ${LIMITS.reasonMax}`; });
  return h("section", { class: "card block decide" },
    field({ id: "reason", label: t("What is still wrong?"), hint: t("At least 10 characters"), control: ta, counter, error: reasonErr }),
    h("div", { class: "two" },
      h("button", { type: "button", class: "btn btn-red btn-lg", onclick: () => reopen(c) }, icon("reopen", 20), t("Send back to officer")),
      h("button", { type: "button", class: "btn btn-ghost btn-lg", onclick: () => { reopening = false; reasonErr = ""; redraw(); }, text: t("Cancel") })));
}

/** Result banner after a decision, or a status note. */
function statusNote(c) {
  if (c.status === "Verified") return h("div", { class: "banner ok" }, icon("check", 22), h("div", {}, h("b", { text: t("Verified") }), h("p", { text: t("{id} is closed. Thank you for checking.", { id: c.id }) })));
  if (c.status === "Reopened") return h("div", { class: "banner warn" }, icon("reopen", 22), h("div", {}, h("b", { text: t("Reopened · sent back to the officer") }), h("p", { text: t("Reason: “{r}”. The officer must fix it again and post a new after-photo.", { r: c.reText }) })));
  if (c.status === "Submitted") return h("div", { class: "banner info" }, icon("clock", 22), h("div", {}, h("b", { text: t("Waiting for an officer to start work") }), h("p", { text: t("The officer will set a date for the fix. You will be asked to check the after-photo when it is marked fixed.") })));
  if (c.status === "In progress") {
    const due = dueInfo(c);
    return h("div", { class: "banner " + (due && due.late ? "warn" : "info") }, icon("clock", 22), h("div", {},
      h("b", { text: due ? due.text : t("Work started") }),
      h("p", { text: due && due.late ? t("The officer has missed the promised date. You will be asked to check the after-photo when it is marked fixed.") : t("Work has started. You will be asked to check the after-photo when the officer marks it fixed.") })));
  }
  if (c.status === "Withdrawn") return h("div", { class: "banner muted" }, icon("info", 22), h("div", {}, h("b", { text: t("Withdrawn") }), h("p", { text: t("You withdrew this complaint.") })));
  return null;
}

/** Draw the page. */
function render(main) {
  const c = store.get(id);
  if (!c) {
    main.replaceChildren(h("div", { class: "wrap page" }, empty(t("Complaint not found"), t("Check the ID, or open it from My complaints.")), h("p", { class: "center" }, h("a", { href: "my.html", class: "btn btn-primary", text: t("Go to My complaints") }))));
    return;
  }
  const pictures = c.afterPhoto ? compare(c.beforePhoto, c.afterPhoto) : h("div", { class: "single" }, photo(c.beforePhoto, t("Before photo")), h("span", { class: "cmp-tag cmp-tag-b", text: t("BEFORE") }));
  main.replaceChildren(h("div", { class: "wrap page" },
    h("a", { href: c.mine ? "my.html" : "index.html", class: "back" }, icon("back", 18), c.mine ? t("My complaints") : t("Home")),
    h("div", { class: "page-head" },
      h("div", {}, h("h1", { class: "page-title", text: c.status === "Fixed" && c.mine ? t("Check the fix") : `${c.id} · ${catName(c.cat)}` }),
        h("p", { class: "page-sub", text: `${c.id} · ${catName(c.cat)} · ${c.area} · ${t("reported {ago}", { ago: ago(c.createdAt) })}` })),
      badge(c.status)),
    h("div", { class: "verify" },
      h("div", { class: "col" }, h("div", { class: "card pad0" }, pictures),
        h("div", { class: "card block facts" },
          locationMatch(c),
          c.officerNote ? h("p", {}, h("b", { text: t("Officer’s note:") }), " " + c.officerNote) : null,
          c.fixedAt ? h("p", {}, h("b", { text: t("Fixed on:") }), " " + shortDate(c.fixedAt, lang())) : null,
          fixTiming(c) ? h("p", { class: fixTiming(c).late ? "warn-text" : "", text: fixTiming(c).text }) : null,
          c.afterTakenAt ? h("p", {}, h("b", { text: t("After-photo taken:") }), " " + shortDate(new Date(c.afterTakenAt).toISOString(), lang())) : null,
          c.note ? h("p", {}, h("b", { text: t("Your description:") }), " " + c.note) : null,
          h("p", { class: "muted", text: zoneLine(c) }))),
      h("div", { class: "col" }, statusNote(c), decide(c),
        h("section", { class: "card block" }, h("h2", { class: "block-title", text: t("What happened") }), timeline(c))))));
}

/** Tab title: the complaint ID plus "Check the fix" when it is waiting for this citizen. */
function pageTitle() {
  const c = store.get(id);
  if (!c) return t("Complaint not found");
  return `${c.id} · ${c.mine && c.status === "Fixed" ? t("Check the fix") : catName(c.cat)}`;
}

const draw = boot({ page: "my", render, title: pageTitle });
redraw = () => { const y = window.scrollY; draw(); window.scrollTo(0, y); };
