// pages/raise.js — Raise a complaint in 4 steps: type, photo, location, details.
// Nothing is saved until every check in validate.js passes.

import { h, icon, toast, toastNext, distanceM, reducedMotion } from "../helpers.js";
import { t, catName, placeName, prefs, setPref } from "../i18n.js";
import { CATEGORIES, placeFor, catByKey, DEMO_POINT, demoPhotoPath } from "../data.js";
import { boot } from "../layout.js";
import * as store from "../store.js";
import { checkRaise, checkLocation, LIMITS } from "../validate.js";
import { preparePhoto, putPhoto, deletePhoto, isQuotaError, demoPhoto } from "../photos.js";
import { field, pageHead } from "../ui.js";

const q = new URLSearchParams(location.search);
const form = {
  cat: CATEGORIES.some((c) => c.key === q.get("cat")) ? q.get("cat") : "",
  photo: null, photoURL: "", photoInfo: "", photoTakenAt: null,
  loc: null, area: "", note: "",
  demo: false, // a demo-mode photo or location was used
};
let showMore = q.get("more") === "1" || CATEGORIES.findIndex((c) => c.key === form.cat) >= 9;
let tried = false, sending = false, locating = false, photoErr = "", locErr = "";
const fresh = { photo: false, loc: false }; // pop in once when just added, not on every redraw
let redraw = () => {};

/** Errors to show (only after the first Submit attempt, or for the photo/location right away). */
function errors() {
  const e = checkRaise({ cat: form.cat, photo: form.photo, loc: form.loc, area: form.area, note: form.note });
  if (!tried) return { photo: photoErr, loc: locErr };
  return { ...e, photo: photoErr || e.photo || "", loc: locErr || e.loc || "" };
}

/** Steps done counter. */
function doneCount() {
  return [!!form.cat, !!form.photo, !!form.loc && !checkLocation(form.loc), form.area.trim().length >= 3].filter(Boolean).length;
}

/** Step indicator. */
function steps() {
  const items = [["Problem", "Choose the type", !!form.cat], ["Photo", "The “before” proof", !!form.photo], ["Location", "GPS pin + zone", !!form.loc], ["Details", "Area and a note", form.area.trim().length >= 3]];
  return h("div", { class: "steps-wrap" },
    h("ol", { class: "steps" }, items.map(([a, b, ok], i) => h("li", { class: "step" + (ok ? " done" : "") }, h("span", { class: "step-n" }, ok ? icon("check", 16) : String(i + 1)), h("span", {}, h("b", { text: t(a) }), h("small", { text: t(b) }))))),
    h("p", { class: "steps-count", text: t("{n} of 4 done", { n: doneCount() }) }));
}

/** Step 1: problem type grid. */
function catStep(err) {
  const list = showMore ? CATEGORIES : CATEGORIES.slice(0, 9);
  return h("fieldset", { class: "card block" + (err ? " has-err" : ""), id: "sec-cat" },
    h("legend", { class: "block-title", text: t("1 · What is the problem?") }),
    h("div", { class: "cats", role: "radiogroup", "aria-label": t("Choose the type of problem.") }, list.map((c) =>
      h("button", { type: "button", role: "radio", "aria-checked": form.cat === c.key ? "true" : "false", class: "cat" + (form.cat === c.key ? " on" : ""), onclick: () => { form.cat = c.key; redraw(); } },
        h("img", { src: `img/scenes/${c.scene}.svg`, alt: "", width: 240, height: 160, loading: "lazy" }), h("span", { text: t(c.en) })))),
    h("button", { type: "button", class: "more-btn", onclick: () => { showMore = !showMore; redraw(); } }, showMore ? t("Show fewer problem types") : t("+ {n} more problem types", { n: CATEGORIES.length - 9 })),
    err ? h("p", { class: "field-err", role: "alert", text: t(err) }) : null);
}

