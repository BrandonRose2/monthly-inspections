import { describe, expect, it } from "vitest";
import {
  applyNamingTemplate, buildPreDueReminders, CONTACT_BY_PROPERTY, CONTACTS, LEGACY_PROPERTY_NAMES, mappingHealth, monthRange,
  NOT_ON_MYLONEWORKERS, pdfFileName, REGIONS, TOTAL_PROPERTIES,
} from "@shared/properties";
import { regionMoveStatements, renameStatements } from "./schema-setup";

const all = REGIONS.flatMap(r => r.properties);

describe("shared properties", () => {
  it("has one contact per portal property", () => {
    expect(TOTAL_PROPERTIES).toBe(41);
    expect(CONTACTS.map(c => c.property).sort()).toEqual([...all].sort());
  });

  it("maps every legacy name to a current property", () => {
    for (const to of Object.values(LEGACY_PROPERTY_NAMES)) expect(all).toContain(to);
    expect(renameStatements()).toHaveLength(Object.keys(LEGACY_PROPERTY_NAMES).length);
  });

  it("lists exactly the unmapped properties", () => {
    expect(mappingHealth().filter(p => !p.mapped).map(p => p.property).sort()).toEqual([...NOT_ON_MYLONEWORKERS].sort());
  });

  it("uses the Property Directory regions for contacts too", () => {
    expect(REGIONS.map(r => [r.name, r.properties.length])).toEqual([["Region 1", 10], ["Region 2", 7], ["Region 3", 13], ["Region 4", 11]]);
    expect(CONTACT_BY_PROPERTY["Walnut Hill"]).toMatchObject({ region: "Region 1", regionalManager: "JR Rolon" });
    expect(CONTACT_BY_PROPERTY["River Pointe"]).toMatchObject({ region: "Region 2", regionalEmail: "leslie@apartmentcorp.com" });
    expect(CONTACT_BY_PROPERTY["Arbor Crest"]).toMatchObject({ region: "Region 3", regionalManager: "Ginger Positerry" });
    for (const c of CONTACTS) expect(REGIONS.find(r => r.name === c.region)!.properties).toContain(c.property);
    expect(regionMoveStatements()).toHaveLength(TOTAL_PROPERTIES);
    expect(CONTACT_BY_PROPERTY["New Wilmington Arms"]).toMatchObject({ manager: "Jose Gomez", email: "wilmington@apartmentcorp.com" });
  });
});

describe("pre-due reminders", () => {
  const done = (props: string[]) =>
    Object.fromEntries(REGIONS.flatMap(r => r.properties.filter(p => props.includes(p)).map(p => [`${r.name}::${p}`, { checked: true, xed: false }])));

  it("sends one reminder per region, in order, to the four regional managers only", () => {
    const drafts = buildPreDueReminders({}, "October 2026");
    expect(drafts.map(d => [d.region, d.regionalManager, d.to])).toEqual([
      ["Region 1", "JR Rolon", "jrrolon@apartmentcorp.com"],
      ["Region 2", "Leslie Rolon", "leslie@apartmentcorp.com"],
      ["Region 3", "Ginger Positerry", "ginger@apartmentcorp.com"],
      ["Region 4", "Blake Weddington", "blake@apartmentcorp.com"],
    ]);
    const standard = ["mam@22.bz", "Robert@ApartmentCorp.com", "Todd@menowitz.com", "Ethan@apartmentcorp.com"];
    expect(drafts[0].cc).toEqual(["leslie@apartmentcorp.com", ...standard]);
    for (const d of drafts.slice(1)) expect(d.cc).toEqual(standard);
    expect(drafts.flatMap(d => d.cc)).not.toContain("johann@apartmentcorp.com");
    expect(drafts[0].body).toMatch(/^Dear JR & Leslie,/);
    expect(drafts[1].body).toMatch(/^Dear Leslie,/);
    expect(drafts[2].body).toMatch(/^Dear Ginger,/);
    expect(drafts[3].body).toMatch(/^Dear Blake,/);
    for (const d of drafts) expect(d.properties.map(p => p.property)).toEqual(REGIONS.find(r => r.name === d.region)!.properties);
    expect(drafts[0].body).toContain("• Walnut Hill — Johann Armstead (Ext. 267)");
    expect(drafts[2].body).toContain("• Bayou Pointe — Ada Vu (Ext. 298)");
    expect(drafts[1].subject).toBe("Pre-Due Inspection Reminder — October 2026 — Action Needed by the 21st");
  });

  it("skips completed properties and regions with nothing outstanding", () => {
    const drafts = buildPreDueReminders(done(all.filter(p => !["Lexington", "Arbor Crest"].includes(p))), "September 2026");
    expect(drafts.map(d => d.region)).toEqual(["Region 2", "Region 3"]);
    expect(drafts[0].body).toContain("the following inspection has not yet been marked complete");
    expect(drafts[0].properties.map(p => p.property)).toEqual(["Lexington"]);
  });

  it("still reminds for a property marked both ✓ and ✗", () => {
    const status = { "Region 2::Crossroads": { checked: true, xed: true } };
    const drafts = buildPreDueReminders({ ...done(all.filter(p => p !== "Crossroads")), ...status }, "September 2026");
    expect(drafts.flatMap(d => d.properties.map(p => p.property))).toEqual(["Crossroads"]);
  });
});

describe("naming", () => {
  it("fills placeholders and makes safe file names", () => {
    const v = { month: "September 2026", previous: "August 2026", start: "July 2026", end: "September 2026", count: 3 };
    expect(applyNamingTemplate("Comparison-{previous}-vs-{month}", v)).toBe("Comparison-August 2026-vs-September 2026");
    expect(applyNamingTemplate("  ", v)).toBe("Scraper Run — July 2026 to September 2026");
    expect(pdfFileName('Summary: 9/2026 "final"')).toBe("Summary- 9-2026 -final-.pdf");
    expect(monthRange("2025-12", "2026-01")).toEqual(["2025-12", "2026-01"]);
  });
});
