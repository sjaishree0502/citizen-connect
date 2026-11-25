// i18n.js — English / Tamil. English text is the key; Tamil comes from i18n-ta.js.
// Tamil wording is a draft and must be checked by the team's Tamil teacher.

import TA from "./i18n-ta.js";
import { readJSON, writeJSON, ageParts } from "./helpers.js";
import { catByKey, ZONES } from "./data.js";

const PREFS = "cc.prefs.v1";

/** Saved preferences: language, theme, list/grid view, tour seen. */
export function prefs() {
  const p = readJSON(PREFS, {});
  return { lang: p.lang === "ta" ? "ta" : "en", theme: p.theme === "dark" || p.theme === "light" ? p.theme : null, view: p.view === "grid" ? "grid" : "list", tour: !!p.tour };
}

/** Change one preference. */
export function setPref(key, value) {
  writeJSON(PREFS, { ...prefs(), [key]: value });
}

/** Current language code. */
export const lang = () => prefs().lang;

/** Translate an English string; {name} parts are filled from vars. */
export function t(en, vars = {}) {
  let s = (lang() === "ta" && TA[en]) || en;
  for (const [k, v] of Object.entries(vars)) s = s.split("{" + k + "}").join(String(v));
  return s;
}

/** Problem type name in the current language. */
export const catName = (key) => t(catByKey(key).en);

/** Zone label such as "Anna Nagar · Zone 8". */
export function zoneName(n) {
  const z = ZONES.find((x) => x.n === n);
  return z ? t("{name} · Zone {n}", { name: t(z.en), n }) : "";
}

/** Status shown to people (the badge text). */
export function statusLabel(status, forOfficer = false) {
  const map = {
    Submitted: "New",
    "In progress": "In progress",
    Fixed: forOfficer ? "Waiting for citizen" : "Fixed — check it",
    Verified: "Verified",
    Reopened: "Reopened",
    Withdrawn: "Withdrawn",
  };
  return t(map[status] || status);
}

/** CSS class for a status badge. */
export const statusClass = (status) => "st st-" + status.toLowerCase().replace(/\s+/g, "");

/** "3 days ago" / "3 நாட்களுக்கு முன்". */
export function ago(iso) {
  const { n, unit } = ageParts(iso);
  if (unit === "now") return t("just now");
  if (unit === "hour") return n === 1 ? t("1 hour ago") : t("{n} hours ago", { n });
  return n === 1 ? t("1 day ago") : t("{n} days ago", { n });
}

/** "3 days" (age without "ago"), used in the officer table. */
export function age(iso) {
  const { n, unit } = ageParts(iso);
  if (unit === "now") return t("just now");
  if (unit === "hour") return n === 1 ? t("1 hour") : t("{n} hours", { n });
  return n === 1 ? t("1 day") : t("{n} days", { n });
}
