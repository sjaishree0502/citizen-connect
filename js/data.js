// data.js — fixed lists: problem types, Chennai zones, cities, pilot area.
// The pilot runs in two corporations: Greater Chennai (15 zones) and Avadi.

/** The 14 problem types. `key` is stored; `scene` is the animated picture file. */
export const CATEGORIES = [
  { key: "pothole", en: "Pothole", scene: "pothole" },
  { key: "drainage", en: "Drainage overflow", scene: "drainage-overflow" },
  { key: "garbage", en: "Garbage on road", scene: "garbage-on-road" },
  { key: "streetlight", en: "Streetlight off", scene: "streetlight-off" },
  { key: "wire", en: "Hanging wire", scene: "hanging-wire" },
  { key: "stagnation", en: "Water stagnation", scene: "water-stagnation" },
  { key: "tree", en: "Fallen tree", scene: "fallen-tree" },
  { key: "footpath", en: "Broken footpath", scene: "broken-footpath" },
  { key: "manhole", en: "Open manhole", scene: "open-manhole" },
  { key: "animals", en: "Stray animals", scene: "stray-animals" },
  { key: "debris", en: "Construction debris", scene: "construction-debris" },
  { key: "pipe", en: "Water pipe leak", scene: "water-pipe-leak" },
  { key: "toilet", en: "Public toilet", scene: "public-toilet" },
  { key: "other", en: "Other", scene: "other" },
];
export const CAT_KEYS = CATEGORIES.map((c) => c.key);
export const catByKey = (k) => CATEGORIES.find((c) => c.key === k) || CATEGORIES[CATEGORIES.length - 1];

/** Greater Chennai's 15 zones with an approximate centre point (for naming the zone of a GPS pin). */
export const ZONES = [
  { n: 1, en: "Thiruvottiyur", lat: 13.16, lng: 80.3 },
  { n: 2, en: "Manali", lat: 13.166, lng: 80.262 },
  { n: 3, en: "Madhavaram", lat: 13.148, lng: 80.231 },
  { n: 4, en: "Tondiarpet", lat: 13.126, lng: 80.288 },
  { n: 5, en: "Royapuram", lat: 13.105, lng: 80.287 },
  { n: 6, en: "Thiru. Vi. Ka. Nagar", lat: 13.12, lng: 80.235 },
  { n: 7, en: "Ambattur", lat: 13.114, lng: 80.154 },
  { n: 8, en: "Anna Nagar", lat: 13.085, lng: 80.21 },
  { n: 9, en: "Teynampet", lat: 13.045, lng: 80.25 },
  { n: 10, en: "Kodambakkam", lat: 13.05, lng: 80.225 },
  { n: 11, en: "Valasaravakkam", lat: 13.04, lng: 80.172 },
  { n: 12, en: "Alandur", lat: 12.998, lng: 80.2 },
  { n: 13, en: "Adyar", lat: 13.006, lng: 80.257 },
  { n: 14, en: "Perungudi", lat: 12.965, lng: 80.241 },
  { n: 15, en: "Sholinganallur", lat: 12.901, lng: 80.227 },
];

/** Pilot area box (Greater Chennai and Avadi). Points outside are refused. */
export const PILOT_BOX = { latMin: 12.8, latMax: 13.25, lngMin: 80.05, lngMax: 80.35 };

/** Avadi City Corporation (approximate box: Avadi, Pattabiram, Thirumullaivoyal). Checked before the Chennai zones. */
export const AVADI_BOX = { latMin: 13.085, latMax: 13.17, lngMin: 80.05, lngMax: 80.135 };

/** Nearest zone to a point (simple, good enough for a prototype). */
export function zoneFor(lat, lng) {
  let best = ZONES[0], bestD = Infinity;
  for (const z of ZONES) {
    const d = (z.lat - lat) ** 2 + ((z.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { best = z; bestD = d; }
  }
  return best;
}

/** Which corporation (and Chennai zone) a GPS point belongs to: { city: "avadi" | "chennai", zone }. */
export function placeFor(lat, lng) {
  const a = AVADI_BOX;
  if (lat >= a.latMin && lat <= a.latMax && lng >= a.lngMin && lng <= a.lngMax) return { city: "avadi", zone: null };
  return { city: "chennai", zone: zoneFor(lat, lng).n };
}

/** City corporations in the top-bar menu. Only "live" ones can be chosen; `key` matches a complaint's `city`. */
export const CITIES = [
  { key: "chennai", en: "Greater Chennai", state: "live" },
  { key: "avadi", en: "Avadi", state: "live" },
  { key: "tambaram", en: "Tambaram", state: "next" },
  { key: "madurai", en: "Madurai", state: "planned" },
  { key: "coimbatore", en: "Coimbatore", state: "planned" },
];
export const cityByKey = (k) => CITIES.find((c) => c.key === k && c.state === "live") || CITIES[0];

/** Which city a complaint belongs to (older complaints have no city: they are Chennai's). */
export const cityOf = (c) => (c && c.city === "avadi" ? "avadi" : "chennai");

/** Is this complaint in that city? */
export const inCity = (c, city) => cityOf(c) === city;

/**
 * Demo mode: real-world sample photos in img/demo (credits in img/demo/CREDITS.md), as
 * "<type>-before-<n>.jpg" (the problem) and "<type>-after-<n>.jpg" (fixed). Numbers = how many of each.
 */
const DEMO_PHOTOS = {
  pothole: [2, 2], drainage: [1, 2], garbage: [2, 1], streetlight: [1, 2], wire: [1, 1], stagnation: [2, 2], tree: [2, 2],
  footpath: [2, 2], manhole: [1, 2], animals: [2, 2], debris: [2, 2], pipe: [2, 2], toilet: [2, 1], other: [1, 2],
};

/** A random demo photo path for a problem type ("before" = the problem, "after" = fixed), different from `not` when possible. */
export function demoPhotoPath(cat, kind, not = "") {
  const [before, after] = DEMO_PHOTOS[cat] || DEMO_PHOTOS.other;
  const n = kind === "before" ? before : after;
  const paths = Array.from({ length: n }, (_, i) => `img/demo/${DEMO_PHOTOS[cat] ? cat : "other"}-${kind}-${i + 1}.jpg`);
  const pool = paths.length > 1 ? paths.filter((p) => p !== not) : paths;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Demo mode: a ready-made location (Avadi) for presenting indoors, where GPS often fails. */
export const DEMO_POINT = { lat: 13.1147, lng: 80.101, acc: 10 };

/** Worst GPS accuracy (metres) accepted for the citizen's resolution photo location. */
export const MAX_FIX_ACCURACY = 150;
