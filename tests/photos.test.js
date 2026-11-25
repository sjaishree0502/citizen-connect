// Tests for the photo "date taken" reader in photos.js (used to refuse old after-photos).
import { test } from "node:test";
import assert from "node:assert/strict";
import { exifDate } from "../js/photos.js";

/** A tiny JPEG header with an EXIF DateTimeOriginal, in big- or little-endian TIFF order. */
function jpegWithDate(date, little = false) {
  const tiff = new DataView(new ArrayBuffer(8 + 18 + 18 + 20));
  const u16 = (o, v) => tiff.setUint16(o, v, little), u32 = (o, v) => tiff.setUint32(o, v, little);
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d); u16(2, 42); u32(4, 8);
  u16(8, 1); u16(10, 0x8769); u16(12, 4); u32(14, 1); u32(18, 26); u32(22, 0); // IFD0 → Exif IFD at 26
  u16(26, 1); u16(28, 0x9003); u16(30, 2); u32(32, 20); u32(36, 44); u32(40, 0); // DateTimeOriginal at 44
  [...date].forEach((ch, i) => tiff.setUint8(44 + i, ch.charCodeAt(0)));
  const app1 = new Uint8Array([0xff, 0xe1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0, ...new Uint8Array(tiff.buffer)]);
  new DataView(app1.buffer).setUint16(2, app1.length - 2);
  return new File([new Uint8Array([0xff, 0xd8]), app1, new Uint8Array([0xff, 0xda, 0, 2])], "p.jpg", { type: "image/jpeg" });
}

test("reads the camera date (big-endian)", async () => assert.equal(await exifDate(jpegWithDate("2026:11:20 09:15:30")), new Date(2026, 10, 20, 9, 15, 30).getTime()));
test("reads the camera date (little-endian)", async () => assert.equal(await exifDate(jpegWithDate("2025:01:02 23:59:00", true)), new Date(2025, 0, 2, 23, 59, 0).getTime()));
test("no EXIF, broken data or not a JPEG gives null", async () => {
  assert.equal(await exifDate(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])], "a.jpg", { type: "image/jpeg" })), null);
  assert.equal(await exifDate(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 40, 0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2])], "b.jpg", { type: "image/jpeg" })), null);
  assert.equal(await exifDate(new File([new Uint8Array([1, 2, 3])], "c.png", { type: "image/png" })), null);
});
