// pages/verify.js — The citizen's view of one complaint: status, officer updates and timeline.
// Only the citizen closes it: "Mark resolved" needs a NEW photo taken at the spot (plus GPS),
// shown next to the first photo; "Reopen" sends it back to the officer with a reason.

import { h, icon, toast, param, shortDate, distanceM } from "../helpers.js";
import { t, lang, catName, ago, prefs } from "../i18n.js";
import { boot } from "../layout.js";
import * as store from "../store.js";
import { checkReason, checkLocation, LIMITS } from "../validate.js";
import { MAX_FIX_ACCURACY, demoPhotoPath } from "../data.js";
import { fixBaseline } from "../rules.js";
import { preparePhoto, putPhoto, deletePhoto, isQuotaError, demoPhoto } from "../photos.js";
import { badge, compare, photo, timeline, locationMatch, zoneLine, empty, field, dueInfo, fixTiming } from "../ui.js";

const id = (param("id") || "").toUpperCase();
const res = { blob: null, url: "", takenAt: null, loc: null, demo: false, path: "" }; // the new photo for "Mark resolved"
let errs = {}, locating = false, saving = false;
let reopening = false, reason = "", reasonErr = "";
let redraw = () => {};

/** Can this citizen resolve or reopen it now? */
const canResolve = (c) => c.mine && (c.status === "In progress" || c.status === "Fixed");

/** New photo picked: it must be newer than the officer's "work done" (or the complaint / last reopen). */
async function pick(c, file) {
  const out = await preparePhoto(file);
  if (!out.error && out.takenAt < fixBaseline(c)) {
    out.error = c.fixedAt ? "This photo was taken before the officer finished the work. Take a new photo at the spot now."
      : "This photo was taken before the complaint was raised. Take a new photo at the spot.";
  }
  if (out.error) { errs.photo = t(out.error); redraw(); toast(errs.photo, { kind: "err" }); return; }
  if (res.url) URL.revokeObjectURL(res.url);
  Object.assign(res, { blob: out.blob, url: URL.createObjectURL(out.blob), takenAt: out.takenAt });
  delete errs.photo;
  redraw();
}

/** Demo mode: a real sample photo of this problem type after it was fixed (random), counted as taken now. */
async function useDemoPhoto(c) {
  try {
    const path = demoPhotoPath(c.cat, "after", res.path);
    const p = await demoPhoto(path);
    if (res.url) URL.revokeObjectURL(res.url);
    Object.assign(res, { blob: p.blob, url: URL.createObjectURL(p.blob), takenAt: p.takenAt, demo: true, path });
    delete errs.photo;
    redraw();
  } catch { toast(t("Could not load the demo photo"), { kind: "err" }); }
}

