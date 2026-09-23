// Portal properties, contacts and MyLoneWorkers coverage — one source for the
// portal UI, the server and (via scraper/test/portal-properties.test.js) the
// scraper. Names match the Manus-hosted portal; regions follow the ApartmentCorp
// Property Directory (Sept 2026), plus Silver Springs and Thomasville in
// Region 1 as Brandon confirmed.

export interface Region {
  name: string;
  properties: string[];
}

export const REGIONS: Region[] = [
  { name: "Region 1", properties: ["Boca Ciega", "Coral Village", "Cumberland Apts", "Holiday Apts", "Jefferson Arms Apts", "Macedonia Garden Apts", "Opa Lock 135th St Apts", "Silver Springs", "Thomasville", "Walnut Hill"] },
  { name: "Region 2", properties: ["Breckenridge Village", "Crossroads", "Grace Townhomes", "Grove Park Terrace", "La Promesa", "Lexington", "River Pointe"] },
  { name: "Region 3", properties: ["Arbor Crest", "Bayou Pointe", "The Gates on Manhattan", "Howell Place", "Marrero 3", "North Pointe", "Pelican Bay", "Pirates Bend", "Ruby Diamond", "St. Charles", "Star Homes", "Thibodaux Colonial Estates", "Windsor / Yorkshire"] },
  { name: "Region 4", properties: ["Anaheim Apts", "Central Apts / Urban Rehab", "Columbia Village Apts", "Fairfax", "Forest View", "Granite Ridge", "Midtown Manor", "New Wilmington Arms", "Oak Hills", "Pacific Pointe Apts", "River Garden"] },
];

export const TOTAL_PROPERTIES = REGIONS.reduce((n, r) => n + r.properties.length, 0);

/** Properties with no MyLoneWorkers source; they are tracked by hand. */
export const NOT_ON_MYLONEWORKERS = ["Fairfax", "Central Apts / Urban Rehab"];

export function mappingHealth() {
  return REGIONS.flatMap(r =>
    r.properties.map(property => ({ region: r.name, property, mapped: !NOT_ON_MYLONEWORKERS.includes(property) })),
  );
}

/**
 * Earlier names used by the Vercel copy of the portal. Existing records are
 * renamed to the current names once, at server start (server/schema-setup.ts).
 */
export const LEGACY_PROPERTY_NAMES: Record<string, string> = {
  "Jefferson": "Jefferson Arms Apts",
  "Macedonia": "Macedonia Garden Apts",
  "Opa Locka": "Opa Lock 135th St Apts",
  "Breckenridge": "Breckenridge Village",
  "Cumberland": "Cumberland Apts",
  "Grove Park": "Grove Park Terrace",
  "Holiday": "Holiday Apts",
  "Gates of Manhattan": "The Gates on Manhattan",
  "Marrero": "Marrero 3",
  "Star": "Star Homes",
  "Thibodaux": "Thibodaux Colonial Estates",
  "Anaheim Gardens": "Anaheim Apts",
  "Columbia": "Columbia Village Apts",
  "Midtown": "Midtown Manor",
  "Pacific": "Pacific Pointe Apts",
  "Urban": "Central Apts / Urban Rehab",
  "Wilmington": "New Wilmington Arms",
};

export interface PropertyContact {
  property: string;
  manager: string;
  email: string;
  ext: string;
  region: string;
  regionalManager: string;
  regionalEmail: string;
}

/** Regional manager for each portal region (Region 1 reminders also go to Leslie; see REGIONAL_OVERRIDES). */
export const REGIONAL_MANAGERS: Record<string, { regionalManager: string; regionalEmail: string }> = {
  "Region 1": { regionalManager: "JR Rolon", regionalEmail: "jrrolon@apartmentcorp.com" },
  "Region 2": { regionalManager: "Leslie Rolon", regionalEmail: "leslie@apartmentcorp.com" },
  "Region 3": { regionalManager: "Ginger Positerry", regionalEmail: "ginger@apartmentcorp.com" },
  "Region 4": { regionalManager: "Blake Weddington", regionalEmail: "blake@apartmentcorp.com" },
};

const regionOfProperty = (property: string) => {
  const r = REGIONS.find(x => x.properties.includes(property));
  if (!r) throw new Error(`Contact for unknown property: ${property}`);
  return r.name;
};

// Region comes from REGIONS, so the checklist and the reminders always agree.
const c = (property: string, manager: string, email: string, ext: string): PropertyContact => {
  const region = regionOfProperty(property);
  return { property, manager, email, ext, region, ...REGIONAL_MANAGERS[region] };
};

/**
 * One row per portal property. Names, emails and extensions from Notion
 * "Company Contacts" (the property's own row, not its assistant or leasing rows). Blank manager = none listed in
 * Notion. Properties that ring New Wilmington Arms have no email of their own.
 */
