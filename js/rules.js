// rules.js — the one place that decides which status changes are allowed and who may make them.
// Pure functions (no DOM, no storage) so they can be tested with `node --test`.
//
// The loop: the citizen raises it → the officer starts work (promising a date), posts follow-up
// updates and says when the work is done → only the citizen resolves it, with a new photo taken
// at the spot, or reopens it with a reason.

export const STATUSES = ["Submitted", "In progress", "Fixed", "Verified", "Reopened", "Withdrawn"];

/** Allowed moves: from → to → who may do it. Anything not listed is refused. */
const MOVES = {
  Submitted: { "In progress": "officer", Withdrawn: "citizen" },
  "In progress": { Fixed: "officer", Verified: "citizen" }, // Fixed = "work done"; the citizen may resolve early
  Fixed: { Verified: "citizen", Reopened: "citizen" }, // Verified = "resolved"
  Reopened: { "In progress": "officer" },
  Verified: {},
  Withdrawn: {},
};

const isDate = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const noteOk = (v) => typeof v === "string" && v.trim().length >= 5;

/** List the statuses this actor may move a complaint to. */
export function nextStatuses(status, actor) {
  return Object.entries(MOVES[status] || {}).filter(([, who]) => who === actor).map(([to]) => to);
}

/**
 * The moment the citizen's resolution photo must be newer than: the latest of when the complaint
 * was raised, last reopened, or last marked "work done" by the officer.
 */
export function fixBaseline(complaint) {
  const marks = (complaint.history || []).filter((e) => e.status === "Reopened" || e.status === "Fixed").map((e) => Date.parse(e.at));
  return Math.max(Date.parse(complaint.createdAt), ...marks);
}

/** Check a move; returns { ok: true } or { ok: false, reason }. */
export function canMove(complaint, to, actor, extra = {}) {
  const who = (MOVES[complaint.status] || {})[to];
  if (!who) return { ok: false, reason: "not-allowed" };
  if (who !== actor) return { ok: false, reason: "wrong-person" };
  if ((to === "Withdrawn" || to === "Verified" || to === "Reopened") && !complaint.mine) return { ok: false, reason: "not-yours" };
  if (to === "In progress" && !isDate(extra.dueBy)) return { ok: false, reason: "due-date-needed" };
  if (to === "Fixed" && !noteOk(extra.officerNote)) return { ok: false, reason: "note-needed" };
  if (to === "Verified") {
    if (!extra.afterPhoto) return { ok: false, reason: "after-photo-needed" };
    if (typeof extra.afterTakenAt !== "number" || extra.afterTakenAt < fixBaseline(complaint)) return { ok: false, reason: "after-photo-too-old" };
    if (typeof extra.afterLat !== "number" || typeof extra.afterLng !== "number") return { ok: false, reason: "location-needed" };
  }
  if (to === "Reopened" && (!extra.reason || extra.reason.trim().length < 10)) return { ok: false, reason: "reason-needed" };
  return { ok: true };
}

/** Return a NEW complaint with the move applied (throws if the move is not allowed). */
export function applyMove(complaint, to, actor, extra = {}, now = new Date().toISOString()) {
  const check = canMove(complaint, to, actor, extra);
  if (!check.ok) throw new Error("Move refused: " + check.reason);
  const next = { ...complaint, status: to, updatedAt: now, history: [...(complaint.history || [])] };
  const entry = { status: to, at: now, by: actor, note: "" };
  if (to === "In progress") {
    next.dueBy = extra.dueBy;
    entry.dueBy = extra.dueBy;
  }
  if (to === "Fixed") {
    next.officerNote = extra.officerNote.trim();
    next.fixedAt = now;
    entry.note = next.officerNote;
  }
  if (to === "Verified") {
    next.afterPhoto = extra.afterPhoto;
    next.afterTakenAt = extra.afterTakenAt;
    next.afterLat = extra.afterLat;
    next.afterLng = extra.afterLng;
    next.afterAcc = typeof extra.afterAcc === "number" ? extra.afterAcc : null;
    next.resolvedAt = now;
    entry.photo = extra.afterPhoto;
  }
  if (to === "Reopened") {
    next.reopenCount = (complaint.reopenCount || 0) + 1;
    next.reText = extra.reason.trim();
    // The officer starts again with a new date and a new "work done" note; the old ones stay in the timeline.
    Object.assign(next, { officerNote: "", fixedAt: null, dueBy: null });
    entry.note = next.reText;
  }
  next.history.push(entry);
  return next;
}

/** Check an officer follow-up (a progress note, optionally with a new fix date). */
export function canUpdate(complaint, actor, { note, dueBy } = {}) {
  if (actor !== "officer") return { ok: false, reason: "wrong-person" };
  if (complaint.status !== "In progress") return { ok: false, reason: "not-allowed" };
  if (!noteOk(note)) return { ok: false, reason: "note-needed" };
  if (dueBy !== undefined && dueBy !== null && !isDate(dueBy)) return { ok: false, reason: "due-date-needed" };
  return { ok: true };
}

/** Return a NEW complaint with the follow-up added to its timeline (the status does not change). */
export function applyUpdate(complaint, actor, { note, dueBy = null } = {}, now = new Date().toISOString()) {
  const check = canUpdate(complaint, actor, { note, dueBy });
  if (!check.ok) throw new Error("Update refused: " + check.reason);
  const entry = { status: "Update", at: now, by: actor, note: note.trim() };
  const next = { ...complaint, updatedAt: now, history: [...(complaint.history || []), entry] };
  if (dueBy) next.dueBy = entry.dueBy = dueBy;
  return next;
}

/** Which tab a complaint belongs to in "My complaints". */
export function bucket(status) {
  if (status === "Fixed") return "check";
  if (status === "Verified" || status === "Withdrawn") return "closed";
  return "open";
}

/** Sort for the officer: reopened first, then new and in-progress work (oldest first), then waiting for the citizen, then closed. */
const RANK = { Reopened: 0, Submitted: 1, "In progress": 1, Fixed: 2, Verified: 3, Withdrawn: 4 };
export function officerOrder(a, b) {
  const ra = RANK[a.status] ?? 5, rb = RANK[b.status] ?? 5;
  if (ra !== rb) return ra - rb;
  return new Date(a.createdAt) - new Date(b.createdAt);
}
