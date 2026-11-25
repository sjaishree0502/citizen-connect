// store.js — complaints saved in localStorage. Pages read and change complaints only through here.
// Demo mode uses its own set of sample complaints under other keys, so the user's real
// complaints are never changed or shown while it is on.

import { readJSON, writeJSON } from "./helpers.js";
import { applyMove, applyUpdate, bucket } from "./rules.js";
import { clearPhotos, deletePhotos } from "./photos.js";
import { prefs } from "./i18n.js";
import { demoComplaints, DEMO_NEXT_ID } from "./demo-data.js";
import { inCity } from "./data.js";

const REAL = { list: "cc.complaints.v2", next: "cc.nextId.v2" };
const DEMO = { list: "cc.demo.complaints.v1", next: "cc.demo.nextId.v1" };
const FIRST_ID = 1;

/** Put fresh sample complaints in the demo keys. */
function seedDemo() {
  writeJSON(DEMO.list, demoComplaints());
  writeJSON(DEMO.next, DEMO_NEXT_ID);
}

/** The storage keys in use right now (checked on every call: Demo mode can change without a reload). */
function keys() {
  if (!prefs().demo) return REAL;
  try { if (localStorage.getItem(DEMO.list) === null) seedDemo(); } catch { /* ignore */ }
  return DEMO;
}

/** One-time cleanup: v1 storage held the old demo complaints, so drop it (and its photos). */
(function dropDemoData() {
  try {
    if (localStorage.getItem("cc.complaints.v1") === null) return;
    localStorage.removeItem("cc.complaints.v1");
    localStorage.removeItem("cc.nextId.v1");
    clearPhotos().catch(() => {});
  } catch { /* ignore */ }
})();

/** Check one stored record looks like a complaint (protects against broken or edited storage). */
function looksValid(c) {
  return c && typeof c.id === "string" && /^CHN-\d{3,5}$/.test(c.id) && typeof c.status === "string" && typeof c.createdAt === "string";
}

/** The city chosen in the top bar ("chennai" or "avadi"): lists and counts show only its complaints. */
export const currentCity = () => prefs().city;

/** All complaints on this device (empty on the first visit); with { city } only that city's. */
export function all({ city = null } = {}) {
  const list = readJSON(keys().list, []);
  return Array.isArray(list) ? list.filter((c) => looksValid(c) && (!city || inCity(c, city))) : [];
}

/** Save the full list; returns false if the browser refused (storage full). */
function saveAll(list) {
  return writeJSON(keys().list, list);
}

/** One complaint by ID (case-insensitive), or null. */
export function get(id) {
  const want = String(id || "").trim().toUpperCase();
  return all().find((c) => c.id === want) || null;
}

/** Complaints raised from this browser; with { city } only that city's. */
export function mine({ city = null } = {}) {
  return all({ city }).filter((c) => c.mine);
}

/** Next free ID like CHN-001. */
function takeId() {
  const { next } = keys();
  const n = Math.max(Number(readJSON(next, FIRST_ID)) || FIRST_ID, FIRST_ID);
  writeJSON(next, n + 1);
  return "CHN-" + String(n).padStart(3, "0");
}

/** Create a new complaint from a validated form; returns the saved complaint. */
export function create({ cat, photoRef, photoTakenAt, lat, lng, acc, area, note, city, zone, demo = false }) {
  const now = new Date().toISOString();
  const c = {
    id: takeId(), cat, area: area.trim(), city, zone, lat, lng, acc: acc || null, note: (note || "").trim(), status: "Submitted", mine: true,
    beforePhoto: photoRef, beforeTakenAt: photoTakenAt || null, afterPhoto: null, officerNote: "", afterLat: null, afterLng: null,
    reopenCount: 0, reText: "", demo, createdAt: now, updatedAt: now,
    history: [{ status: "Submitted", at: now, by: "citizen", note: "" }],
  };
  const list = all();
  list.unshift(c);
  if (!saveAll(list)) throw new Error("storage-full");
  return c;
}

/** Change a complaint's status through the rules; returns the updated complaint. */
export function move(id, to, actor, extra = {}) {
  const list = all();
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) throw new Error("not-found");
  const prev = list[i];
  list[i] = applyMove(prev, to, actor, extra);
  if (!saveAll(list)) throw new Error("storage-full");
  return { updated: list[i], previous: prev };
}

/** Add an officer follow-up to a complaint's timeline; returns the updated complaint. */
export function update(id, actor, data) {
  const list = all();
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) throw new Error("not-found");
  list[i] = applyUpdate(list[i], actor, data);
  if (!saveAll(list)) throw new Error("storage-full");
  return list[i];
}

/** Put back an earlier copy of a complaint (used by Undo). */
export function restore(previous) {
  const list = all();
  const i = list.findIndex((c) => c.id === previous.id);
  if (i >= 0) { list[i] = previous; saveAll(list); }
}

/** Counts used by Home and the Officer dashboard (the chosen city's). */
export function counts(list = all({ city: currentCity() })) {
  const by = (s) => list.filter((c) => c.status === s).length;
  return {
    total: list.length,
    submitted: by("Submitted"), inprogress: by("In progress"), fixed: by("Fixed"),
    verified: by("Verified"), reopened: by("Reopened"), withdrawn: by("Withdrawn"),
  };
}

/** Counts for the citizen's tabs and the "needs your check" badge (the chosen city's). */
export function myTabs(list = mine({ city: currentCity() })) {
  return {
    all: list.length,
    check: list.filter((c) => bucket(c.status) === "check").length,
    open: list.filter((c) => bucket(c.status) === "open").length,
    closed: list.filter((c) => bucket(c.status) === "closed").length,
  };
}

/** Erase every complaint and photo on this device (the demo samples come back fresh next time). */
export async function reset() {
  try { for (const k of [REAL.list, REAL.next, DEMO.list, DEMO.next]) localStorage.removeItem(k); } catch { /* ignore */ }
  await clearPhotos().catch(() => {});
}

/** Demo mode: put the sample complaints back. Deletes only photos taken for demo complaints; real data is not touched. */
export async function resetDemo() {
  const list = readJSON(DEMO.list, []);
  const refs = (Array.isArray(list) ? list : []).flatMap((c) => [c && c.beforePhoto, c && c.afterPhoto, ...((c && c.history) || []).map((e) => e && e.photo)]);
  const ids = [...new Set(refs.filter((r) => typeof r === "string" && r.startsWith("idb:")).map((r) => r.slice(4)))];
  await deletePhotos(ids).catch(() => {});
  seedDemo();
}