export const CONTACTS: PropertyContact[] = [
  c("Arbor Crest", "Erica Finch", "arborcrest@apartmentcorp.com", "261"),
  c("Boca Ciega", "Katrina Weekly", "katrina@apartmentcorp.com", "216"),
  c("Coral Village", "Keyla Maranon", "coralvillage@apartmentcorp.com", "251"),
  c("Jefferson Arms Apts", "Brandy Amador", "jefferson@apartmentcorp.com", "236"),
  c("Macedonia Garden Apts", "Erika Scales", "macedonia@apartmentcorp.com", "222"),
  c("Opa Lock 135th St Apts", "Rosa Villarroel", "opa@apartmentcorp.com", "221"),
  c("River Pointe", "Stephanie Delong", "stephanie@apartmentcorp.com", "224"),
  c("Silver Springs", "Tarshia Pierce", "silversprings@apartmentcorp.com", "245"),
  c("Thomasville", "Adrienne McCall", "thomasville@apartmentcorp.com", "295"),
  c("Breckenridge Village", "", "lexingtonasst@apartmentcorp.com", "238"),
  c("Crossroads", "Jennifer Parks", "crossroads@apartmentcorp.com", "273"),
  c("Cumberland Apts", "Kiara Brown", "cumberland@apartmentcorp.com", "219"),
  c("Grace Townhomes", "Susan Lopez", "susan@apartmentcorp.com", "227"),
  c("Grove Park Terrace", "Nikki Moreno", "grovepark@apartmentcorp.com", "265"),
  c("Holiday Apts", "Arlene Vinson", "holiday@apartmentcorp.com", "235"),
  c("La Promesa", "Ashley Clay", "lapromesa@apartmentcorp.com", "269"),
  c("Lexington", "", "lexingtonasst@apartmentcorp.com", "239"),
  c("Walnut Hill", "Johann Armstead", "walnut@apartmentcorp.com", "267"),
  c("Bayou Pointe", "Ada Vu", "bayou@apartmentcorp.com", "298"),
  c("The Gates on Manhattan", "Lindgret Celestine", "lindgret@apartmentcorp.com", "284"),
  c("Howell Place", "Valencia Patterson", "howell@apartmentcorp.com", "259"),
  c("Marrero 3", "Ketorah Parks", "rubystarmanager@apartmentcorp.com", "283"),
  c("North Pointe", "Johann Armstead", "northpointe@apartmentcorp.com", "297"),
  c("Pelican Bay", "Dequanta Sutherland", "pelican@apartmentcorp.com", "257"),
  c("Pirates Bend", "Valencia Patterson", "pirates@apartmentcorp.com", "260"),
  c("Ruby Diamond", "Ketorah Parks", "rubystarmanager@apartmentcorp.com", "286"),
  c("St. Charles", "Deon Tolliver", "stcharles@apartmentcorp.com", "255"),
  c("Star Homes", "Ketorah Parks", "rubystarmanager@apartmentcorp.com", "286"),
  c("Thibodaux Colonial Estates", "Susie Rogers", "colonialleasing@apartmentcorp.com", "228/229"),
  c("Windsor / Yorkshire", "Kimberly Powell", "windsor@apartmentcorp.com", "291"),
  c("Anaheim Apts", "Priscilla Walters", "priscilla@apartmentcorp.com", "212"),
  c("Columbia Village Apts", "Tammy Davis", "tammy@apartmentcorp.com", "275"),
  c("Fairfax", "Shraga Kurs", "", ""),
  c("Forest View", "Tammy / Heather", "tammy@apartmentcorp.com", "277"),
  c("Granite Ridge", "James Abeyta", "james@apartmentcorp.com", "242"),
  c("Midtown Manor", "Steve Rand", "", ""),
  c("Oak Hills", "Heather Hein", "heatherh@apartmentcorp.com", "279"),
  c("Pacific Pointe Apts", "Hailey Huber", "pacificpointe@apartmentcorp.com", "243"),
  c("River Garden", "Heather Snyder", "rivergarden@apartmentcorp.com", "252"),
  c("Central Apts / Urban Rehab", "Amunique Cannon", "", ""),
  c("New Wilmington Arms", "Jose Gomez", "wilmington@apartmentcorp.com", "211"),
];

export const CONTACT_BY_PROPERTY: Record<string, PropertyContact> = Object.fromEntries(CONTACTS.map(x => [x.property, x]));

/** Always copied on the regional-manager reminders. */
export const REMINDER_CC = ["mam@22.bz", "Robert@ApartmentCorp.com", "Todd@menowitz.com", "Ethan@apartmentcorp.com"];