/** Step 2: photo. */
function photoStep(err) {
  const input = h("input", { id: "photo", type: "file", accept: "image/jpeg,image/png,image/webp", capture: "environment", class: "sr-only", "aria-describedby": "photo-hint" });
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const res = await preparePhoto(file);
    if (res.error) { photoErr = t(res.error); form.photo = null; redraw(); toast(photoErr, { kind: "err" }); return; }
    setPhoto(res.blob, `${file.name} · ${t("shrunk to {w} px", { w: Math.max(res.width, res.height) })} · ${Math.round(res.blob.size / 1024)} KB`, res.takenAt);
    toast(t("Photo added"));
  });
  const body = form.photo
    ? h("div", { class: "photo-prev" }, h("img", { src: form.photoURL, alt: t("Your photo"), width: 640, height: 400, class: fresh.photo ? "pop" : null }),
        h("div", { class: "photo-meta" }, h("span", { class: "muted", text: form.photoInfo }),
          form.demo && prefs().demo ? h("button", { type: "button", class: "link-btn", onclick: useDemoPhoto }, t("Try another demo photo")) : null,
          h("button", { type: "button", class: "link-btn", onclick: () => { form.photo = null; form.photoURL = ""; redraw(); toast(t("Photo removed")); } }, t("Remove photo"))))
    : h("label", { for: "photo", class: "drop" + (err ? " err" : "") }, icon("camera", 32), h("b", { text: t("Take or choose a photo") }), h("span", { id: "photo-hint", class: "muted", text: t("JPG, PNG or WebP · under 15 MB · at least 200 × 200") }));
  return h("section", { class: "card block" + (err ? " has-err" : ""), id: "sec-photo", "aria-labelledby": "h-photo" },
    h("h2", { id: "h-photo", class: "block-title", text: t("2 · Add a photo") }), input, body,
    h("p", { class: "field-hint", text: t("Keep people’s faces and vehicle number plates out of the photo.") }),
    !form.photo ? demoChoice(useDemoPhoto) : null,
    err ? h("p", { class: "field-err", role: "alert", text: t(err) }) : null);
}

/** "Use a demo photo" in demo mode, otherwise a small link that turns demo mode on (for presenting). */
function demoChoice(use) {
  if (prefs().demo) return h("div", { class: "loc-btns demo-btns" }, h("button", { type: "button", class: "btn btn-ghost", onclick: use }, icon("camera", 18), t("Use a demo photo")));
  return h("p", { class: "field-hint demo-btns" }, h("button", { type: "button", class: "link-btn", onclick: () => { setPref("demo", true); redraw(); toast(t("Demo mode on — sample photos and location are available"), { kind: "info" }); } }, t("Presenting without a camera? Use demo photos")));
}

/** Demo mode: a real sample photo of the chosen problem type (or a random type), counted as taken now. */
let lastDemo = "";
async function useDemoPhoto() {
  const cat = form.cat ? catByKey(form.cat) : CATEGORIES[Math.floor(Math.random() * (CATEGORIES.length - 1))];
  if (!form.cat) form.cat = cat.key;
  try {
    lastDemo = demoPhotoPath(cat.key, "before", lastDemo);
    const p = await demoPhoto(lastDemo);
    form.demo = true;
    setPhoto(p.blob, `${t("Demo photo")} · ${t(cat.en)} · ${Math.round(p.blob.size / 1024)} KB`, p.takenAt);
    toast(t("Demo photo added"));
  } catch { toast(t("Could not load the demo photo"), { kind: "err" }); }
}

/** Keep the chosen photo in memory until submit. */
function setPhoto(blob, info, takenAt) {
  if (form.photoURL) URL.revokeObjectURL(form.photoURL);
  form.photo = blob; form.photoURL = URL.createObjectURL(blob); form.photoInfo = info; form.photoTakenAt = takenAt; photoErr = "";
  fresh.photo = true;
  redraw();
}

