// Tests for validate.js — bad input must be rejected, good input accepted.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as v from "../js/validate.js";

test("fix date: required, not in the past, within 30 days", () => {
  const today = new Date(2026, 10, 25, 15, 0);
  assert.notEqual(v.checkDueDate("", today), "");
  assert.notEqual(v.checkDueDate("27/11/2026", today), "");
  assert.notEqual(v.checkDueDate("2026-11-24", today), "");
  assert.equal(v.checkDueDate("2026-11-25", today), "");
  assert.equal(v.checkDueDate("2026-12-25", today), "");
  assert.notEqual(v.checkDueDate("2026-12-26", today), "");
});

test("category must be one of the 14", () => { assert.equal(v.checkCategory("pothole"), ""); assert.notEqual(v.checkCategory("rocket"), ""); assert.notEqual(v.checkCategory(""), ""); });
test("photo: missing, wrong type, too big, empty", () => {
  assert.notEqual(v.checkPhotoFile(null), "");
  assert.notEqual(v.checkPhotoFile({ type: "application/pdf", size: 1000 }), "");
  assert.notEqual(v.checkPhotoFile({ type: "image/gif", size: 1000 }), "");
  assert.notEqual(v.checkPhotoFile({ type: "image/jpeg", size: 16 * 1024 * 1024 }), "");
  assert.notEqual(v.checkPhotoFile({ type: "image/jpeg", size: 0 }), "");
  assert.equal(v.checkPhotoFile({ type: "image/webp", size: 200000 }), "");
});
test("photo must be at least 200 × 200", () => { assert.notEqual(v.checkPhotoSize(199, 800), ""); assert.notEqual(v.checkPhotoSize(0, 0), ""); assert.equal(v.checkPhotoSize(200, 200), ""); });
test("location: missing, NaN, outside Chennai, inside", () => {
  assert.notEqual(v.checkLocation(null), "");
  assert.notEqual(v.checkLocation({ lat: NaN, lng: 80.2 }), "");
  assert.notEqual(v.checkLocation({ lat: 12.97, lng: 77.59 }), ""); // Bengaluru
  assert.notEqual(v.checkLocation({ lat: 9.93, lng: 78.12 }), ""); // Madurai
  assert.equal(v.checkLocation({ lat: 13.0851, lng: 80.2101 }), "");
});
test("area: too short, numbers only, too long, angle brackets, good", () => {
  assert.notEqual(v.checkArea("ab"), "");
  assert.notEqual(v.checkArea("   12345 "), "");
  assert.notEqual(v.checkArea("x".repeat(81)), "");
  assert.notEqual(v.checkArea("<script>alert(1)</script>"), "");
  assert.equal(v.checkArea("2nd Avenue, Anna Nagar"), "");
  assert.equal(v.checkArea("அண்ணா நகர்"), "");
});
test("note: max 200", () => { assert.equal(v.checkNote(""), ""); assert.notEqual(v.checkNote("x".repeat(201)), ""); });
test("reopen reason 10–200", () => { assert.notEqual(v.checkReason("short"), ""); assert.notEqual(v.checkReason("          "), ""); assert.notEqual(v.checkReason("x".repeat(201)), ""); assert.equal(v.checkReason("Only half is filled"), ""); });
test("officer note 5–200", () => { assert.notEqual(v.checkOfficerNote("ok"), ""); assert.equal(v.checkOfficerNote("Filled pothole"), ""); });
test("track ID format", () => { assert.equal(v.checkTrackId("chn-109"), ""); assert.notEqual(v.checkTrackId("109"), ""); assert.notEqual(v.checkTrackId("CHN-1"), ""); assert.notEqual(v.checkTrackId("CHN-109; drop"), ""); });
test("PIN must be 4 digits", () => { assert.equal(v.checkPin("2026"), ""); assert.notEqual(v.checkPin("20a6"), ""); assert.notEqual(v.checkPin("123"), ""); });
test("whole raise form: empty form gives every error", () => {
  const e = v.checkRaise({ cat: "", photo: null, loc: null, area: "", note: "" });
  assert.deepEqual(Object.keys(e).sort(), ["area", "cat", "loc", "photo"]);
  assert.deepEqual(v.checkRaise({ cat: "pothole", photo: {}, loc: { lat: 13.08, lng: 80.21 }, area: "Anna Nagar", note: "" }), {});
});
