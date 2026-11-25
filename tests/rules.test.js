// Tests for rules.js — every allowed and refused status change and officer follow-up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canMove, applyMove, canUpdate, applyUpdate, nextStatuses, bucket, officerOrder, fixBaseline } from "../js/rules.js";

const base = (status, mine = true) => ({ id: "CHN-200", status, mine, lat: 13.08, lng: 80.21, createdAt: "2026-11-20T10:00:00Z", history: [] });
const due = { dueBy: "2026-11-27T18:29:59.000Z" };
const done = { officerNote: "Filled and levelled" };
const proof = { afterPhoto: "idb:x", afterTakenAt: Date.parse("2026-11-21T10:00:00Z"), afterLat: 13.0801, afterLng: 80.2101, afterAcc: 9 };
const workDoneAt = (at) => ({ ...base("Fixed"), fixedAt: at, history: [{ status: "Fixed", at, by: "officer", note: "Done" }] });

// Starting work and the fix date
test("officer can start work on a new complaint with a fix date", () => assert.equal(canMove(base("Submitted"), "In progress", "officer", due).ok, true));
test("officer cannot start work without promising a fix date", () => {
  assert.equal(canMove(base("Submitted"), "In progress", "officer").reason, "due-date-needed");
  assert.equal(canMove(base("Reopened"), "In progress", "officer", { dueBy: "soon" }).reason, "due-date-needed");
});
test("start work records the promised date; reopen clears it", () => {
  const n = applyMove(base("Submitted"), "In progress", "officer", due);
  assert.equal(n.dueBy, due.dueBy);
  assert.equal(n.history.at(-1).dueBy, due.dueBy);
  assert.equal(applyMove({ ...base("Fixed"), dueBy: due.dueBy }, "Reopened", "citizen", { reason: "Still a big hole here" }).dueBy, null);
});
test("citizen cannot start work", () => assert.equal(canMove(base("Submitted"), "In progress", "citizen", due).reason, "wrong-person"));

// Withdraw
test("citizen can withdraw their own new complaint", () => assert.equal(canMove(base("Submitted"), "Withdrawn", "citizen").ok, true));
test("citizen cannot withdraw someone else's complaint", () => assert.equal(canMove(base("Submitted", false), "Withdrawn", "citizen").reason, "not-yours"));
test("cannot withdraw once work started", () => assert.equal(canMove(base("In progress"), "Withdrawn", "citizen").ok, false));

// Officer follow-up
test("officer can post an update while work is in progress", () => assert.equal(canUpdate(base("In progress"), "officer", { note: "Crew visits Friday" }).ok, true));
test("an update needs a note of 5+ characters", () => assert.equal(canUpdate(base("In progress"), "officer", { note: "ok" }).reason, "note-needed"));
test("only the officer posts updates, only while in progress", () => {
  assert.equal(canUpdate(base("In progress"), "citizen", { note: "Crew visits Friday" }).reason, "wrong-person");
  for (const s of ["Submitted", "Fixed", "Verified", "Reopened", "Withdrawn"]) assert.equal(canUpdate(base(s), "officer", { note: "Crew visits Friday" }).reason, "not-allowed");
});
test("an update is added to the timeline and can move the fix date", () => {
  const c = { ...base("In progress"), dueBy: due.dueBy };
  const n = applyUpdate(c, "officer", { note: " Material ordered ", dueBy: "2026-11-30T18:29:59.000Z" }, "2026-11-26T10:00:00Z");
  assert.equal(n.status, "In progress");
  assert.equal(n.dueBy, "2026-11-30T18:29:59.000Z");
  assert.deepEqual(n.history.at(-1), { status: "Update", at: "2026-11-26T10:00:00Z", by: "officer", note: "Material ordered", dueBy: "2026-11-30T18:29:59.000Z" });
  assert.equal(c.history.length, 0);
  assert.equal(applyUpdate(c, "officer", { note: "Still working" }).dueBy, due.dueBy);
});
test("an update with a broken date is refused", () => assert.throws(() => applyUpdate(base("In progress"), "officer", { note: "Crew visits", dueBy: "soon" })));

// Officer says the work is done (no photo: only a note)
test("officer marks work done with a note", () => {
  assert.equal(canMove(base("In progress"), "Fixed", "officer", done).ok, true);
  const n = applyMove(base("In progress"), "Fixed", "officer", done, "2026-11-25T10:00:00Z");
  assert.equal(n.officerNote, "Filled and levelled");
  assert.equal(n.fixedAt, "2026-11-25T10:00:00Z");
  assert.equal(n.afterPhoto, undefined);
});
test("officer cannot mark work done without a note", () => assert.equal(canMove(base("In progress"), "Fixed", "officer", { officerNote: "ok" }).reason, "note-needed"));
test("officer cannot skip straight from New to work done", () => assert.equal(canMove(base("Submitted"), "Fixed", "officer", done).reason, "not-allowed"));
test("officer can never resolve a complaint", () => {
  assert.equal(canMove(base("Fixed"), "Verified", "officer", proof).reason, "wrong-person");
  assert.equal(canMove(base("In progress"), "Verified", "officer", proof).reason, "wrong-person");
});