/** Ask the device for GPS; falls back to a clear message. */
function locate() {
  if (!("geolocation" in navigator)) { locErr = t("This device cannot share its location. Open the app on a phone with GPS."); redraw(); return; }
  locating = true; redraw();
  navigator.geolocation.getCurrentPosition(
    (p) => { locating = false; setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); },
    () => { locating = false; locErr = t("Location was blocked or not found. Allow location for this site in your browser settings and try again."); redraw(); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

/** Save a location after checking it is inside the pilot area. */
function setLoc(loc) {
  const err = checkLocation(loc);
  if (err) { form.loc = null; locErr = t(err); redraw(); toast(locErr, { kind: "err" }); return; }
  form.loc = { ...loc, ...placeFor(loc.lat, loc.lng) };
  locErr = "";
  fresh.loc = true;
  redraw();
  toast(t("Location captured · {zone}", { zone: placeName(form.loc) }));
}

/** An open complaint of the same type within 50 m, if any. */
function nearby() {
  if (!form.loc || !form.cat) return null;
  return store.all().find((c) => c.cat === form.cat && !["Verified", "Withdrawn"].includes(c.status) && distanceM(c.lat, c.lng, form.loc.lat, form.loc.lng) <= 50) || null;
}

/** Step 3: location. */
function locStep(err) {
  const near = nearby();
  const body = form.loc
    ? h("div", { class: "loc-ok" + (fresh.loc ? " pop" : "") }, h("div", { class: "loc-row" }, h("b", { text: t("Location captured · inside the pilot area") }),
        h("a", { class: "link", href: `https://www.openstreetmap.org/?mlat=${form.loc.lat}&mlon=${form.loc.lng}#map=18/${form.loc.lat}/${form.loc.lng}`, target: "_blank", rel: "noopener noreferrer", text: t("View on map") })),
        h("p", { text: `${form.loc.lat.toFixed(4)}, ${form.loc.lng.toFixed(4)} · ${placeName(form.loc)}${form.loc.acc ? " · " + t("accuracy {m} m", { m: form.loc.acc }) : ""}` }))
    : h("div", { class: "loc-btns" },
        h("button", { type: "button", class: "btn btn-primary", disabled: locating || null, onclick: locate }, icon("pin", 18), locating ? t("Finding you…") : t("Use my location")),
        prefs().demo ? h("button", { type: "button", class: "btn btn-ghost", onclick: () => { form.demo = true; setLoc(DEMO_POINT); }, text: t("Use demo location (Avadi)") }) : null);
  return h("section", { class: "card block" + (err ? " has-err" : ""), id: "sec-loc", "aria-labelledby": "h-loc" },
    h("h2", { id: "h-loc", class: "block-title", text: t("3 · Where is it?") }), body,
    near ? h("div", { class: "notice" }, icon("info", 18), h("p", {}, h("b", { text: t("Similar complaint nearby:") }), " ", t("{id} ({cat}) is {m} m away and already being handled. You can still submit if this is a different spot.", { id: near.id, cat: catName(near.cat), m: distanceM(near.lat, near.lng, form.loc.lat, form.loc.lng) }))) : null,
    err ? h("p", { class: "field-err", role: "alert", text: t(err) }) : null);
}

/** Step 4: area + description. */
function detailStep(errs) {
  const area = h("input", { id: "area", type: "text", maxlength: LIMITS.areaMax, autocomplete: "street-address", placeholder: t("e.g. 2nd Avenue, Anna Nagar"), value: form.area, "aria-invalid": errs.area ? "true" : "false", "aria-describedby": errs.area ? "area-err" : null });
  area.addEventListener("input", () => { form.area = area.value; updateReady(); });
  const counter = h("span", { class: "counter", "aria-live": "polite", text: `${form.note.length} / ${LIMITS.noteMax}` });
  const note = h("textarea", { id: "note", rows: 3, maxlength: LIMITS.noteMax, placeholder: t("What is wrong, and why it matters") });
  note.value = form.note;
  note.addEventListener("input", () => { form.note = note.value; counter.textContent = `${form.note.length} / ${LIMITS.noteMax}`; });
  return h("section", { class: "card block", id: "sec-details", "aria-labelledby": "h-det" },
    h("h2", { id: "h-det", class: "block-title", text: t("4 · Describe it") }),
    field({ id: "area", label: t("Area / street"), control: area, error: errs.area ? t(errs.area) : "" }),
    field({ id: "note", label: t("Description"), optional: true, control: note, counter, error: errs.note ? t(errs.note) : "" }));
}

/** Summary box with Submit. */
let readyEl = null;
function readyText() {
  const ok = (b) => (b ? "✓" : "✗");
  return `${t("Photo")} ${ok(!!form.photo)} · ${t("Location")} ${ok(!!form.loc)} · ${t("Area")} ${ok(form.area.trim().length >= 3)}`;
}
function updateReady() { if (readyEl) readyEl.textContent = readyText(); }

function submitBox() {
  readyEl = h("span", { class: "ready", text: readyText() });
  return h("section", { class: "card block submit-box" },
    h("div", { class: "row-between" }, h("h2", { class: "block-title", text: t("Ready to submit?") }), readyEl),
    h("p", { class: "muted" }, t("After you submit, it appears at the top of"), " ", h("b", { text: t("My complaints") }), t(". The officer posts updates here. When the work is done, you take a new photo at the spot to resolve it.")),
    h("button", { type: "submit", class: "btn btn-primary btn-lg btn-block" + (sending ? " is-busy" : ""), disabled: sending || null },
      sending ? h("span", { class: "spinner", "aria-hidden": "true" }) : null, sending ? t("Sending to the ward team…") : t("Submit complaint"), sending ? null : icon("arrow", 20)),
    h("div", { class: "row-between small-actions" },
      h("button", { type: "button", class: "link-btn", onclick: clearForm, text: t("Clear form") })));
}

/** Empty everything. */
function clearForm() {
  if (form.photoURL) URL.revokeObjectURL(form.photoURL);
  Object.assign(form, { cat: "", photo: null, photoURL: "", photoInfo: "", photoTakenAt: null, loc: null, area: "", note: "", demo: false });
  tried = false; photoErr = ""; locErr = "";
  redraw();
  toast(t("Form cleared"));
}

/** Validate, save, and go to My complaints. */
async function submit(e) {
  e.preventDefault();
  if (sending) return;
  tried = true;
  const errs = checkRaise({ cat: form.cat, photo: form.photo, loc: form.loc, area: form.area, note: form.note });
  if (Object.keys(errs).length) {
    redraw();
    toast(t("Please fix the fields marked in red"), { kind: "err" });
    const first = { cat: "sec-cat", photo: "sec-photo", loc: "sec-loc", area: "area", note: "note" }[Object.keys(errs)[0]];
    document.getElementById(first)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    return;
  }
  sending = true; redraw();
  const key = "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  try {
    await putPhoto(key, form.photo);
    const c = store.create({ cat: form.cat, photoRef: "idb:" + key, photoTakenAt: form.photoTakenAt, lat: form.loc.lat, lng: form.loc.lng, acc: form.loc.acc, area: form.area, note: form.note, city: form.loc.city, zone: form.loc.zone, demo: form.demo });
    toastNext(t("Complaint {id} registered — it is at the top of your list", { id: c.id }));
    setTimeout(() => { location.href = `my.html?new=${encodeURIComponent(c.id)}`; }, reducedMotion() ? 0 : 700);
  } catch (err) {
    deletePhoto(key).catch(() => {});
    sending = false; redraw();
    toast(isQuotaError(err) ? t("This phone’s storage is full. Free up space on the phone and try again.") : t("Could not save. Please try again."), { kind: "err" });
  }
}

/** Draw the page. */
function render(main) {
  const errs = errors();
  const f = h("form", { class: "raise", novalidate: true, onsubmit: submit },
    h("div", { class: "col" }, catStep(errs.cat), locStep(errs.loc), detailStep(errs)),
    h("div", { class: "col" }, photoStep(errs.photo), submitBox()));
  main.replaceChildren(h("div", { class: "wrap page" },
    pageHead(t("Raise a complaint"), t("Four quick steps. A photo and the location are required so the ward team can find it.")),
    steps(), f));
  fresh.photo = fresh.loc = false;
}

const draw = boot({ page: "raise", render, title: () => t("Raise a complaint") });
redraw = () => {
  const y = window.scrollY, active = document.activeElement && document.activeElement.id;
  draw();
  window.scrollTo(0, y);
  if (active) document.getElementById(active)?.focus({ preventScroll: true });
};
