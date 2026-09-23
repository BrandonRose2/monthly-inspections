import { describe, expect, it } from "vitest";
import {
  applyNamingTemplate, buildPreDueReminders, CONTACT_BY_PROPERTY, CONTACTS, LEGACY_PROPERTY_NAMES, mappingHealth, monthRange,
  NOT_ON_MYLONEWORKERS, pdfFileName, REGIONS, TOTAL_PROPERTIES,
} from "@shared/properties";
import { renameStatements } from "./schema-setup";

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
    expect(mappingHealth().filter(p => !p.mapped).map(p => p.property)).toEqual(NOT_ON_MYLONEWORKERS);
  });

  it("uses the Notion regional managers", () => {
    expect(CONTACT_BY_PROPERTY["Walnut Hill"]).toMatchObject({ region: "Region 5", regionalManager: "Johann Armstead" });
    expect(CONTACT_BY_PROPERTY["River Pointe"]).toMatchObject({ region: "Region 4", regionalEmail: "blake@apartmentcorp.com" });
    expect(CONTACT_BY_PROPERTY["New Wilmington Arms"]).toMatchObject({ manager: "Jose Gomez", email: "wilmington@apartmentcorp.com" });
  });
});

describe("pre-due reminders", () => {
  const done = (props: string[]) =>
    Object.fromEntries(REGIONS.flatMap(r => r.properties.filter(p => props.includes(p)).map(p => [`${r.name}::${p}`, { checked: true, xed: false }])));

  it("groups outstanding properties by regional manager and skips completed ones", () => {
    const drafts = buildPreDueReminders(done(all.filter(p => !["Walnut Hill", "Lexington", "Arbor Crest", "Holiday Apts"].includes(p))), "September 2026");
    const by = Object.fromEntries(drafts.map(d => [d.regionalManager, d]));
    expect(Object.keys(by).sort()).toEqual(["JR Rolon", "Johann Armstead", "Leslie Rolon"]);

    expect(by["JR Rolon"].to).toBe("jrrolon@apartmentcorp.com");
    expect(by["JR Rolon"].cc).toEqual(["leslie@apartmentcorp.com", "mam@22.bz", "Robert@ApartmentCorp.com", "Todd@menowitz.com", "Ethan@apartmentcorp.com"]);
    expect(by["JR Rolon"].body).toMatch(/^Dear JR & Leslie,/);
    expect(by["JR Rolon"].body).toContain("• Arbor Crest — Erica Finch (Ext. 261)\n• Holiday Apts — Arlene Vinson (Ext. 235)");

    expect(by["Johann Armstead"].body).toMatch(/^Dear Johann,/);
    expect(by["Johann Armstead"].body).toContain("the following inspection has not yet been marked complete");
    expect(by["Leslie Rolon"].body).toContain("• Lexington — Manager (Ext. 239)");
    expect(by["Leslie Rolon"].subject).toBe("Pre-Due Inspection Reminder — September 2026 — Action Needed by the 21st");
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