/** Per-region overrides for the regional-manager reminders. */
export const REGIONAL_OVERRIDES: Record<string, { regionalManager: string; greeting: string; to: string; cc: string[] }> = {
  "Region 1": { regionalManager: "JR Rolon", greeting: "JR & Leslie", to: "jrrolon@apartmentcorp.com", cc: ["leslie@apartmentcorp.com", ...REMINDER_CC] },
};

export interface ReminderDraft {
  to: string;
  cc: string[];
  regionalManager: string;
  region: string;
  /** Unique per draft (the region). */
  key: string;
  properties: PropertyContact[];
  subject: string;
  body: string;
}

/**
 * Pre-due reminders to regional managers: one per region, in region order
 * (Region 1 to JR, CC Leslie; 2 Leslie; 3 Ginger; 4 Blake), listing
 * every property not yet marked complete (checked and not ✗). Wording is the
 * Manus portal's, unchanged.
 */
export function buildPreDueReminders(
  status: Record<string, { checked?: boolean; xed?: boolean } | undefined>,
  monthLabel: string,
): ReminderDraft[] {
  const groups = new Map<string, Omit<ReminderDraft, "subject" | "body"> & { greeting: string }>();
  for (const r of REGIONS) {
    for (const property of r.properties) {
      const s = status[`${r.name}::${property}`];
      if (s?.checked === true && s?.xed !== true) continue;
      const contact = CONTACT_BY_PROPERTY[property];
      if (!contact) continue;
      const o = REGIONAL_OVERRIDES[contact.region];
      const key = contact.region;
      const g = groups.get(key) ?? {
        key,
        region: contact.region,
        regionalManager: o?.regionalManager ?? contact.regionalManager,
        to: o?.to ?? contact.regionalEmail,
        cc: o?.cc ?? [...REMINDER_CC],
        greeting: o?.greeting ?? (contact.regionalManager.trim().split(/\s+/)[0] || contact.regionalManager),
        properties: [],
      };
      g.properties.push(contact);
      groups.set(key, g);
    }
  }
  return Array.from(groups.values())
    .map(({ greeting, ...g }) => {
      const plural = g.properties.length !== 1;
      const list = g.properties.map(p => `• ${p.property} — ${p.manager || "Manager"}${p.ext ? ` (Ext. ${p.ext})` : ""}`).join("\n");
      return {
        ...g,
        subject: `Pre-Due Inspection Reminder — ${monthLabel} — Action Needed by the 21st`,
        body: `Dear ${greeting},\n\nThis is a courtesy heads-up that monthly property inspections are due on the 21st of ${monthLabel}. As of today, the following ${plural ? "inspections have" : "inspection has"} not yet been marked complete in the Monthly Inspections portal:\n\n${list}\n\nPlease follow up with the applicable property manager${plural ? "s" : ""} and ensure each inspection is completed and documented by the monthly deadline. If an inspection has already been completed, please have the manager confirm the entry is reflected in MyLoneWorkers.\n\nPLEASE CONFIRM RECEIPT OF THIS EMAIL.\n\nThank you for your attention to this.\n\nBest regards,\nBrandon Rose\nSpecial Projects\nApartmentCorp\nBrandon@ApartmentCorp.com`,
      };
    })
    // Region 1, 2, 3, 4 — the order of REGIONS.
    .sort((a, b) => REGIONS.findIndex(r => r.name === a.region) - REGIONS.findIndex(r => r.name === b.region));
}

// ── Naming conventions ───────────────────────────────────────────────────────

export interface NamingSettings {
  runTemplate: string;
  summaryPdfTemplate: string;
  comparePdfTemplate: string;
}

export const DEFAULT_NAMING: NamingSettings = {
  runTemplate: "Scraper Run — {start} to {end}",
  summaryPdfTemplate: "Inspection-Summary-{month}",
  comparePdfTemplate: "Comparison-{previous}-vs-{month}",
};

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-09" -> "September 2026" */
export function monthLabelOf(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return Number.isFinite(y) && m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : monthKey;
}

export function applyNamingTemplate(
  template: string,
  values: { month: string; previous: string; start: string; end: string; count: number },
  fallback = DEFAULT_NAMING.runTemplate,
) {
  const map: Record<string, string> = {
    "{month}": values.month,
    "{previous}": values.previous,
    "{start}": values.start,
    "{end}": values.end,
    "{count}": String(values.count),
  };
  return Object.entries(map).reduce((s, [k, v]) => s.split(k).join(v), template.trim() || fallback);
}

/** "YYYY-MM" keys from start to end inclusive; empty if end is before start. */
export function monthRange(startKey: string, endKey: string): string[] {
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  const out: string[] = [];
  for (let y = sy, m = sm; y * 12 + m <= ey * 12 + em; m === 12 ? (y++, (m = 1)) : m++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (out.length > 120) break;
  }
  return out;
}

/** A naming template's result as a safe download name, ending in .pdf. */
export function pdfFileName(name: string) {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return `${clean || "Inspections"}.pdf`;
}