/** GPS where the new photo was taken (always a fresh reading). */
function locate() {
  if (!("geolocation" in navigator)) { errs.loc = t("This device cannot share its location. Open the app on a phone with GPS."); redraw(); return; }
  locating = true; redraw();
  navigator.geolocation.getCurrentPosition(
    (p) => { locating = false; setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); },
    () => { locating = false; errs.loc = t("Location was blocked or not found. Allow location for this site in your browser settings and try again."); redraw(); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
function setLoc(loc) {
  const e = checkLocation(loc) ? t(checkLocation(loc))
    : loc.acc > MAX_FIX_ACCURACY ? t("GPS is too rough (± {m} m). Step into the open and try again.", { m: loc.acc }) : "";
  if (e) { errs.loc = e; res.loc = null; } else { res.loc = loc; delete errs.loc; }
  redraw();
}

/** Citizen closes it with the new photo as proof. */
async function resolve(c) {
  if (saving) return;
  errs = {};
  if (!res.blob) errs.photo = t("Take a new photo at the spot — it is kept as proof that the problem is fixed.");
  if (!res.loc) errs.loc = t("Add the location where you took the photo.");
  if (Object.keys(errs).length) { redraw(); toast(t("Please fix the fields marked in red"), { kind: "err" }); return; }
  saving = true; redraw();
  const key = "r-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  try {
    await putPhoto(key, res.blob);
    const { previous } = store.move(c.id, "Verified", "citizen", { afterPhoto: "idb:" + key, afterTakenAt: res.takenAt, afterLat: res.loc.lat, afterLng: res.loc.lng, afterAcc: res.loc.acc, demo: res.demo });
    if (res.url) URL.revokeObjectURL(res.url);
    Object.assign(res, { blob: null, url: "", takenAt: null, loc: null, demo: false });
    toast(t("✓ Resolved — complaint closed"), { action: t("Undo"), ms: 5000, onAction: () => { store.restore(previous); deletePhoto(key).catch(() => {}); redraw(); } });
  } catch (e) {
    deletePhoto(key).catch(() => {});
    toast(t(isQuotaError(e) ? "This phone’s storage is full. Free up space on the phone and try again." : "This complaint can no longer be changed."), { kind: "err" });
  }
  saving = false; redraw();
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

/** Reopen form (only after the officer said the work is done). */
function reopenForm() {
  const counter = h("span", { class: "counter", text: `${reason.length} / ${LIMITS.reasonMax}` });
  const ta = h("textarea", { id: "reason", rows: 3, maxlength: LIMITS.reasonMax, placeholder: t("e.g. Only half the pothole is filled"), "aria-invalid": reasonErr ? "true" : "false", "aria-describedby": reasonErr ? "reason-err" : null });
  ta.value = reason;
  ta.addEventListener("input", () => { reason = ta.value; counter.textContent = `${reason.length} / ${LIMITS.reasonMax}`; });
  return h("section", { class: "card block decide" },
    field({ id: "reason", label: t("What is still wrong?"), hint: t("At least 10 characters"), control: ta, counter, error: reasonErr }),
    h("div", { class: "two" },
      h("button", { type: "button", class: "btn btn-red btn-lg", onclick: () => reopen(store.get(id)) }, icon("reopen", 20), t("Send back to officer")),
      h("button", { type: "button", class: "btn btn-ghost btn-lg", onclick: () => { reopening = false; reasonErr = ""; redraw(); }, text: t("Cancel") })));
}

/** Resolve box: new photo + GPS → "Mark resolved"; after "work done" also "Not fixed — reopen". */
function decide(c) {
  if (!canResolve(c)) return null;
  if (reopening && c.status === "Fixed") return reopenForm();
  const input = h("input", { id: "after", type: "file", accept: "image/jpeg,image/png,image/webp", capture: "environment", class: "sr-only" });
  input.addEventListener("change", () => input.files[0] && pick(c, input.files[0]));
  const dist = res.loc ? distanceM(c.lat, c.lng, res.loc.lat, res.loc.lng) : null;
  return h("section", { class: "card block decide" },
    h("h2", { class: "block-title", text: c.status === "Fixed" ? t("Is the problem really fixed?") : t("Already fixed?") }),
    h("p", { class: "muted", text: t("Only you can close this complaint. Go to the spot and take a new photo — it is kept as proof next to your first photo.") }),
    h("div", { class: "field" + (errs.photo ? " has-err" : "") }, h("p", { class: "field-label", text: t("New photo at the spot") }), input,
      res.url ? h("div", { class: "photo-meta" }, h("span", { class: "muted", text: (res.demo ? t("Demo photo") + " · " : "") + t("Taken {when} · shown next to your first photo", { when: shortDate(new Date(res.takenAt).toISOString(), lang()) }) }),
          res.demo && prefs().demo ? h("button", { type: "button", class: "link-btn", onclick: () => useDemoPhoto(c), text: t("Try another demo photo") }) : null,
          h("button", { type: "button", class: "link-btn", onclick: () => { URL.revokeObjectURL(res.url); Object.assign(res, { blob: null, url: "", takenAt: null, demo: false, path: "" }); redraw(); }, text: t("Retake photo") }))
        : h("label", { for: "after", class: "drop" + (errs.photo ? " err" : "") }, icon("camera", 28), h("b", { text: t("Take a new photo") })),
      // Demo photos only for the sample complaints: a real complaint is closed only with a real photo.
      !res.url && prefs().demo ? h("div", { class: "loc-btns demo-btns" }, h("button", { type: "button", class: "btn btn-ghost", onclick: () => useDemoPhoto(c) }, icon("camera", 18), t("Use a demo photo"))) : null,
      errs.photo ? h("p", { class: "field-err", role: "alert", text: errs.photo }) : null),
    h("div", { class: "field" + (errs.loc ? " has-err" : "") }, h("p", { class: "field-label", text: t("Where did you take it?") }),
      res.loc ? h("p", { class: "match " + (dist <= 50 ? "ok" : "far") }, icon(dist <= 50 ? "check" : "info", 18), t("{d} m from your first pin", { d: dist }) + ` · ${t("accuracy {m} m", { m: res.loc.acc })}`)
        : h("div", { class: "loc-btns" }, h("button", { type: "button", class: "btn btn-primary", disabled: locating || null, onclick: locate }, icon("pin", 18), locating ? t("Finding you…") : t("Use my location")),
            prefs().demo ? h("button", { type: "button", class: "btn btn-ghost", onclick: () => { res.demo = true; setLoc({ lat: c.lat + 0.00008, lng: c.lng + 0.00005, acc: 10 }); }, text: t("Use demo location") }) : null),
      errs.loc ? h("p", { class: "field-err", role: "alert", text: errs.loc }) : null),
    h("div", { class: c.status === "Fixed" ? "two" : "" },
      h("button", { type: "button", class: "btn btn-green btn-lg" + (c.status === "Fixed" ? "" : " btn-block") + (saving ? " is-busy" : ""), disabled: saving || null, onclick: () => resolve(c) }, saving ? h("span", { class: "spinner" }) : icon("check", 20), t("Mark resolved")),
      c.status === "Fixed" ? h("button", { type: "button", class: "btn btn-red-outline btn-lg", onclick: () => { reopening = true; redraw(); document.getElementById("reason")?.focus(); } }, icon("reopen", 20), t("Not fixed — reopen")) : null));
}

/** Status banner: what is happening and what comes next. */
function statusNote(c) {
  if (c.status === "Verified") return h("div", { class: "banner ok" }, icon("check", 22), h("div", {}, h("b", { text: t("Resolved") }), h("p", { text: t("{id} is closed with your photo from the spot. Thank you.", { id: c.id }) })));
  if (c.status === "Reopened") return h("div", { class: "banner warn" }, icon("reopen", 22), h("div", {}, h("b", { text: t("Reopened · sent back to the officer") }), h("p", { text: t("Reason: “{r}”. The officer has to start work again and set a new date.", { r: c.reText }) })));
  if (c.status === "Submitted") return h("div", { class: "banner info" }, icon("clock", 22), h("div", {}, h("b", { text: t("Waiting for an officer to start work") }), h("p", { text: t("The officer will set a date for the fix and post updates here.") })));
  if (c.status === "In progress") {
    const due = dueInfo(c);
    return h("div", { class: "banner " + (due && due.late ? "warn" : "info") }, icon("clock", 22), h("div", {},
      h("b", { text: due ? due.text : t("Work started") }),
      h("p", { text: due && due.late ? t("The officer has missed the promised date. Updates appear below.") : t("The officer is working on it and posts updates below. When it is fixed, you close it with a new photo.") })));
  }
  if (c.status === "Fixed") return h("div", { class: "banner info" }, icon("check", 22), h("div", {}, h("b", { text: t("The officer says the work is done") }), h("p", { text: t("Go to the spot and check. If it is fixed, take a new photo and mark it resolved. If not, reopen it.") })));
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
  const after = c.afterPhoto || res.url; // the saved resolution photo, or the one being added now
  const pictures = after ? compare(c.beforePhoto, after) : h("div", { class: "single" }, photo(c.beforePhoto, t("Before photo")), h("span", { class: "cmp-tag cmp-tag-b", text: t("BEFORE") }));
  main.replaceChildren(h("div", { class: "wrap page" },
    h("a", { href: c.mine ? "my.html" : "index.html", class: "back" }, icon("back", 18), c.mine ? t("My complaints") : t("Home")),
    h("div", { class: "page-head" },
      h("div", {}, h("h1", { class: "page-title", text: c.status === "Fixed" && c.mine ? t("Check & resolve") : `${c.id} · ${catName(c.cat)}` }),
        h("p", { class: "page-sub", text: `${c.id} · ${catName(c.cat)} · ${c.area} · ${t("reported {ago}", { ago: ago(c.createdAt) })}` })),
      badge(c.status)),
    h("div", { class: "verify" },
      h("div", { class: "col" }, h("div", { class: "card pad0" }, pictures),
        h("div", { class: "card block facts" },
          locationMatch(c),
          c.officerNote ? h("p", {}, h("b", { text: t("Officer’s note:") }), " " + c.officerNote) : null,
          c.fixedAt ? h("p", {}, h("b", { text: t("Work done on:") }), " " + shortDate(c.fixedAt, lang())) : null,
          fixTiming(c) ? h("p", { class: fixTiming(c).late ? "warn-text" : "", text: fixTiming(c).text }) : null,
          c.afterTakenAt ? h("p", {}, h("b", { text: t("Resolution photo taken:") }), " " + shortDate(new Date(c.afterTakenAt).toISOString(), lang())) : null,
          c.note ? h("p", {}, h("b", { text: t("Your description:") }), " " + c.note) : null,
          h("p", { class: "muted", text: zoneLine(c) }),
          c.demo ? h("p", { class: "muted", text: t("Demo mode: a sample photo or location was used.") }) : null)),
      h("div", { class: "col" }, statusNote(c), decide(c),
        h("section", { class: "card block" }, h("h2", { class: "block-title", text: t("What happened") }), timeline(c))))));
}

/** Tab title: the complaint ID plus "Check & resolve" when it is waiting for this citizen. */
function pageTitle() {
  const c = store.get(id);
  if (!c) return t("Complaint not found");
  return `${c.id} · ${c.mine && c.status === "Fixed" ? t("Check & resolve") : catName(c.cat)}`;
}

const draw = boot({ page: "my", render, title: pageTitle });
redraw = () => { const y = window.scrollY; draw(); window.scrollTo(0, y); };
