// Tests for demo-data.js — the sample complaints shown in Demo mode — and for keeping them
// apart from the user's own complaints in store.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demoComplaints, DEMO_FIRST_ID, DEMO_NEXT_ID } from "../js/demo-data.js";
import { applyMove, applyUpdate, STATUSES } from "../js/rules.js";
import { PILOT_BOX, placeFor, CAT_KEYS, inCity, cityOf } from "../js/data.js";
import { checkArea, checkNote, checkReason } from "../js/validate.js";

const NOW = Date.parse("2026-11-25T10:00:00Z");
const list = demoComplaints(NOW);
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const count = (s) => list.filter((c) => c.status === s).length;
const lateDays = (c) => Math.ceil((Date.parse(c.fixedAt || c.resolvedAt) - Date.parse(c.dueBy)) / 86400000);

test("samples cover every status in the planned numbers", () => {
  for (const s of STATUSES) assert.ok(count(s) > 0, "no sample for " + s);
  assert.deepEqual([count("Submitted"), count("In progress"), count("Fixed"), count("Verified"), count("Reopened"), count("Withdrawn")], [2, 4, 2, 4, 2, 1]);
});

test("IDs are CHN-101 onwards, unique, and the next ID follows them", () => {
  const nums = list.map((c) => Number(c.id.slice(4)));
  assert.ok(list.every((c) => /^CHN-\d{3}$/.test(c.id)));
  assert.equal(new Set(nums).size, list.length);
  assert.equal(Math.min(...nums), DEMO_FIRST_ID);
  assert.equal(DEMO_NEXT_ID, Math.max(...nums) + 1);
});

test("every sample is the citizen's own, marked demo, and has valid text", () => {
  for (const c of list) {
    assert.equal(c.mine, true);
    assert.equal(c.demo, true);
    assert.ok(CAT_KEYS.includes(c.cat));
    assert.equal(checkArea(c.area), "", c.id + " area");
    assert.equal(checkNote(c.note), "", c.id + " note");
    for (const e of c.history) if (e.by === "officer" && e.status !== "In progress") assert.ok(e.note.length >= 5 && e.note.length <= 200, c.id + " officer note");
    if (c.status === "Reopened") assert.equal(checkReason(c.reText), "", c.id + " reason");
  }
});

test("places are inside the pilot area and named by placeFor()", () => {
  for (const c of list) {
    assert.ok(c.lat >= PILOT_BOX.latMin && c.lat <= PILOT_BOX.latMax && c.lng >= PILOT_BOX.lngMin && c.lng <= PILOT_BOX.lngMax, c.id);
    assert.deepEqual({ city: c.city, zone: c.zone }, placeFor(c.lat, c.lng));
  }
});

test("samples in both cities: Chennai has every status, Avadi every open and resolved one", () => {
  const statuses = (city) => new Set(list.filter((c) => inCity(c, city)).map((c) => c.status));
  assert.deepEqual([...statuses("chennai")].sort(), [...STATUSES].sort());
  for (const s of ["Submitted", "In progress", "Fixed", "Verified", "Reopened"]) assert.ok(statuses("avadi").has(s), "Avadi " + s);
});

test("city helpers: Avadi or Chennai; older complaints without a city are Chennai's", () => {
  assert.equal(cityOf({ city: "avadi" }), "avadi");
  assert.equal(cityOf({ city: "chennai" }), "chennai");
  assert.equal(cityOf({}), "chennai");
  assert.equal(inCity({ city: "avadi" }, "avadi"), true);
  assert.equal(inCity({ city: "avadi" }, "chennai"), false);
  assert.equal(inCity({ zone: 8 }, "chennai"), true);
});

test("every photo path exists on disk; resolved samples have an after photo", () => {
  for (const c of list) {
    for (const p of [c.beforePhoto, c.afterPhoto, ...c.history.map((e) => e.photo)].filter(Boolean)) assert.ok(existsSync(ROOT + p), p);
    assert.equal(!!c.afterPhoto, c.status === "Verified", c.id);
  }
});

test("dates count back from now: raised in the last 3 weeks, timeline in order, nothing in the future", () => {
  for (const c of list) {
    const times = c.history.map((e) => Date.parse(e.at));
    assert.equal(c.history[0].at, c.createdAt);
    assert.ok(NOW - Date.parse(c.createdAt) <= 21 * 86400000, c.id);
    assert.ok(times.every((t, i) => i === 0 || t > times[i - 1]), c.id + " timeline order");
    assert.ok(times.at(-1) <= NOW && c.updatedAt === c.history.at(-1).at, c.id);
  }
});

test("every sample replays cleanly through the rules from its timeline", () => {
  for (const c of list) {
    const first = c.history[0];
    const raised = { ...c };
    for (const k of ["dueBy", "fixedAt", "afterTakenAt", "afterAcc", "resolvedAt"]) delete raised[k]; // set later by the rules
    let r = { ...raised, status: "Submitted", officerNote: "", afterPhoto: null, afterLat: null, afterLng: null, reopenCount: 0, reText: "", updatedAt: first.at, history: [first] };
    for (const e of c.history.slice(1)) {
      if (e.status === "Update") { r = applyUpdate(r, e.by, { note: e.note, dueBy: e.dueBy }, e.at); continue; }
      const extra = { dueBy: e.dueBy, officerNote: e.note, reason: e.note, afterPhoto: e.photo, afterTakenAt: c.afterTakenAt, afterLat: c.afterLat, afterLng: c.afterLng, afterAcc: c.afterAcc, demo: true };
      r = applyMove(r, e.status, e.by, extra, e.at);
    }
    assert.deepEqual(r, c, c.id);
  }
});

