// demo-data.js — the sample complaints shown in Demo mode (kept apart from the user's own data).
// Real places in Greater Chennai and Avadi with real-world photos from img/demo. Dates are counted
// back from "now" when the samples are made, so they always look fresh. Every status change is
// replayed through rules.js, so each sample follows the same rules as a real complaint.
// Pure (no DOM, no storage), so it can be tested with `node --test`.

import { applyMove, applyUpdate } from "./rules.js";
import { placeFor } from "./data.js";

const D = 86400000, H = 3600000;
const pic = (cat, kind, n = 1) => `img/demo/${cat}-${kind}-${n}.jpg`;

/** End of the day `days` from now (negative = in the past), like the officer's fix-date picker. */
function endOfDay(now, days) {
  const d = new Date(now + days * D);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

/**
 * The samples, oldest first, in both cities. `at` = when: [days ago, "HH:MM" that day] or, for the
 * newest, ms ago. `n` = which "before" photo of that type (default 1).
 * Steps: `to` = a status change, `update` = an officer follow-up; `due` = fix date in days from now;
 * `note` = officer note or reopen reason.
 */
const SAMPLES = [
  { cat: "pothole", area: "2nd Avenue, Anna Nagar", lat: 13.0857, lng: 80.2103, acc: 8, at: [20, "09:15"],
    note: "Deep pothole near the bus stop. Two-wheelers swerve into traffic to avoid it.",
    steps: [
      { at: [19, "11:30"], to: "In progress", due: -15 },
      { at: [18, "16:00"], update: "Contractor assigned. Work in two days, early morning." },
      { at: [16, "10:45"], to: "Fixed", note: "Pothole filled with hot mix and rolled." },
      { at: [15, "08:10"], to: "Verified", photo: pic("pothole", "after") },
    ] },
  { cat: "garbage", area: "Pondy Bazaar, T. Nagar", lat: 13.0418, lng: 80.2341, acc: 12, at: [16, "09:40"],
    note: "Garbage piled up behind the bus shelter for a week. Very bad smell.",
    steps: [
      { at: [15, "11:00"], to: "In progress", due: -13 },
      { at: [13, "12:30"], update: "Compactor lorry under repair. Extra vehicle requested from the zone office." },
      { at: [11, "17:45"], to: "Fixed", note: "Garbage cleared and the area sprayed. A new bin is placed behind the shelter." },
      { at: [10, "08:30"], to: "Verified", photo: pic("garbage", "after") },
    ] },
  { cat: "pothole", n: 2, area: "New Military Road, Avadi", lat: 13.1205, lng: 80.109, acc: 9, at: [14, "08:00"],
    note: "Two big potholes in front of the school gate. Water fills them after rain.",
    steps: [
      { at: [13, "10:00"], to: "In progress", due: -11 },
      { at: [12, "15:00"], update: "Patch work material has arrived. Work tomorrow morning before school time." },
      { at: [11, "09:20"], to: "Fixed", note: "Both potholes cut, filled with hot mix and rolled." },
      { at: [11, "18:15"], to: "Verified", photo: pic("pothole", "after", 2) },
    ] },
  { cat: "streetlight", area: "Kodambakkam High Road, Nungambakkam", lat: 13.056, lng: 80.242, acc: 10, at: [13, "20:10"],
    note: "Three streetlights off near the signal. Very dark after 7 pm.",
    steps: [
      { at: [12, "10:20"], to: "In progress", due: -10 },
      { at: [11, "15:00"], update: "Faulty underground cable found. The electrical team works on it tonight." },
      { at: [10, "07:30"], to: "Fixed", note: "Cable replaced overnight. All three lights are working." },
      { at: [9, "19:40"], to: "Verified", photo: pic("streetlight", "after") },
    ] },
  { cat: "pipe", area: "Kamaraj Nagar, Avadi", lat: 13.116, lng: 80.099, acc: 9, at: [11, "07:50"],
    note: "Drinking water pipe leaking at the junction. Water runs on the road all day.",
    steps: [
      { at: [10, "10:00"], to: "In progress", due: -7 },
      { at: [9, "16:15"], update: "Plumbing team checked it. The joint has to be replaced." },
      { at: [6, "14:00"], to: "Fixed", note: "Leaking joint replaced and the pit closed." },
      { at: [5, "08:20"], to: "Reopened", note: "Still leaking. Water is coming out next to the new joint again this morning." },
    ] },
  { cat: "drainage", area: "LB Road, Adyar", lat: 13.001, lng: 80.2566, acc: 11, at: [9, "08:30"],
    note: "Drain overflowing onto the road near the signal. Sewage smell all day.",
    steps: [
      { at: [8, "11:15"], to: "In progress", due: -5 },
      { at: [7, "17:00"], update: "Jetting machine cleared the first stretch. The block is under the road." },
      { at: [4, "12:00"], update: "Road must be cut to replace the broken pipe. Traffic police permission taken, so the date is moved.", due: 2 },
      { at: [1, "18:30"], update: "Road cut done and the new pipe laid. Relaying the road next." },
    ] },
  { cat: "toilet", area: "Marina Beach, near the Gandhi statue", lat: 13.0499, lng: 80.2824, acc: 10, at: [8, "07:30"],
    note: "Public toilet locked since Sunday and there is no water. Walkers have nowhere to go.",
    steps: [
      { at: [7, "12:00"], to: "In progress", due: -5 },
      { at: [5, "17:30"], to: "Fixed", note: "Water connection restored and the toilet cleaned. Open from 5 am." },
      { at: [3, "09:00"], to: "Reopened", note: "The toilet is open now, but there is still no water in the taps." },
    ] },
  { cat: "stagnation", area: "Velachery Main Road, Vijayanagar", lat: 12.9785, lng: 80.219, acc: 14, at: [7, "07:45"],
    note: "Rain water standing for four days near the bus stand. Mosquitoes breeding.",
    steps: [
      { at: [6, "10:30"], to: "In progress", due: -2 },
      { at: [4, "19:00"], update: "Motor pump arranged. Pumping out tonight." },
    ] },
  { cat: "footpath", area: "North Mada Street, Mylapore (near Kapaleeshwarar Temple)", lat: 13.0336, lng: 80.2697, acc: 7, at: [6, "06:50"],
    note: "Footpath slabs broken near the temple tank. Elderly people are tripping.",
    steps: [
      { at: [5, "11:00"], to: "In progress", due: 0 },
      { at: [4, "15:30"], update: "New slabs ordered. Work starts the day after tomorrow." },
      { at: [1, "16:00"], to: "Fixed", note: "Broken slabs replaced and the edge cemented." },
    ] },
  { cat: "garbage", n: 2, area: "Near Avadi bus terminus", lat: 13.1128, lng: 80.0968, acc: 11, at: [5, "09:30"],
    note: "Overflowing garbage bins near the bus terminus. Dogs are spreading it on the road.",
    steps: [
      { at: [4, "11:00"], to: "In progress", due: 1 },
      { at: [2, "10:00"], update: "Extra bins placed. The garbage lorry will now come here every morning." },
    ] },
  { cat: "tree", area: "Pattabiram, near the railway station", lat: 13.123, lng: 80.06, acc: 10, at: [4, "06:10"],
    note: "A big branch fell in the night rain and is blocking half the road.",
    steps: [
      { at: [4, "08:30"], to: "In progress", due: -2 },
      { at: [3, "13:00"], to: "Fixed", note: "Branch cut and removed by the tree team. The road is clear." },
    ] },
  { cat: "manhole", area: "Thiruvottiyur High Road, near Theradi", lat: 13.159, lng: 80.3003, acc: 12, at: [3, "21:30"],
    note: "Manhole cover missing in the middle of the road. Dangerous at night.",
    steps: [
      { at: [2, "09:00"], to: "In progress", due: 2 },
      { at: [2, "13:30"], update: "Barricade placed around the manhole for safety." },
      { at: [1, "17:00"], update: "New cover ordered. Fitting tomorrow morning." },
    ] },
  { cat: "debris", area: "OMR, Thoraipakkam", lat: 12.939, lng: 80.234, acc: 13, at: [2, "09:10"],
    note: "Construction waste dumped on the footpath next to the bus stop.",
    steps: [{ at: [2, "18:40"], to: "Withdrawn" }] },
  { cat: "animals", area: "CTH Road, Thirumullaivoyal", lat: 13.131, lng: 80.131, acc: 9, at: [1, "19:20"],
    note: "Stray cattle sit on the road near the market every evening.", steps: [] },
  { cat: "wire", area: "Arcot Road, Vadapalani", lat: 13.051, lng: 80.212, acc: 8, at: 3 * H + 40 * 60000,
    note: "Cable wires hanging low across the road near the metro station.", steps: [] },
];

/** First sample ID number (CHN-101); new complaints raised in Demo mode continue after the samples. */
export const DEMO_FIRST_ID = 101;
export const DEMO_NEXT_ID = DEMO_FIRST_ID + SAMPLES.length;

/** A sample time in ms: [days ago, "HH:MM"] (a sensible time of day) or ms before now. */
function when(now, at) {
  if (!Array.isArray(at)) return now - at;
  const d = new Date(now - at[0] * D), [hh, mm] = at[1].split(":").map(Number);
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

/** Build one sample: a new complaint, then each step through the rules at its own time. */
function build(s, n, now) {
  const iso = (at) => new Date(when(now, at)).toISOString();
  const createdAt = iso(s.at);
  let c = {
    id: "CHN-" + n, cat: s.cat, area: s.area, ...placeFor(s.lat, s.lng), lat: s.lat, lng: s.lng, acc: s.acc, note: s.note, status: "Submitted", mine: true,
    beforePhoto: pic(s.cat, "before", s.n), beforeTakenAt: when(now, s.at) - 6 * 60000, afterPhoto: null, officerNote: "", afterLat: null, afterLng: null,
    reopenCount: 0, reText: "", demo: true, createdAt, updatedAt: createdAt,
    history: [{ status: "Submitted", at: createdAt, by: "citizen", note: "" }],
  };
  for (const st of s.steps) {
    const at = iso(st.at), dueBy = st.due === undefined ? undefined : endOfDay(now, st.due);
    if (st.update) { c = applyUpdate(c, "officer", { note: st.update, dueBy }, at); continue; }
    const extra = {
      "In progress": { dueBy },
      Fixed: { officerNote: st.note },
      Reopened: { reason: st.note },
      Verified: { afterPhoto: st.photo, afterTakenAt: when(now, st.at) - 8 * 60000, afterLat: s.lat + 0.00006, afterLng: s.lng + 0.00004, afterAcc: 8, demo: true },
      Withdrawn: {},
    }[st.to];
    c = applyMove(c, st.to, st.to === "In progress" || st.to === "Fixed" ? "officer" : "citizen", extra, at);
  }
  return c;
}

/** The sample complaints, newest first (the order the store keeps). */
export function demoComplaints(now = Date.now()) {
  return SAMPLES.map((s, i) => build(s, DEMO_FIRST_ID + i, now)).reverse();
}
