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

  it("groups outstanding properties by regional manager and skips completed ones", () => {
    const drafts = buildPreDueReminders(done(all.filter(p => !["Walnut Hill", "Lexington", "Arbor Crest", "Holiday Apts"].includes(p))), "September 2026");
    const by = Object.fromEntries(drafts.filter(d => d.key === d.region).map(d => [d.regionalManager, d]));
    expect(drafts.map(d => d.key).sort()).toEqual(["Region 1", "Region 2", "Region 3", "leslie-johann"]);

    expect(by["JR Rolon"].to).toBe("jrrolon@apartmentcorp.com");
    expect(by["JR Rolon"].cc).toEqual(["leslie@apartmentcorp.com", "mam@22.bz", "Robert@ApartmentCorp.com", "Todd@menowitz.com", "Ethan@apartmentcorp.com"]);
    expect(by["JR Rolon"].body).toMatch(/^Dear JR & Leslie,/);
    expect(by["JR Rolon"].body).toContain("• Holiday Apts — Arlene Vinson (Ext. 235)");
    expect(by["JR Rolon"].body).not.toContain("Walnut Hill");

    expect(by["Ginger Positerry"].body).toMatch(/^Dear Ginger,/);
    expect(by["Ginger Positerry"].body).toContain("• Arbor Crest — Erica Finch (Ext. 261)");
    expect(by["Ginger Positerry"].body).toContain("the following inspection has not yet been marked complete");
    const region2 = drafts.find(d => d.key === "Region 2")!;
    expect(region2.body).toContain("• Lexington — Manager (Ext. 239)");
    expect(region2.cc).not.toContain("johann@apartmentcorp.com");
    const walnut = drafts.find(d => d.key === "leslie-johann")!;
    expect(walnut).toMatchObject({ to: "leslie@apartmentcorp.com", region: "Region 1" });
    expect(walnut.cc).toEqual(["johann@apartmentcorp.com", "mam@22.bz", "Robert@ApartmentCorp.com", "Todd@menowitz.com", "Ethan@apartmentcorp.com"]);
    expect(walnut.body).toMatch(/^Dear Leslie,/);
    expect(walnut.properties.map(p => p.property)).toEqual(["Walnut Hill"]);
    expect(region2.subject).toBe("Pre-Due Inspection Reminder — September 2026 — Action Needed by the 21st");
  });

  it("sends Walnut Hill, Silver Springs, Thomasville, Bayou Pointe and North Pointe to Leslie, CC Johann", () => {
    const drafts = buildPreDueReminders({}, "October 2026");
    const g = drafts.find(d => d.key === "leslie-johann")!;
    expect(g.properties.map(p => p.property).sort()).toEqual(["Bayou Pointe", "North Pointe", "Silver Springs", "Thomasville", "Walnut Hill"]);
    expect(g.region).toBe("Region 1 & Region 3");
    expect(g.body).toContain("• Bayou Pointe — Ada Vu (Ext. 298)");
    expect(g.body).toContain("• North Pointe — Johann Armstead (Ext. 297)");
    expect(g.body).toContain("• Walnut Hill — Johann Armstead (Ext. 267)");
    const ginger = drafts.find(d => d.key === "Region 3")!;
    expect(ginger.properties.map(p => p.property)).not.toContain("Bayou Pointe");
    expect(drafts.flatMap(d => d.properties).length).toBe(41);
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
