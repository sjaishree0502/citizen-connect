// Tests for rules.js — every allowed and refused status change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canMove, applyMove, nextStatuses, bucket, officerOrder } from "../js/rules.js";

const base = (status, mine = true) => ({ id: "CHN-200", status, mine, lat: 13.08, lng: 80.21, createdAt: "2026-11-20T10:00:00Z", history: [] });
const fixExtra = { afterPhoto: "idb:x", afterTakenAt: Date.parse("2026-11-21T10:00:00Z"), officerNote: "Filled and levelled", afterLat: 13.0801, afterLng: 80.2101 };

const due = { dueBy: "2026-11-27T18:29:59.000Z" };
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
test("citizen can withdraw their own new complaint", () => assert.equal(canMove(base("Submitted"), "Withdrawn", "citizen").ok, true));
test("citizen cannot withdraw someone else's complaint", () => assert.equal(canMove(base("Submitted", false), "Withdrawn", "citizen").reason, "not-yours"));
test("cannot withdraw once work started", () => assert.equal(canMove(base("In progress"), "Withdrawn", "citizen").ok, false));
test("officer cannot mark fixed without an after-photo", () => assert.equal(canMove(base("In progress"), "Fixed", "officer", { ...fixExtra, afterPhoto: null }).reason, "after-photo-needed"));
test("officer cannot mark fixed without a note", () => assert.equal(canMove(base("In progress"), "Fixed", "officer", { ...fixExtra, officerNote: "ok" }).reason, "note-needed"));
test("officer cannot mark fixed without a location", () => assert.equal(canMove(base("In progress"), "Fixed", "officer", { ...fixExtra, afterLat: null }).reason, "location-needed"));
test("officer cannot use a photo taken before the complaint was raised", () => assert.equal(canMove(base("In progress"), "Fixed", "officer", { ...fixExtra, afterTakenAt: Date.parse("2026-11-19T10:00:00Z") }).reason, "after-photo-too-old"));
test("officer cannot mark fixed without the photo's time", () => assert.equal(canMove(base("In progress"), "Fixed", "officer", { ...fixExtra, afterTakenAt: undefined }).reason, "after-photo-too-old"));
test("after a reopen, the new after-photo must be newer than the reopen", () => {
  const c = { ...base("In progress"), history: [{ status: "Reopened", at: "2026-11-22T10:00:00Z", by: "citizen", note: "x" }] };
  assert.equal(canMove(c, "Fixed", "officer", fixExtra).reason, "after-photo-too-old");
  assert.equal(canMove(c, "Fixed", "officer", { ...fixExtra, afterTakenAt: Date.parse("2026-11-22T11:00:00Z") }).ok, true);
});
test("officer can mark fixed with proof", () => assert.equal(canMove(base("In progress"), "Fixed", "officer", fixExtra).ok, true));
test("officer can never verify (only the citizen closes)", () => assert.equal(canMove(base("Fixed"), "Verified", "officer").ok, false));
test("officer cannot skip straight from New to Fixed", () => assert.equal(canMove(base("Submitted"), "Fixed", "officer", fixExtra).reason, "not-allowed"));
test("citizen can verify their own fixed complaint", () => assert.equal(canMove(base("Fixed"), "Verified", "citizen").ok, true));
test("citizen cannot verify someone else's", () => assert.equal(canMove(base("Fixed", false), "Verified", "citizen").reason, "not-yours"));
test("reopen needs a reason of 10+ characters", () => {
  assert.equal(canMove(base("Fixed"), "Reopened", "citizen", { reason: "bad" }).reason, "reason-needed");
  assert.equal(canMove(base("Fixed"), "Reopened", "citizen", { reason: "Only half filled" }).ok, true);
});
test("verified and withdrawn are final", () => {
  for (const s of ["Verified", "Withdrawn"]) for (const to of ["Submitted", "In progress", "Fixed", "Reopened"]) for (const who of ["officer", "citizen"]) assert.equal(canMove(base(s), to, who, fixExtra).ok, false);
});
test("reopened goes back to the officer", () => assert.deepEqual(nextStatuses("Reopened", "officer"), ["In progress"]));
test("applyMove records history and does not change the original", () => {
  const c = base("In progress");
  const n = applyMove(c, "Fixed", "officer", fixExtra, "2026-11-25T10:00:00Z");
  assert.equal(c.status, "In progress");
  assert.equal(n.status, "Fixed");
  assert.equal(n.afterPhoto, "idb:x");
  assert.equal(n.history.at(-1).by, "officer");
  assert.equal(n.history.at(-1).photo, "idb:x");
});
test("reopen counts up and clears the old after-photo", () => {
  const n = applyMove({ ...base("Fixed"), afterPhoto: "x", officerNote: "Done", afterLat: 13.08, afterLng: 80.21, fixedAt: "2026-11-21T10:00:00Z", reopenCount: 1 }, "Reopened", "citizen", { reason: "Still a big hole here" });
  assert.equal(n.reopenCount, 2);
  assert.equal(n.afterPhoto, null);
  assert.equal(n.officerNote, "");
  assert.equal(n.afterLat, null);
  assert.equal(n.fixedAt, null);
  assert.equal(n.reText, "Still a big hole here");
});
test("applyMove throws on a refused move", () => assert.throws(() => applyMove(base("Verified"), "Reopened", "citizen", { reason: "xxxxxxxxxxxx" })));
test("tabs: fixed needs check, verified/withdrawn closed, others open", () => {
  assert.equal(bucket("Fixed"), "check");
  assert.equal(bucket("Verified"), "closed");
  assert.equal(bucket("Withdrawn"), "closed");
  assert.equal(bucket("Reopened"), "open");
});
test("officer order: reopened first, then oldest", () => {
  const a = { status: "Submitted", createdAt: "2026-11-01T00:00:00Z" }, b = { status: "Reopened", createdAt: "2026-11-20T00:00:00Z" }, c = { status: "Submitted", createdAt: "2026-10-01T00:00:00Z" };
  assert.deepEqual([a, b, c].sort(officerOrder), [b, c, a]);
});
