// pages/update.js — Officer works on one complaint: Start work (promising a fix date), then Mark fixed
// (a new after-photo, its GPS location and a note are required — no proof, no closing).

import { h, icon, toast, param, distanceM, dayDate } from "../helpers.js";
import { t, lang, catName, ago, zoneName } from "../i18n.js";
import { boot, isOfficer } from "../layout.js";
import * as store from "../store.js";
import { checkOfficerNote, checkLocation, checkDueDate, LIMITS } from "../validate.js";
import { MAX_FIX_ACCURACY } from "../data.js";
import { fixBaseline } from "../rules.js";
import { preparePhoto, putPhoto, deletePhoto, isQuotaError } from "../photos.js";
import { badge, photo, timeline, field, empty, dueInfo } from "../ui.js";

if (!isOfficer()) location.replace("login.html");

const id = (param("id") || "").toUpperCase();
const fix = { blob: null, url: "", takenAt: null, loc: null, note: "" };
let errs = {}, saving = false, locating = false, due = "", dueErr = "";
let redraw = () => {};

/** "YYYY-MM-DD" for today + n days (the format of a date input). */
function ymd(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Move Submitted/Reopened → In progress, promising a fix date (end of that day). */
function start(c) {
  const e = checkDueDate(due);
  dueErr = e ? t(e) : "";
  if (dueErr) { redraw(); document.getElementById("due")?.focus(); return; }
  const [y, m, d] = due.split("-").map(Number);
  const dueBy = new Date(y, m - 1, d, 23, 59, 59).toISOString();
  try {
    store.move(c.id, "In progress", "officer", { dueBy });
    due = "";
    redraw();
    toast(t("Work started on {id} · fix promised by {d}", { id: c.id, d: dayDate(dueBy, lang()) }));
  } catch { toast(t("This complaint can no longer be changed."), { kind: "err" }); }
}

/** Fix-date picker shown before Start work. */
function dueField() {
  const input = h("input", { id: "due", type: "date", min: ymd(0), max: ymd(LIMITS.dueMaxDays), value: due, "aria-invalid": dueErr ? "true" : "false" });
  input.addEventListener("input", () => { due = input.value; });
  const chip = (n, label) => h("button", { type: "button", class: "btn btn-sm " + (due === ymd(n) ? "btn-primary" : "btn-ghost"), "aria-pressed": due === ymd(n) ? "true" : "false", onclick: () => { due = ymd(n); dueErr = ""; redraw(); } }, label);
  return field({ id: "due", label: t("Fix will be done by"), hint: t("The citizen sees this date. If it passes, the complaint shows as overdue."), error: dueErr,
    control: h("div", { class: "due-pick" }, h("div", { class: "loc-btns" }, chip(0, t("Today")), chip(1, t("Tomorrow")), chip(3, t("In 3 days")), chip(7, t("In 1 week"))), input) });
}

/** After-photo picked: it must be taken after the complaint was raised (or last reopened). */
async function pick(c, file) {
  const res = await preparePhoto(file);
  if (!res.error && res.takenAt < fixBaseline(c)) res.error = "This photo was taken before the complaint was raised. Take a new photo at the spot.";
  if (res.error) { errs.photo = t(res.error); redraw(); toast(errs.photo, { kind: "err" }); return; }
  if (fix.url) URL.revokeObjectURL(fix.url);
  fix.blob = res.blob; fix.url = URL.createObjectURL(res.blob); fix.takenAt = res.takenAt; delete errs.photo; redraw();
}

/** Officer's GPS at the spot (no maximumAge: always a fresh reading). */
function locate() {
  if (!("geolocation" in navigator)) { errs.loc = t("This device cannot share its location. Open the app on a phone with GPS."); redraw(); return; }
  locating = true; redraw();
  navigator.geolocation.getCurrentPosition(
    (p) => { locating = false; setFixLoc({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); },
    () => { locating = false; errs.loc = t("Location was blocked or not found. Allow location for this site in your browser settings and try again."); redraw(); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
function setFixLoc(loc) {
  const e = checkLocation(loc) ? t(checkLocation(loc))
    : loc.acc > MAX_FIX_ACCURACY ? t("GPS is too rough (± {m} m). Step into the open and try again.", { m: loc.acc }) : "";
  if (e) { errs.loc = e; fix.loc = null; } else { fix.loc = loc; delete errs.loc; }
  redraw();
}

/** Save the fix. */
async function markFixed(c) {
  if (saving) return;
  errs = {};
  if (!fix.blob) errs.photo = t("An after-photo is required — no proof, no closing.");
  if (!fix.loc) errs.loc = t("Add the location where the after-photo was taken.");
  const n = checkOfficerNote(fix.note); if (n) errs.note = t(n);
  if (Object.keys(errs).length) { redraw(); toast(t("Please fix the fields marked in red"), { kind: "err" }); return; }
  saving = true; redraw();
  const key = "a-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  try {
    await putPhoto(key, fix.blob);
    store.move(c.id, "Fixed", "officer", { afterPhoto: "idb:" + key, afterTakenAt: fix.takenAt, officerNote: fix.note, afterLat: fix.loc.lat, afterLng: fix.loc.lng, afterAcc: fix.loc.acc });
    toast(t("{id} marked fixed — waiting for the citizen to check", { id: c.id }));
    if (fix.url) URL.revokeObjectURL(fix.url);
    Object.assign(fix, { blob: null, url: "", takenAt: null, loc: null, note: "" });
  } catch (e) {
    deletePhoto(key).catch(() => {});
    const msg = String(e && e.message).includes("refused") ? "This complaint can no longer be changed."
      : isQuotaError(e) ? "This phone’s storage is full. Free up space on the phone and try again." : "Could not save. Please try again.";
    toast(t(msg), { kind: "err" });
  }
  saving = false; redraw();
}

/** Mark-fixed form (only when In progress). */
function fixForm(c) {
  const input = h("input", { id: "after", type: "file", accept: "image/jpeg,image/png,image/webp", capture: "environment", class: "sr-only" });
  input.addEventListener("change", () => input.files[0] && pick(c, input.files[0]));
  const counter = h("span", { class: "counter", text: `${fix.note.length} / ${LIMITS.officerNoteMax}` });
  const note = h("textarea", { id: "onote", rows: 3, maxlength: LIMITS.officerNoteMax, placeholder: t("What was done, e.g. Pothole filled and levelled"), "aria-invalid": errs.note ? "true" : "false" });
  note.value = fix.note;
  note.addEventListener("input", () => { fix.note = note.value; counter.textContent = `${fix.note.length} / ${LIMITS.officerNoteMax}`; });
  const dist = fix.loc ? distanceM(c.lat, c.lng, fix.loc.lat, fix.loc.lng) : null;
  const dueNow = dueInfo(c);
  return h("section", { class: "card block" },
    h("h2", { class: "block-title", text: t("Mark as fixed") }),
    dueNow ? h("div", { class: "banner " + (dueNow.late ? "warn" : "info") }, icon("clock", 20), h("div", {}, h("b", { text: dueNow.text }), dueNow.late ? h("p", { text: t("The citizen can see that this fix is overdue.") }) : null)) : null,
    h("p", { class: "muted", text: t("Take the after-photo at the same spot, after the work is done. The citizen will compare it with the before-photo.") }),
    h("div", { class: "field" + (errs.photo ? " has-err" : "") }, h("p", { class: "field-label", text: t("After-photo") }), input,
      fix.url ? h("div", { class: "photo-prev" }, h("img", { src: fix.url, alt: t("After photo"), width: 640, height: 400 }), h("button", { type: "button", class: "link-btn", onclick: () => { if (fix.url) URL.revokeObjectURL(fix.url); fix.blob = null; fix.url = ""; fix.takenAt = null; redraw(); }, text: t("Remove photo") }))
        : h("label", { for: "after", class: "drop" + (errs.photo ? " err" : "") }, icon("camera", 28), h("b", { text: t("Take or choose the after-photo") })),
      errs.photo ? h("p", { class: "field-err", role: "alert", text: errs.photo }) : null),
    h("div", { class: "field" + (errs.loc ? " has-err" : "") }, h("p", { class: "field-label", text: t("Where was it taken?") }),
      fix.loc ? h("p", { class: "match " + (dist <= 50 ? "ok" : "far") }, icon(dist <= 50 ? "check" : "info", 18), t("{d} m from the citizen's pin", { d: dist }) + ` · ${t("accuracy {m} m", { m: fix.loc.acc })}` + (dist > 50 ? " — " + t("the citizen will see this warning") : ""))
        : h("div", { class: "loc-btns" }, h("button", { type: "button", class: "btn btn-primary", disabled: locating || null, onclick: locate }, icon("pin", 18), locating ? t("Finding you…") : t("Use my location"))),
      errs.loc ? h("p", { class: "field-err", role: "alert", text: errs.loc }) : null),
    field({ id: "onote", label: t("Officer’s note"), control: note, counter, error: errs.note || "" }),
    h("button", { type: "button", class: "btn btn-green btn-lg btn-block" + (saving ? " is-busy" : ""), disabled: saving || null, onclick: () => markFixed(c) }, saving ? h("span", { class: "spinner" }) : icon("check", 20), t("Mark fixed")));
}

/** Draw the page. */
function render(main) {
  const c = store.get(id);
  if (!c) { main.replaceChildren(h("div", { class: "wrap page" }, empty(t("Complaint not found"), ""), h("p", { class: "center" }, h("a", { href: "officer.html", class: "btn btn-primary", text: t("Back to dashboard") })))); return; }
  let action = null;
  if (c.status === "Submitted" || c.status === "Reopened") {
    action = h("section", { class: "card block" }, h("h2", { class: "block-title", text: t("Next step") }),
      c.status === "Reopened" ? h("div", { class: "banner warn" }, icon("reopen", 20), h("div", {}, h("b", { text: t("Reopened by the citizen") }), h("p", { text: "“" + c.reText + "”" }))) : null,
      dueField(),
      h("button", { type: "button", class: "btn btn-primary btn-lg btn-block", onclick: () => start(c) }, icon("clock", 20), t("Start work")));
  } else if (c.status === "In progress") action = fixForm(c);
  else action = h("div", { class: "banner " + (c.status === "Verified" ? "ok" : "info") }, icon(c.status === "Verified" ? "check" : "clock", 22),
    h("div", {}, h("b", { text: c.status === "Verified" ? t("Closed — verified by the citizen") : t("Waiting for the citizen to check") }), h("p", { text: t("Only the citizen can close or reopen it.") })));

  main.replaceChildren(h("div", { class: "wrap page" },
    h("a", { href: "officer.html", class: "back" }, icon("back", 18), t("Dashboard")),
    h("div", { class: "page-head" }, h("div", {}, h("h1", { class: "page-title", text: `${c.id} · ${catName(c.cat)}` }), h("p", { class: "page-sub", text: `${c.area} · ${zoneName(c.zone)} · ${t("reported {ago}", { ago: ago(c.createdAt) })}` })), badge(c.status, true)),
    h("div", { class: "verify" },
      h("div", { class: "col" }, h("div", { class: "card pad0 single" }, photo(c.beforePhoto, t("Before photo")), h("span", { class: "cmp-tag cmp-tag-b", text: t("BEFORE") })),
        h("div", { class: "card block facts" },
          h("p", {}, h("b", { text: t("Location:") }), ` ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` + (c.acc ? ` · ${t("accuracy {m} m", { m: c.acc })}` : "")),
          h("p", {}, h("a", { class: "btn btn-primary", href: `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`, target: "_blank", rel: "noopener noreferrer" }, icon("pin", 18), t("Directions to the spot"))),
          c.note ? h("p", {}, h("b", { text: t("Citizen's description:") }), " " + c.note) : null)),
      h("div", { class: "col" }, action, h("section", { class: "card block" }, h("h2", { class: "block-title", text: t("What happened") }), timeline(c))))));
}

const draw = boot({ page: "officer", officer: true, render, title: () => (id ? `${id} · ${t("Update complaint")}` : t("Update complaint")) });
redraw = () => { const y = window.scrollY, a = document.activeElement && document.activeElement.id; draw(); window.scrollTo(0, y); if (a) document.getElementById(a)?.focus({ preventScroll: true }); };