// Only the citizen resolves, with a new photo at the spot
test("citizen resolves their own complaint with a new photo and GPS", () => assert.equal(canMove(base("Fixed"), "Verified", "citizen", proof).ok, true));
test("citizen may resolve early, while work is in progress", () => assert.equal(canMove(base("In progress"), "Verified", "citizen", proof).ok, true));
test("resolving needs a photo", () => assert.equal(canMove(base("Fixed"), "Verified", "citizen", { ...proof, afterPhoto: null }).reason, "after-photo-needed"));
test("resolving needs the photo's time", () => assert.equal(canMove(base("Fixed"), "Verified", "citizen", { ...proof, afterTakenAt: undefined }).reason, "after-photo-too-old"));
test("resolving needs a location", () => assert.equal(canMove(base("Fixed"), "Verified", "citizen", { ...proof, afterLat: null }).reason, "location-needed"));
test("a photo from before the complaint was raised is refused", () => assert.equal(canMove(base("Fixed"), "Verified", "citizen", { ...proof, afterTakenAt: Date.parse("2026-11-19T10:00:00Z") }).reason, "after-photo-too-old"));
test("the photo must be newer than the officer's 'work done'", () => {
  const c = workDoneAt("2026-11-22T10:00:00Z");
  assert.equal(canMove(c, "Verified", "citizen", proof).reason, "after-photo-too-old");
  assert.equal(canMove(c, "Verified", "citizen", { ...proof, afterTakenAt: Date.parse("2026-11-22T11:00:00Z") }).ok, true);
});
test("baseline is the latest of raised, reopened and work done", () => {
  assert.equal(fixBaseline(base("In progress")), Date.parse("2026-11-20T10:00:00Z"));
  const c = { ...base("Fixed"), history: [{ status: "Fixed", at: "2026-11-21T10:00:00Z" }, { status: "Reopened", at: "2026-11-22T10:00:00Z" }, { status: "Update", at: "2026-11-23T10:00:00Z" }] };
  assert.equal(fixBaseline(c), Date.parse("2026-11-22T10:00:00Z"));
});
test("citizen cannot resolve someone else's complaint", () => assert.equal(canMove(base("Fixed", false), "Verified", "citizen", proof).reason, "not-yours"));
test("resolving stores the photo, its place and time, and keeps it in the timeline", () => {
  const n = applyMove(base("Fixed"), "Verified", "citizen", proof, "2026-11-25T10:00:00Z");
  assert.equal(n.status, "Verified");
  assert.equal(n.afterPhoto, "idb:x");
  assert.equal(n.afterAcc, 9);
  assert.equal(n.resolvedAt, "2026-11-25T10:00:00Z");
  assert.equal(n.history.at(-1).photo, "idb:x");
  assert.equal(n.history.at(-1).by, "citizen");
});

// Reopen
test("reopen is only possible after the officer says work is done", () => {
  assert.equal(canMove(base("In progress"), "Reopened", "citizen", { reason: "Only half filled" }).reason, "not-allowed");
  assert.equal(canMove(base("Fixed"), "Reopened", "citizen", { reason: "Only half filled" }).ok, true);
});
test("reopen needs a reason of 10+ characters", () => assert.equal(canMove(base("Fixed"), "Reopened", "citizen", { reason: "bad" }).reason, "reason-needed"));
test("reopen counts up and clears the officer's work-done note", () => {
  const n = applyMove({ ...workDoneAt("2026-11-21T10:00:00Z"), officerNote: "Done", reopenCount: 1 }, "Reopened", "citizen", { reason: "Still a big hole here" });
  assert.equal(n.reopenCount, 2);
  assert.equal(n.officerNote, "");
  assert.equal(n.fixedAt, null);
  assert.equal(n.reText, "Still a big hole here");
});
test("reopened goes back to the officer", () => assert.deepEqual(nextStatuses("Reopened", "officer"), ["In progress"]));

// Final states and helpers
test("resolved and withdrawn are final", () => {
  for (const s of ["Verified", "Withdrawn"]) for (const to of ["Submitted", "In progress", "Fixed", "Reopened", "Verified"]) for (const who of ["officer", "citizen"]) assert.equal(canMove(base(s), to, who, { ...due, ...done, ...proof, reason: "xxxxxxxxxxxx" }).ok, false);
});
test("applyMove throws on a refused move and does not change the original", () => {
  const c = base("Verified");
  assert.throws(() => applyMove(c, "Reopened", "citizen", { reason: "xxxxxxxxxxxx" }));
  assert.equal(c.status, "Verified");
});
test("tabs: work done needs check, resolved/withdrawn closed, others open", () => {
  assert.equal(bucket("Fixed"), "check");
  assert.equal(bucket("Verified"), "closed");
  assert.equal(bucket("Withdrawn"), "closed");
  assert.equal(bucket("Reopened"), "open");
});
test("officer order: reopened first, then oldest", () => {
  const a = { status: "Submitted", createdAt: "2026-11-01T00:00:00Z" }, b = { status: "Reopened", createdAt: "2026-11-20T00:00:00Z" }, c = { status: "Submitted", createdAt: "2026-10-01T00:00:00Z" };
  assert.deepEqual([a, b, c].sort(officerOrder), [b, c, a]);
});
