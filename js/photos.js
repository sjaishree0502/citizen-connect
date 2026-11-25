// photos.js — check photos, read when they were taken, shrink them, and keep them in IndexedDB
// (localStorage is too small for pictures).

import { checkPhotoFile, checkPhotoSize } from "./validate.js";

const DB = "citizen-connect", STORE = "photos";
let dbPromise = null, persistAsked = false;

/** Open (or create) the photo database. */
function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** Ask the browser not to clear our data when the device runs low on space (asked once per page). */
function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

/** True when a save failed because the device is out of space. */
export const isQuotaError = (e) => !!e && (e.name === "QuotaExceededError" || e.message === "storage-full");

/** Save a Blob under a key. */
export async function putPhoto(key, blob) {
  askPersist();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve(key);
    tx.onerror = () => reject(tx.error);
  });
}

/** Read a Blob by key (null if missing). */
export async function getPhoto(key) {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

/** Delete one photo (used when saving its complaint failed, so it is not left behind). */
export async function deletePhoto(key) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Delete every stored photo (used by "Erase data on this device"). */
export async function clearPhotos() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

const urlCache = new Map();
/** Turn a stored photo reference into something an <img> can show. Paths pass through. */
export async function photoURL(ref) {
  if (!ref) return "";
  if (!ref.startsWith("idb:")) return ref;
  if (urlCache.has(ref)) return urlCache.get(ref);
  const blob = await getPhoto(ref.slice(4));
  const url = blob ? URL.createObjectURL(blob) : "";
  urlCache.set(ref, url);
  return url;
}

/** Fill an <img> from a stored reference. */
export function setImg(img, ref) {
  photoURL(ref).then((u) => { if (u) img.src = u; });
}

/**
 * Demo mode: turn a bundled sample photo into a JPEG "photo taken now", so the loop can be
 * shown without a camera. Complaints that use it are marked as demo.
 */
export async function demoPhoto(path) {
  const img = new Image();
  img.src = path;
  await img.decode();
  const scale = Math.min(1, 1200 / Math.max(img.naturalWidth || 1200, img.naturalHeight || 800));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((img.naturalWidth || 1200) * scale); canvas.height = Math.round((img.naturalHeight || 800) * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.8));
  if (!blob) throw new Error("demo-photo");
  return { blob, width: canvas.width, height: canvas.height, takenAt: Date.now() };
}

/** Decode an image file to check it is a real picture and get its size. */
function decode(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** The camera's "date taken" from a JPEG's EXIF block (ms since epoch), or null. */
export async function exifDate(file) {
  if (file.type !== "image/jpeg") return null;
  try {
    const v = new DataView(await file.slice(0, 128 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return null;
    for (let off = 2; off + 10 <= v.byteLength; off += 2 + v.getUint16(off + 2)) {
      const marker = v.getUint16(off);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return tiffDate(v, off + 10);
    }
  } catch { /* broken EXIF: fall back to the file time */ }
  return null;
}

/** Read DateTimeOriginal (or DateTime) from a TIFF block starting at `tiff`. */
function tiffDate(v, tiff) {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o) => v.getUint16(tiff + o, le), u32 = (o) => v.getUint32(tiff + o, le);
  const find = (ifd, tag) => { for (let i = 0, n = u16(ifd); i < n; i++) if (u16(ifd + 2 + i * 12) === tag) return ifd + 2 + i * 12; return -1; };
  const ifd0 = u32(4), exif = find(ifd0, 0x8769);
  let e = exif >= 0 ? find(u32(exif + 8), 0x9003) : -1;
  if (e < 0) e = find(ifd0, 0x0132);
  if (e < 0) return null;
  let s = "";
  for (let i = 0, at = u32(e + 8); i < 19; i++) s += String.fromCharCode(v.getUint8(tiff + at + i));
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null;
}

/** When the photo was taken: the earlier of the camera's EXIF date and the file's time. */
async function takenAt(file) {
  const times = [await exifDate(file), file.lastModified].filter((n) => typeof n === "number" && n > 0);
  return times.length ? Math.min(...times) : Date.now();
}

/**
 * Check, shrink (longest side 1200 px) and re-encode a photo as JPEG.
 * Re-encoding also removes hidden data such as the camera's GPS tag.
 * Returns { blob, width, height, takenAt } or { error }.
 */
export async function preparePhoto(file) {
  const fileErr = checkPhotoFile(file);
  if (fileErr) return { error: fileErr };
  const when = await takenAt(file);
  const d = await decode(file);
  if (!d) return { error: "This file is not a readable picture." };
  const sizeErr = checkPhotoSize(d.width, d.height);
  if (sizeErr) { URL.revokeObjectURL(d.url); return { error: sizeErr }; }
  const scale = Math.min(1, 1200 / Math.max(d.width, d.height));
  const w = Math.round(d.width * scale), hgt = Math.round(d.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = hgt;
  canvas.getContext("2d").drawImage(d.img, 0, 0, w, hgt);
  URL.revokeObjectURL(d.url);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.8));
  if (!blob) return { error: "This file is not a readable picture." };
  return { blob, width: w, height: hgt, takenAt: when };
}
