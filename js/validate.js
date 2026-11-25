// validate.js — every input check in one place. Pure functions: each returns "" when valid,
// or an English error message (translated by i18n when shown).

import { CAT_KEYS, PILOT_BOX } from "./data.js";

export const LIMITS = {
  photoTypes: ["image/jpeg", "image/png", "image/webp"],
  photoMaxBytes: 15 * 1024 * 1024,
  photoMinSide: 200,
  areaMin: 3,
  areaMax: 80,
  noteMax: 200,
  reasonMin: 10,
  reasonMax: 200,
  officerNoteMin: 5,
  officerNoteMax: 200,
  dueMaxDays: 30,
};

/** Problem type must be one of the 14 keys. */
export function checkCategory(key) {
  return CAT_KEYS.includes(key) ? "" : "Choose the type of problem.";
}

/** Photo file facts {type, size} before decoding. */
export function checkPhotoFile(file) {
  if (!file) return "A photo is required — it is the “before” proof.";
  if (!LIMITS.photoTypes.includes(file.type)) return "Only JPG, PNG or WebP photos are allowed.";
  if (file.size > LIMITS.photoMaxBytes) return "The photo is larger than 15 MB.";
  if (file.size === 0) return "This file is empty.";
  return "";
}

/** Photo size after decoding {width, height}. */
export function checkPhotoSize(width, height) {
  if (!width || !height) return "This file is not a readable picture.";
  if (Math.min(width, height) < LIMITS.photoMinSide) return "The photo must be at least 200 × 200 pixels.";
  return "";
}

/** GPS point must exist and be inside the pilot area. */
export function checkLocation(loc) {
  if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number" || Number.isNaN(loc.lat) || Number.isNaN(loc.lng)) {
    return "Add the location so the ward team can find it.";
  }
  const b = PILOT_BOX;
  if (loc.lat < b.latMin || loc.lat > b.latMax || loc.lng < b.lngMin || loc.lng > b.lngMax) {
    return "This place is outside the pilot area (Greater Chennai and Avadi).";
  }
  return "";
}

/** Area / street text. */
export function checkArea(text) {
  const t = (text || "").trim();
  if (t.length < LIMITS.areaMin || t.length > LIMITS.areaMax || !/\p{L}/u.test(t)) {
    return "Enter the area or street: 3–80 characters with letters, not only numbers.";
  }
  if (/[<>]/.test(t)) return "Please remove the < and > characters.";
  return "";
}

/** Optional description. */
export function checkNote(text) {
  return (text || "").length > LIMITS.noteMax ? "Keep the description under 200 characters." : "";
}

/** Reopen reason. */
export function checkReason(text) {
  const t = (text || "").trim();
  if (t.length < LIMITS.reasonMin) return "Please say what is still wrong (10+ characters), so the officer knows what to fix.";
  if (t.length > LIMITS.reasonMax) return "Keep the reason under 200 characters.";
  return "";
}

/** Officer's note when marking fixed. */
export function checkOfficerNote(text) {
  const t = (text || "").trim();
  if (t.length < LIMITS.officerNoteMin) return "Write what was done (at least 5 characters).";
  if (t.length > LIMITS.officerNoteMax) return "Keep the note under 200 characters.";
  return "";
}

/** Officer's promised fix date ("YYYY-MM-DD" from a date input): today up to 30 days ahead. */
export function checkDueDate(value, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!m) return "Choose the date the fix will be done by.";
  const day = new Date(+m[1], m[2] - 1, +m[3]);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (day < start) return "The date cannot be in the past.";
  if (day - start > LIMITS.dueMaxDays * 86400000) return "Choose a date within 30 days.";
  return "";
}

/** Complaint ID typed into "Track". */
export function checkTrackId(text) {
  return /^CHN-\d{3,5}$/.test((text || "").trim().toUpperCase()) ? "" : "Use the format CHN-001";
}

/** Officer PIN (4 digits). */
export function checkPin(text) {
  return /^\d{4}$/.test((text || "").trim()) ? "" : "Enter the 4-digit PIN.";
}

/** Check the whole Raise form; returns an object of field → message (empty object = valid). */
export function checkRaise({ cat, photo, loc, area, note }) {
  const errs = {};
  const c = checkCategory(cat); if (c) errs.cat = c;
  if (!photo) errs.photo = "A photo is required — it is the “before” proof.";
  const l = checkLocation(loc); if (l) errs.loc = l;
  const a = checkArea(area); if (a) errs.area = a;
  const n = checkNote(note); if (n) errs.note = n;
  return errs;
}
