// pages/update.js — Officer follows up on one complaint: Start work (promising a fix date),
// post progress updates (optionally moving the date), then say the work is done.
// The officer cannot close a complaint: only the citizen resolves it, with a new photo at the spot.

import { h, icon, toast, param, dayDate } from "../helpers.js";
import { t, lang, catName, ago, placeName } from "../i18n.js";
import { boot, isOfficer } from "../layout.js";
import * as store from "../store.js";
import { checkOfficerNote, checkDueDate, LIMITS } from "../validate.js";
import { badge, photo, compare, timeline, field, empty, dueInfo } from "../ui.js";

if (!isOfficer()) location.replace("login.html");

const id = (param("id") || "").toUpperCase();
let due = "", dueErr = "", note = "", noteErr = "";
let redraw = () => {};

/** "YYYY-MM-DD" for today + n days (the format of a date input). */
function ymd(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** End of the chosen day as an ISO string. */
function endOfDay(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

/** Show a save error. */
function failed(e) {
  toast(t(String(e && e.message) === "storage-full" ? "This phone’s storage is full. Free up space on the phone and try again." : "This complaint can no longer be changed."), { kind: "err" });
}

/** Move Submitted/Reopened → In progress, promising a fix date. */
function start(c) {
  const e = checkDueDate(due);
  dueErr = e ? t(e) : "";
  if (dueErr) { redraw(); document.getElementById("due")?.focus(); return; }
  try {
    const dueBy = endOfDay(due);
    store.move(c.id, "In progress", "officer", { dueBy });
    due = "";
    redraw();
    toast(t("Work started on {id} · fix promised by {d}", { id: c.id, d: dayDate(dueBy, lang()) }));
  } catch (err) { failed(err); }
}

/** Post a progress update; a date, if chosen, replaces the promised fix date. */
function postUpdate(c) {
  const n = checkOfficerNote(note), d = due ? checkDueDate(due) : "";
  noteErr = n ? t(n) : ""; dueErr = d ? t(d) : "";
  if (noteErr || dueErr) { redraw(); document.getElementById(noteErr ? "onote" : "due")?.focus(); return; }
  try {
    store.update(c.id, "officer", { note, dueBy: due ? endOfDay(due) : null });
    toast(due ? t("Update posted · new fix date {d}", { d: dayDate(endOfDay(due), lang()) }) : t("Update posted — the citizen can see it"));
    note = ""; due = "";
    redraw();
  } catch (err) { failed(err); }
}

/** Say the work is done: the citizen is asked to check it at the spot and resolve it. */
function workDone(c) {
  const n = checkOfficerNote(note);
  noteErr = n ? t(n) : ""; dueErr = "";
  if (noteErr) { redraw(); document.getElementById("onote")?.focus(); return; }
  try {
    store.move(c.id, "Fixed", "officer", { officerNote: note });
    note = ""; due = "";
    redraw();
    toast(t("{id}: work done — waiting for the citizen to check and resolve it", { id: c.id }));
  } catch (err) { failed(err); }
}

/** Fix-date picker: quick picks plus a date box. */
function dueField(label, hint) {
  const input = h("input", { id: "due", type: "date", min: ymd(0), max: ymd(LIMITS.dueMaxDays), value: due, "aria-invalid": dueErr ? "true" : "false" });
  input.addEventListener("input", () => { due = input.value; });
  const chip = (n, text) => h("button", { type: "button", class: "btn btn-sm " + (due === ymd(n) ? "btn-primary" : "btn-ghost"), "aria-pressed": due === ymd(n) ? "true" : "false", onclick: () => { due = due === ymd(n) ? "" : ymd(n); dueErr = ""; redraw(); } }, text);
  return field({ id: "due", label, hint, error: dueErr,
    control: h("div", { class: "due-pick" }, h("div", { class: "loc-btns" }, chip(0, t("Today")), chip(1, t("Tomorrow")), chip(3, t("In 3 days")), chip(7, t("In 1 week"))), input) });
}

/** Follow-up box while the work is in progress. */
function followUp(c) {
  const dueNow = dueInfo(c);
  const counter = h("span", { class: "counter", text: `${note.length} / ${LIMITS.officerNoteMax}` });
  const ta = h("textarea", { id: "onote", rows: 3, maxlength: LIMITS.officerNoteMax, placeholder: t("e.g. Material ordered, crew visits on Friday"), "aria-invalid": noteErr ? "true" : "false" });
  ta.value = note;
  ta.addEventListener("input", () => { note = ta.value; counter.textContent = `${note.length} / ${LIMITS.officerNoteMax}`; });
  return h("section", { class: "card block" },
    h("h2", { class: "block-title", text: t("Follow up") }),
    dueNow ? h("div", { class: "banner " + (dueNow.late ? "warn" : "info") }, icon("clock", 20), h("div", {}, h("b", { text: dueNow.text }), dueNow.late ? h("p", { text: t("The citizen can see that this fix is overdue. Post an update with a new date.") }) : null)) : null,
    field({ id: "onote", label: t("Update for the citizen"), hint: t("What is happening, or what was done. The citizen sees every update."), control: ta, counter, error: noteErr }),
    dueField(t("New fix date (optional)"), t("Leave empty to keep the current date.")),
    h("div", { class: "two" },
      h("button", { type: "button", class: "btn btn-primary btn-lg", onclick: () => postUpdate(c) }, icon("clock", 20), t("Post update")),
      h("button", { type: "button", class: "btn btn-green btn-lg", onclick: () => workDone(c) }, icon("check", 20), t("Work done"))),
    h("p", { class: "fine", text: t("“Work done” asks the citizen to check at the spot. Only the citizen can mark it resolved, with a new photo.") }));
}

/** What the officer can do now. */
function action(c) {
  if (c.status === "Submitted" || c.status === "Reopened") {
    return h("section", { class: "card block" }, h("h2", { class: "block-title", text: t("Next step") }),
      c.status === "Reopened" ? h("div", { class: "banner warn" }, icon("reopen", 20), h("div", {}, h("b", { text: t("Reopened by the citizen") }), h("p", { text: "“" + c.reText + "”" }))) : null,
      dueField(t("Fix will be done by"), t("The citizen sees this date. If it passes, the complaint shows as overdue.")),
      h("button", { type: "button", class: "btn btn-primary btn-lg btn-block", onclick: () => start(c) }, icon("clock", 20), t("Start work")));
  }
  if (c.status === "In progress") return followUp(c);
  if (c.status === "Fixed") return h("div", { class: "banner info" }, icon("clock", 22), h("div", {}, h("b", { text: t("Waiting for the citizen") }), h("p", { text: t("They will check it at the spot and resolve it with a new photo, or reopen it.") })));
  if (c.status === "Verified") return h("div", { class: "banner ok" }, icon("check", 22), h("div", {}, h("b", { text: t("Resolved by the citizen") }), h("p", { text: t("Closed with the citizen's photo taken at the spot.") })));
  return h("div", { class: "banner muted" }, icon("info", 22), h("div", {}, h("b", { text: t("Withdrawn") }), h("p", { text: t("The citizen withdrew this complaint.") })));
}

/** Draw the page. */
function render(main) {
  const c = store.get(id);
  if (!c) { main.replaceChildren(h("div", { class: "wrap page" }, empty(t("Complaint not found"), ""), h("p", { class: "center" }, h("a", { href: "officer.html", class: "btn btn-primary", text: t("Back to dashboard") })))); return; }
  const pictures = c.afterPhoto ? h("div", { class: "card pad0" }, compare(c.beforePhoto, c.afterPhoto))
    : h("div", { class: "card pad0 single" }, photo(c.beforePhoto, t("Before photo")), h("span", { class: "cmp-tag cmp-tag-b", text: t("BEFORE") }));
  main.replaceChildren(h("div", { class: "wrap page" },
    h("a", { href: "officer.html", class: "back" }, icon("back", 18), t("Dashboard")),
    h("div", { class: "page-head" }, h("div", {}, h("h1", { class: "page-title", text: `${c.id} · ${catName(c.cat)}` }), h("p", { class: "page-sub", text: `${c.area} · ${placeName(c)} · ${t("reported {ago}", { ago: ago(c.createdAt) })}` })), badge(c.status, true)),
    h("div", { class: "verify" },
      h("div", { class: "col" }, pictures,
        h("div", { class: "card block facts" },
          h("p", {}, h("b", { text: t("Location:") }), ` ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` + (c.acc ? ` · ${t("accuracy {m} m", { m: c.acc })}` : "")),
          h("p", {}, h("a", { class: "btn btn-primary", href: `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`, target: "_blank", rel: "noopener noreferrer" }, icon("pin", 18), t("Directions to the spot"))),
          c.note ? h("p", {}, h("b", { text: t("Citizen's description:") }), " " + c.note) : null)),
      h("div", { class: "col" }, action(c), h("section", { class: "card block" }, h("h2", { class: "block-title", text: t("What happened") }), timeline(c))))));
}

const draw = boot({ page: "officer", officer: true, render, title: () => (id ? `${id} · ${t("Follow up")}` : t("Follow up")) });
redraw = () => { const y = window.scrollY, a = document.activeElement && document.activeElement.id; draw(); window.scrollTo(0, y); if (a) document.getElementById(a)?.focus({ preventScroll: true }); };
