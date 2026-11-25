// store.js — complaints saved in localStorage. Pages read and change complaints only through here.

import { readJSON, writeJSON } from "./helpers.js";
import { applyMove, applyUpdate, bucket } from "./rules.js";
import { clearPhotos } from "./photos.js";

const KEY = "cc.complaints.v2", NEXT = "cc.nextId.v2";
const FIRST_ID = 1;

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

/** All complaints on this device (empty on the first visit). */
export function all() {
  const list = readJSON(KEY, []);
  return Array.isArray(list) ? list.filter(looksValid) : [];
}

/** Save the full list; returns false if the browser refused (storage full). */
function saveAll(list) {
  return writeJSON(KEY, list);
}

/** One complaint by ID (case-insensitive), or null. */
export function get(id) {
  const want = String(id || "").trim().toUpperCase();
  return all().find((c) => c.id === want) || null;
}

/** Complaints raised from this browser. */
export function mine() {
  return all().filter((c) => c.mine);
}

/** Next free ID like CHN-001. */
function takeId() {
  const n = Math.max(Number(readJSON(NEXT, FIRST_ID)) || FIRST_ID, FIRST_ID);
  writeJSON(NEXT, n + 1);
  return "CHN-" + String(n).padStart(3, "0");
}

/** Create a new complaint from a validated form; returns the saved complaint. */
export function create({ cat, photoRef, photoTakenAt, lat, lng, acc, area, note, city, zone }) {
  const now = new Date().toISOString();
  const c = {
    id: takeId(), cat, area: area.trim(), city, zone, lat, lng, acc: acc || null, note: (note || "").trim(), status: "Submitted", mine: true,
    beforePhoto: photoRef, beforeTakenAt: photoTakenAt || null, afterPhoto: null, officerNote: "", afterLat: null, afterLng: null,
    reopenCount: 0, reText: "", createdAt: now, updatedAt: now,
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

/** Counts used by Home, My complaints and the Officer dashboard. */
export function counts(list = all()) {
  const by = (s) => list.filter((c) => c.status === s).length;
  return {
    total: list.length,
    submitted: by("Submitted"), inprogress: by("In progress"), fixed: by("Fixed"),
    verified: by("Verified"), reopened: by("Reopened"), withdrawn: by("Withdrawn"),
  };
}

/** Counts for the citizen's tabs. */
export function myTabs(list = mine()) {
  return {
    all: list.length,
    check: list.filter((c) => bucket(c.status) === "check").length,
    open: list.filter((c) => bucket(c.status) === "open").length,
    closed: list.filter((c) => bucket(c.status) === "closed").length,
  };
}

/** Erase every complaint and photo on this device. */
export async function reset() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(NEXT); } catch { /* ignore */ }
  await clearPhotos().catch(() => {});
}
