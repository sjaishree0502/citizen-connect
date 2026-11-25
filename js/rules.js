// rules.js — the one place that decides which status changes are allowed and who may make them.
// Pure functions (no DOM, no storage) so they can be tested with `node --test`.

export const STATUSES = ["Submitted", "In progress", "Fixed", "Verified", "Reopened", "Withdrawn"];

/** Allowed moves: from → to → who may do it. Anything not listed is refused. */
const MOVES = {
  Submitted: { "In progress": "officer", Withdrawn: "citizen" },
  "In progress": { Fixed: "officer" },
  Fixed: { Verified: "citizen", Reopened: "citizen" },
  Reopened: { "In progress": "officer" },
  Verified: {},
  Withdrawn: {},
};

/** List the statuses this actor may move a complaint to. */
export function nextStatuses(status, actor) {
  return Object.entries(MOVES[status] || {}).filter(([, who]) => who === actor).map(([to]) => to);
}

/** The moment an after-photo must be newer than: when the complaint was raised, or last reopened. */
export function fixBaseline(complaint) {
  const reopens = (complaint.history || []).filter((e) => e.status === "Reopened");
  return new Date(reopens.length ? reopens.at(-1).at : complaint.createdAt).getTime();
}

/** Check a move; returns { ok: true } or { ok: false, reason }. */
export function canMove(complaint, to, actor, extra = {}) {
  const who = (MOVES[complaint.status] || {})[to];
  if (!who) return { ok: false, reason: "not-allowed" };
  if (who !== actor) return { ok: false, reason: "wrong-person" };
  if (to === "Withdrawn" && !complaint.mine) return { ok: false, reason: "not-yours" };
  if ((to === "Verified" || to === "Reopened") && !complaint.mine) return { ok: false, reason: "not-yours" };
  if (to === "In progress" && (typeof extra.dueBy !== "string" || Number.isNaN(Date.parse(extra.dueBy)))) return { ok: false, reason: "due-date-needed" };
  if (to === "Fixed") {
    if (!extra.afterPhoto) return { ok: false, reason: "after-photo-needed" };
    if (typeof extra.afterTakenAt !== "number" || extra.afterTakenAt < fixBaseline(complaint)) return { ok: false, reason: "after-photo-too-old" };
    if (!extra.officerNote || extra.officerNote.trim().length < 5) return { ok: false, reason: "note-needed" };
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
    next.afterPhoto = extra.afterPhoto;
    next.afterTakenAt = extra.afterTakenAt;
    next.officerNote = extra.officerNote.trim();
    next.afterLat = extra.afterLat;
    next.afterLng = extra.afterLng;
    next.afterAcc = typeof extra.afterAcc === "number" ? extra.afterAcc : null;
    next.fixedAt = now;
    entry.note = next.officerNote;
    entry.photo = extra.afterPhoto; // kept in the timeline even if the citizen reopens
  }
  if (to === "Reopened") {
    next.reopenCount = (complaint.reopenCount || 0) + 1;
    next.reText = extra.reason.trim();
    // The officer must post a NEW after-photo, note and location; the old ones stay in the timeline.
    Object.assign(next, { afterPhoto: null, afterTakenAt: null, officerNote: "", afterLat: null, afterLng: null, afterAcc: null, fixedAt: null, dueBy: null });
    entry.note = next.reText;
  }
  next.history.push(entry);
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