test("in progress: one overdue, updates posted, and one with a moved date", () => {
  const prog = list.filter((c) => c.status === "In progress");
  assert.equal(prog.filter((c) => Date.parse(c.dueBy) < NOW).length, 1, "one overdue");
  assert.ok(prog.filter((c) => c.history.some((e) => e.status === "Update")).length >= 2, "two with updates");
  assert.ok(prog.some((c) => c.history.some((e) => e.status === "Update" && e.dueBy)), "one with a moved date");
});

test("resolved: some on time and some late; work-done samples wait for the citizen", () => {
  const done = list.filter((c) => c.status === "Verified");
  assert.ok(done.some((c) => lateDays(c) <= 0) && done.some((c) => lateDays(c) > 0));
  assert.ok(list.filter((c) => c.status === "Fixed").every((c) => c.officerNote && c.fixedAt));
});

test("samples are made fresh: the same now gives the same data, a later now moves every date", () => {
  assert.deepEqual(demoComplaints(NOW), list);
  const later = demoComplaints(NOW + 86400000);
  assert.equal(Date.parse(later[0].createdAt) - Date.parse(list[0].createdAt), 86400000);
});

test("samples stay consistent whatever time of day they are made", () => {
  for (const hour of [0, 0.5, 3, 7, 12, 18, 23, 23.9]) {
    const d = new Date(NOW); d.setHours(0, 0, 0, 0);
    const now = d.getTime() + hour * 3600000, l = demoComplaints(now); // the rules throw if any step is refused
    const byId = [...l].sort((a, b) => a.id.localeCompare(b.id));
    assert.ok(byId.every((c, i) => i === 0 || Date.parse(c.createdAt) > Date.parse(byId[i - 1].createdAt)), "IDs follow the order raised at " + hour);
    for (const c of l) {
      const times = c.history.map((e) => Date.parse(e.at));
      assert.ok(times.every((t, i) => i === 0 || t > times[i - 1]) && times.at(-1) <= now, c.id + " at " + hour);
    }
    const prog = l.filter((c) => c.status === "In progress");
    assert.equal(prog.filter((c) => Date.parse(c.dueBy) < now).length, 1, "one overdue at " + hour);
    const done = l.filter((c) => c.status === "Verified");
    assert.ok(done.some((c) => lateDays(c) <= 0) && done.some((c) => lateDays(c) > 0), "on time and late at " + hour);
  }
});

// store.js: Demo mode reads and writes its own keys, so the user's data is never touched;
// lists and counts follow the chosen city.
test("store keeps demo and real complaints apart, both ways, and filters by city", async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const store = await import("../js/store.js");
  const { setPref } = await import("../js/i18n.js");
  const real = { cat: "pothole", photoRef: "idb:real", lat: 13.1147, lng: 80.101, area: "Kamaraj Nagar, Avadi", city: "avadi", zone: null };

  setPref("demo", false);
  assert.equal(store.create(real).id, "CHN-001");
  const realSaved = mem.get("cc.complaints.v2");

  setPref("demo", true);
  assert.equal(store.all().length, list.length, "samples appear in demo mode");
  assert.equal(store.get("CHN-001"), null, "the real complaint is hidden");
  assert.equal(store.create({ ...real, photoRef: "idb:demo" }).id, "CHN-" + DEMO_NEXT_ID, "new demo complaints continue after the samples");
  store.move("CHN-114", "Withdrawn", "citizen");
  assert.equal(mem.get("cc.complaints.v2"), realSaved, "real data unchanged by demo mode");

  setPref("demo", false);
  assert.deepEqual(store.all().map((c) => c.id), ["CHN-001"], "only real data when demo is off");
  assert.equal(store.create(real).id, "CHN-002", "real IDs carry on as before");

  setPref("demo", true);
  assert.equal(store.get("CHN-114").status, "Withdrawn", "demo changes are kept until reset");
  await store.resetDemo();
  assert.equal(store.all().length, list.length, "reset puts the samples back");
  assert.equal(store.get("CHN-" + DEMO_NEXT_ID), null);
  assert.equal(store.get("CHN-114").status, "Submitted");
  setPref("demo", false);
  assert.deepEqual(store.all().map((c) => c.id), ["CHN-002", "CHN-001"], "reset demo data does not touch real data");

  setPref("demo", true);
  assert.deepEqual([store.all({ city: "chennai" }).length, store.all({ city: "avadi" }).length], [10, 5], "filter by city");
  assert.equal(store.currentCity(), "chennai", "Greater Chennai is chosen by default");
  assert.deepEqual(store.counts(), { total: 10, submitted: 1, inprogress: 3, fixed: 1, verified: 3, reopened: 1, withdrawn: 1 }, "counts follow the chosen city");
  setPref("city", "avadi");
  assert.deepEqual(store.counts(), { total: 5, submitted: 1, inprogress: 1, fixed: 1, verified: 1, reopened: 1, withdrawn: 0 });
  assert.deepEqual(store.myTabs(), { all: 5, check: 1, open: 3, closed: 1 });
  assert.ok(store.get("CHN-101"), "a complaint opens by ID whatever city is chosen");
  setPref("demo", false);
  assert.deepEqual(store.mine({ city: "avadi" }).map((c) => c.id), ["CHN-002", "CHN-001"]);
  assert.equal(store.mine({ city: "chennai" }).length, 0);

  await store.reset();
  assert.equal(store.all().length, 0);
  assert.equal(mem.get("cc.demo.complaints.v1"), undefined, "erase also clears the demo copy");
  delete globalThis.localStorage;
});
