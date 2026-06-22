import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import { Printer, RotateCcw, Mail, X as XIcon, Copy, Check, FileText, Upload, Eye, Trash2, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PropertyContact {
  property: string;
  manager: string;
  email: string;
  ext: string;
  region: string;
  regionalManager: string;
  regionalEmail: string;
}

interface PDFAttachment {
  name: string;
  dataUrl: string;
  size: number;
  uploadedAt: string;
}

interface PropertyStatus {
  checked: boolean;
  xed: boolean;
  pdf?: PDFAttachment | null;
  note?: string;
}

type InspectionState = Record<string, PropertyStatus>;

// Key: "YYYY-MM" → InspectionState
type AllMonthsData = Record<string, InspectionState>;

// ─── Contact Data ─────────────────────────────────────────────────────────────

const CONTACTS: PropertyContact[] = [
  { property: "Arbor Crest",         manager: "Erica Finch",           email: "arborcrest@apartmentcorp.com",     ext: "261", region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Boca Ciega",          manager: "Katrina Weekly",         email: "katrina@apartmentcorp.com",        ext: "216", region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Coral Village",       manager: "Keyla Maranon",          email: "coralvillage@apartmentcorp.com",   ext: "251", region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Jefferson",           manager: "Brandy Amador",          email: "jefferson@apartmentcorp.com",      ext: "236", region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Macedonia",           manager: "Erika Scales",           email: "macedonia@apartmentcorp.com",      ext: "222", region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Opa Locka",           manager: "Rosa Villarroel",        email: "opa@apartmentcorp.com",            ext: "221", region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "River Pointe",        manager: "Stephanie Delong",       email: "stephanie@apartmentcorp.com",      ext: "224", region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Silver Springs",      manager: "Tarshia Pierce",         email: "silversprings@apartmentcorp.com",  ext: "245", region: "Region 1", regionalManager: "Leslie Rolon",      regionalEmail: "leslie@apartmentcorp.com" },
  { property: "Thomasville",         manager: "Ebony Nelson",           email: "thomasville@apartmentcorp.com",    ext: "295", region: "Region 1", regionalManager: "Leslie Rolon",      regionalEmail: "leslie@apartmentcorp.com" },
  { property: "Breckenridge",        manager: "(No manager listed)",    email: "lexingtonasst@apartmentcorp.com",  ext: "",    region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Crossroads",          manager: "Jennifer Parks",         email: "crossroads@apartmentcorp.com",     ext: "273", region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Cumberland",          manager: "Kiara Brown",            email: "cumberland@apartmentcorp.com",     ext: "219", region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Grace Townhomes",     manager: "Susan Lopez",            email: "susan@apartmentcorp.com",          ext: "227", region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Grove Park",          manager: "Nikki Moreno",           email: "grovepark@apartmentcorp.com",      ext: "265", region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Holiday",             manager: "Arlene Vinson",          email: "holiday@apartmentcorp.com",        ext: "235", region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "La Promesa",          manager: "Ashley Clay",            email: "lapromesa@apartmentcorp.com",      ext: "269", region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Lexington",           manager: "(No manager listed)",    email: "lexingtonasst@apartmentcorp.com",  ext: "",    region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Walnut Hill",         manager: "Johann Armstead",        email: "walnut@apartmentcorp.com",         ext: "267", region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Bayou Pointe",        manager: "Jennifer Frederick",     email: "bayou@apartmentcorp.com",          ext: "298", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Gates of Manhattan",  manager: "Lindgret Celestine",     email: "lindgret@apartmentcorp.com",       ext: "284", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Howell Place",        manager: "Sandra Crump",           email: "howell@apartmentcorp.com",         ext: "259", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Marrero",             manager: "Ketorah Parks",          email: "rubystarmanager@apartmentcorp.com",ext: "283", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "North Pointe",        manager: "Jennifer Frederick",     email: "northpointe@apartmentcorp.com",    ext: "297", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Pelican Bay",         manager: "Dequanta Sutherland",    email: "pelican@apartmentcorp.com",        ext: "257", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Pirates Bend",        manager: "Sandra Crump",           email: "pirates@apartmentcorp.com",        ext: "260", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Ruby Diamond",        manager: "Ketorah Parks",          email: "rubystarmanager@apartmentcorp.com",ext: "283", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "St. Charles",         manager: "Deon Tolliver",          email: "stcharles@apartmentcorp.com",      ext: "255", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Star",                manager: "Ketorah Parks",          email: "rubystarmanager@apartmentcorp.com",ext: "283", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Thibodaux",           manager: "Susie Rogers",           email: "colonialleasing@apartmentcorp.com",ext: "228", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Windsor / Yorkshire", manager: "Kimberly Powell",        email: "windsor@apartmentcorp.com",        ext: "291", region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Anaheim Gardens",     manager: "Priscilla Walters",      email: "priscilla@apartmentcorp.com",      ext: "212", region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Columbia",            manager: "Tammy Davis",            email: "tammy@apartmentcorp.com",          ext: "275", region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Fairfax",             manager: "Shraga Kurs",            email: "alberto@apartmentcorp.com",        ext: "",    region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Forest View",         manager: "Tammy / Heather",        email: "tammy@apartmentcorp.com",          ext: "277", region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Granite Ridge",       manager: "James Abeyta",           email: "james@apartmentcorp.com",          ext: "242", region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Midtown",             manager: "Steve Rand",             email: "alberto@apartmentcorp.com",        ext: "",    region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Oak Hills",           manager: "Heather Hein",           email: "heatherh@apartmentcorp.com",       ext: "279", region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Pacific",             manager: "Hailey Huber",           email: "pacificpointe@apartmentcorp.com",  ext: "243", region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "River Garden",        manager: "Heather Snyder",         email: "rivergarden@apartmentcorp.com",    ext: "252", region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Urban",               manager: "Amunique Cannon",        email: "alberto@apartmentcorp.com",        ext: "",    region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Wilmington",          manager: "Alberto Spence",         email: "alberto@apartmentcorp.com",        ext: "211", region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
];

const contactMap = Object.fromEntries(CONTACTS.map((c) => [c.property, c]));

const REGIONS: { name: string; properties: string[] }[] = [
  { name: "Region 1", properties: ["Arbor Crest","Boca Ciega","Coral Village","Jefferson","Macedonia","Opa Locka","River Pointe","Silver Springs","Thomasville"] },
  { name: "Region 2", properties: ["Breckenridge","Crossroads","Cumberland","Grace Townhomes","Grove Park","Holiday","La Promesa","Lexington","Walnut Hill"] },
  { name: "Region 3", properties: ["Bayou Pointe","Gates of Manhattan","Howell Place","Marrero","North Pointe","Pelican Bay","Pirates Bend","Ruby Diamond","St. Charles","Star","Thibodaux","Windsor / Yorkshire"] },
  { name: "Region 4", properties: ["Anaheim Gardens","Columbia","Fairfax","Forest View","Granite Ridge","Midtown","Oak Hills","Pacific","River Garden","Urban","Wilmington"] },
];

const TOTAL = REGIONS.reduce((acc, r) => acc + r.properties.length, 0);
const STORAGE_KEY = "monthly_inspections_all_v1";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function buildKey(region: string, property: string) { return `${region}::${property}`; }
function monthKey(year: number, month: number) { return `${year}-${String(month + 1).padStart(2, "0")}`; }

function loadAllData(): AllMonthsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveAllData(data: AllMonthsData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function playClick() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
    const filter = ctx.createBiquadFilter(); filter.type = "highpass"; filter.frequency.value = 1000;
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start(now); src.stop(now + 0.02);
  } catch {}
}

function buildEmailDrafts(xedProperties: string[], monthLabel: string) {
  const grouped: Record<string, { contact: PropertyContact; properties: string[] }> = {};
  for (const prop of xedProperties) {
    const c = contactMap[prop];
    if (!c) continue;
    if (!grouped[c.email]) grouped[c.email] = { contact: c, properties: [] };
    grouped[c.email].properties.push(prop);
  }
  return Object.values(grouped).map(({ contact, properties }) => {
    const propList = properties.map((p) => `  • ${p}`).join("\n");
    const plural = properties.length > 1;
    const subject = `Monthly Inspection Reminder — ${properties.join(", ")} — ${monthLabel}`;
    const body = `Dear ${contact.manager},\n\nI hope this message finds you well. I am following up regarding the monthly property inspection${plural ? "s" : ""} that ${plural ? "were" : "was"} due on the 21st of ${monthLabel} for the following ${plural ? "properties" : "property"}:\n\n${propList}\n\nAs of today, our records indicate that the inspection${plural ? "s have" : " has"} not been completed. Please ensure the inspection${plural ? "s are" : " is"} conducted and documented as soon as possible, and confirm completion by replying to this email.\n\nIf there are any circumstances preventing the inspection from being completed on schedule, please reach out so we can assist.\n\nThank you for your attention to this matter.\n\nBest regards,\nBrandon Rose\nSpecial Projects\nApartmentCorp\nBrandon@ApartmentCorp.com`;
    return { to: contact.email, subject, body, managerName: contact.manager, property: properties.join(", ") };
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const now = new Date();
  const [selectedYear, setSelectedYear]   = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [allData, setAllData]             = useState<AllMonthsData>(loadAllData);
  const [showEmailModal, setShowEmailModal]     = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [copiedIdx, setCopiedIdx]         = useState<number | null>(null);

  const mk = monthKey(selectedYear, selectedMonth);
  const monthLabel = `${MONTHS[selectedMonth]} ${selectedYear}`;
  const state: InspectionState = allData[mk] || {};

  useEffect(() => { saveAllData(allData); }, [allData]);

  const setState = useCallback((updater: (prev: InspectionState) => InspectionState) => {
    setAllData((prev) => ({ ...prev, [mk]: updater(prev[mk] || {}) }));
  }, [mk]);

  const toggleStatus = useCallback((key: string, type: "checked" | "xed") => {
    playClick();
    setState((prev) => {
      const cur = prev[key] || { checked: false, xed: false };
      return { ...prev, [key]: { ...cur, [type]: !cur[type] } };
    });
  }, [setState]);

  const attachPDF = useCallback((key: string, pdf: PDFAttachment | null) => {
    setState((prev) => {
      const cur = prev[key] || { checked: false, xed: false };
      return { ...prev, [key]: { ...cur, pdf } };
    });
  }, [setState]);

  const addNote = useCallback((key: string, note: string) => {
    setState((prev) => {
      const cur = prev[key] || { checked: false, xed: false };
      return { ...prev, [key]: { ...cur, note } };
    });
  }, [setState]);

  const prevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  const xedProperties = REGIONS.flatMap((r) =>
    r.properties.filter((p) => state[buildKey(r.name, p)]?.xed)
  );
  const checkedCount  = Object.values(state).filter((s) => s.checked).length;
  const xedCount      = xedProperties.length;
  const reviewedCount = Object.values(state).filter((s) => s.checked || s.xed).length;
  const pdfCount      = Object.values(state).filter((s) => s.pdf).length;
  const progressPct   = Math.round((reviewedCount / TOTAL) * 100);
  const emailDrafts   = buildEmailDrafts(xedProperties, monthLabel);

  // Years with saved data for the year selector
  const currentYear = now.getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const handleReset = () => {
    if (window.confirm(`Reset all inspection marks for ${monthLabel}?`)) {
      setAllData((prev) => { const next = { ...prev }; delete next[mk]; return next; });
    }
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); });
  };
  const openMailto = (d: { to: string; subject: string; body: string }) => {
    window.open(`mailto:${d.to}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`, "_blank");
  };

  // Check if a month has any saved data
  const hasData = (y: number, m: number) => {
    const k = monthKey(y, m);
    const d = allData[k];
    return d && Object.keys(d).length > 0;
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] print:bg-white">
      {/* ── Header ── */}
      <header className="bg-[#1e2d4a] text-white shadow-lg print:shadow-none">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
                Monthly Inspections
              </h1>
              <p className="mt-1 text-[#93b4d8] text-sm font-semibold tracking-widest uppercase">
                Due: 21st of Every Month
              </p>
            </div>
            <div className="flex gap-2 flex-wrap print:hidden items-center">
              {/* Summary button */}
              <button
                onClick={() => setShowSummaryModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-all active:scale-95"
              >
                <ClipboardList className="w-4 h-4" />
                Summary
                {xedCount > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {xedCount}
                  </span>
                )}
              </button>
              {xedCount > 0 && (
                <button
                  onClick={() => setShowEmailModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-red-500 hover:bg-red-400 text-white text-sm font-semibold transition-all active:scale-95 shadow"
                >
                  <Mail className="w-4 h-4" />
                  Draft Emails ({xedCount})
                </button>
              )}
              <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm transition-all active:scale-95">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm transition-all active:scale-95">
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>

          {/* ── Month / Year Selector ── */}
          <div className="mt-5 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
              <button onClick={prevMonth} className="text-white/70 hover:text-white transition-colors p-0.5 rounded active:scale-90">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-transparent text-white font-semibold text-base border-none outline-none cursor-pointer appearance-none"
                  style={{ WebkitAppearance: "none" }}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i} className="bg-[#1e2d4a] text-white">
                      {m}{hasData(selectedYear, i) ? " ●" : ""}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-transparent text-white font-semibold text-base border-none outline-none cursor-pointer appearance-none"
                  style={{ WebkitAppearance: "none" }}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y} className="bg-[#1e2d4a] text-white">{y}</option>
                  ))}
                </select>
              </div>
              <button onClick={nextMonth} className="text-white/70 hover:text-white transition-colors p-0.5 rounded active:scale-90">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            {/* Months with data dots */}
            <div className="flex gap-1.5 items-center print:hidden">
              {MONTHS.map((m, i) => {
                const active = i === selectedMonth && selectedYear === selectedYear;
                const saved = hasData(selectedYear, i);
                return saved ? (
                  <button
                    key={m}
                    onClick={() => setSelectedMonth(i)}
                    title={m}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === selectedMonth ? "bg-white scale-125" : "bg-white/40 hover:bg-white/70"
                    }`}
                  />
                ) : null;
              })}
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4 print:hidden">
            <div className="flex justify-between text-xs text-[#93b4d8] mb-1.5 flex-wrap gap-2">
              <span>
                <span className="font-bold text-white">{reviewedCount}</span> of{" "}
                <span className="font-bold text-white">{TOTAL}</span> Properties Reviewed — {monthLabel}
              </span>
              <span className="flex gap-4">
                <span className="text-green-300 font-medium">✓ {checkedCount} Passed</span>
                <span className="text-red-300 font-medium">✗ {xedCount} Issues</span>
                <span className="text-blue-300 font-medium">📄 {pdfCount} PDFs</span>
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #60a5fa, #34d399)" }} />
            </div>
          </div>
        </div>
      </header>

      {/* ── Legend ── */}
      <div className="max-w-6xl mx-auto px-6 pt-3 pb-1 print:hidden">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 items-center">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-6 h-6 border-2 border-green-500 rounded bg-green-50 text-green-600 font-bold text-xs">✓</span>
            Inspection Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-6 h-6 border-2 border-red-500 rounded bg-red-50 text-red-600 font-bold text-xs">✗</span>
            Not Done / Issue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-6 h-6 border-2 border-blue-400 rounded bg-blue-50 text-blue-500 text-xs">
              <Upload className="w-3 h-3" />
            </span>
            Drop or click to attach inspection PDF
          </span>
        </div>
      </div>

      {/* ── Region Grid ── */}
      <main className="max-w-6xl mx-auto px-6 py-4 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {REGIONS.map((region) => (
            <RegionBlock key={region.name} region={region} state={state} onToggle={toggleStatus} onAttachPDF={attachPDF} onNote={addNote} />
          ))}
        </div>
      </main>

      {/* ── Summary Modal ── */}
      {showSummaryModal && (
        <SummaryModal
          xedProperties={xedProperties}
          checkedCount={checkedCount}
          monthLabel={monthLabel}
          state={state}
          onClose={() => setShowSummaryModal(false)}
        />
      )}

      {/* ── Email Modal ── */}
      {showEmailModal && (
        <EmailModal
          drafts={emailDrafts}
          onClose={() => setShowEmailModal(false)}
          copiedIdx={copiedIdx}
          onCopy={copyToClipboard}
          onOpen={openMailto}
        />
      )}

      <style>{`
        @media print {
          @page { size: letter landscape; margin: 0.3in 0.35in; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print\\:hidden { display: none !important; }
          body { background: white !important; font-size: 7.5pt !important; }
          header { background: #1e2d4a !important; padding: 6px 12px !important; }
          header h1 { font-size: 14pt !important; }
          header p { font-size: 7pt !important; margin: 0 !important; }
          .region-header { background: #1e2d4a !important; padding: 3px 8px !important; }
          .region-header span { font-size: 7pt !important; }
          .pdf-drop-zone { display: none !important; }
          main { padding: 4px 8px 4px !important; }
          main > div { gap: 6px !important; }
          .bg-white.rounded-lg { border-radius: 3px !important; box-shadow: none !important; }
          li { padding: 1px 6px !important; min-height: 0 !important; }
          li span.text-sm { font-size: 7pt !important; }
          .status-box { width: 14px !important; height: 14px !important; font-size: 8pt !important; border-width: 1px !important; }
          .status-box.is-checked { border-color: #16a34a !important; background: #f0fdf4 !important; color: #16a34a !important; }
          .status-box.is-xed { border-color: #dc2626 !important; background: #fef2f2 !important; color: #dc2626 !important; }
          .flex.items-center.px-3.py-1\\.5 { padding: 2px 6px !important; font-size: 6pt !important; }
          .w-8 { width: 18px !important; }
          div[class*="legend"], div[class*="pt-3"] { display: none !important; }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        select option { background: #1e2d4a; color: white; }
      `}</style>
    </div>
  );
}

// ─── Region Block ─────────────────────────────────────────────────────────────

function RegionBlock({ region, state, onToggle, onAttachPDF, onNote }: {
  region: { name: string; properties: string[] };
  state: InspectionState;
  onToggle: (key: string, type: "checked" | "xed") => void;
  onAttachPDF: (key: string, pdf: PDFAttachment | null) => void;
  onNote: (key: string, note: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
      <div className="region-header bg-[#1e2d4a] px-4 py-2.5 flex items-center justify-between">
        <span className="text-white font-bold text-sm uppercase tracking-widest">{region.name}</span>
        <span className="text-[#93b4d8] text-xs font-medium">{region.properties.length} Properties</span>
      </div>
      <div className="flex items-center px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-400 font-semibold uppercase tracking-wide">
        <span className="w-8 flex-shrink-0 text-center text-green-600">✓</span>
        <span className="w-8 flex-shrink-0 text-center text-red-500">✗</span>
        <span className="flex-1 pl-2">Property</span>
        <span className="w-28 text-center text-blue-500 print:hidden">Report PDF</span>
      </div>
      <ul>
        {region.properties.map((prop, idx) => {
          const key = buildKey(region.name, prop);
          const status = state[key] || { checked: false, xed: false };
          const rowBg = status.checked && status.xed ? "bg-amber-50/40"
            : status.checked ? "bg-green-50/40"
            : status.xed ? "bg-red-50/25"
            : idx % 2 === 0 ? "bg-white" : "bg-gray-50/40";
          return (
            <li key={prop} className={`flex flex-col border-b border-gray-100 last:border-0 transition-colors ${rowBg}`}>
              <div className="flex items-center px-3 py-2">
                <button onClick={() => onToggle(key, "checked")} title="Mark as completed"
                  className={`status-box w-8 h-8 flex-shrink-0 rounded border-2 flex items-center justify-center font-bold text-sm transition-all duration-150 active:scale-90 select-none ${
                    status.checked ? "is-checked border-green-500 bg-green-50 text-green-600 shadow-sm"
                    : "border-gray-300 bg-white text-transparent hover:border-green-400 hover:bg-green-50/60"}`}>✓</button>
                <button onClick={() => onToggle(key, "xed")} title="Mark as not done / issue"
                  className={`status-box w-8 h-8 flex-shrink-0 rounded border-2 flex items-center justify-center font-bold text-sm transition-all duration-150 active:scale-90 select-none ml-1 ${
                    status.xed ? "is-xed border-red-500 bg-red-50 text-red-600 shadow-sm"
                    : "border-gray-300 bg-white text-transparent hover:border-red-400 hover:bg-red-50/60"}`}>✗</button>
                <span className={`flex-1 text-sm font-medium pl-2 ${
                  status.checked && !status.xed ? "text-green-800"
                  : status.xed && !status.checked ? "text-red-800"
                  : status.checked && status.xed ? "text-amber-800"
                  : "text-gray-800"}`}>{prop}</span>
                <div className="w-28 flex-shrink-0 print:hidden">
                  <PDFDropZone pdf={status.pdf ?? null} onAttach={(pdf) => onAttachPDF(key, pdf)} onRemove={() => onAttachPDF(key, null)} />
                </div>
              </div>
              {/* Notes row */}
              <div className="px-3 pb-2 print:pb-1">
                <input
                  type="text"
                  value={status.note || ""}
                  onChange={(e) => onNote(key, e.target.value)}
                  placeholder="Add a note..."
                  className={`w-full text-xs rounded border px-2 py-1 outline-none transition-colors print:border-0 print:bg-transparent print:text-gray-600 ${
                    status.note
                      ? status.xed ? "border-red-200 bg-red-50/60 text-red-800 placeholder-red-300" : "border-gray-200 bg-white text-gray-700 placeholder-gray-300"
                      : "border-transparent bg-transparent text-gray-500 placeholder-gray-300 hover:border-gray-200 hover:bg-gray-50 focus:border-blue-300 focus:bg-white"
                  }`}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── PDF Drop Zone ────────────────────────────────────────────────────────────

function PDFDropZone({ pdf, onAttach, onRemove }: {
  pdf: PDFAttachment | null;
  onAttach: (pdf: PDFAttachment) => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setError("");
    if (file.type !== "application/pdf") { setError("PDF only"); setTimeout(() => setError(""), 2500); return; }
    if (file.size > 20 * 1024 * 1024) { setError("Max 20 MB"); setTimeout(() => setError(""), 2500); return; }
    const reader = new FileReader();
    reader.onload = (e) => onAttach({ name: file.name, dataUrl: e.target?.result as string, size: file.size, uploadedAt: new Date().toLocaleString() });
    reader.readAsDataURL(file);
  };

  if (pdf) {
    return (
      <div className="pdf-drop-zone flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-1.5 py-1 group" style={{ animation: "fadeIn 0.2s ease" }}>
        <button
          onClick={() => { const win = window.open(); if (win) win.document.write(`<iframe src="${pdf.dataUrl}" style="width:100%;height:100%;border:none;" />`); }}
          title={`${pdf.name} — ${formatBytes(pdf.size)}\nUploaded: ${pdf.uploadedAt}`}
          className="flex items-center gap-1 flex-1 min-w-0 hover:text-blue-700 transition-colors"
        >
          <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span className="text-xs text-blue-700 font-medium truncate max-w-[60px]">{pdf.name.replace(".pdf","")}</span>
          <Eye className="w-3 h-3 text-blue-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove PDF" className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`pdf-drop-zone relative flex flex-col items-center justify-center rounded border-2 border-dashed cursor-pointer transition-all duration-150 h-8 ${
        dragging ? "border-blue-500 bg-blue-50 scale-105" : error ? "border-red-400 bg-red-50" : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50"}`}
      onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
      onDragOver={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current?.click()}
      title="Drop PDF or click to browse"
    >
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} />
      {error
        ? <span className="text-red-500 text-[10px] font-medium px-1">{error}</span>
        : <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium"><Upload className="w-3 h-3" />Drop PDF</span>}
    </div>
  );
}

// ─── Summary Modal ────────────────────────────────────────────────────────────

function SummaryModal({ xedProperties, checkedCount, monthLabel, state, onClose }: {
  xedProperties: string[];
  checkedCount: number;
  monthLabel: string;
  state: InspectionState;
  onClose: () => void;
}) {
  const notReviewed = TOTAL - Object.values(state).filter((s) => s.checked || s.xed).length;
  const byRegion = REGIONS.map((r) => ({
    name: r.name,
    xed: r.properties.filter((p) => state[buildKey(r.name, p)]?.xed),
  })).filter((r) => r.xed.length > 0);

  const printSummary = () => {
    const rows = byRegion.map((r) =>
      `<div style="margin-bottom:10px">
        <div style="background:#1e2d4a;color:white;padding:3px 8px;font-size:8pt;font-weight:bold;letter-spacing:1px;text-transform:uppercase;border-radius:3px">${r.name}</div>
        <table style="width:100%;border-collapse:collapse;margin-top:3px">
          ${r.xed.map((prop) => {
            const c = contactMap[prop];
            return `<tr style="border-bottom:1px solid #fee2e2">
              <td style="padding:3px 6px;font-size:8pt;font-weight:600;color:#991b1b;width:40%">${prop}</td>
              <td style="padding:3px 6px;font-size:8pt;color:#b91c1c">${c ? c.manager : ""}</td>
              <td style="padding:3px 6px;font-size:8pt;color:#b91c1c">${c?.ext ? "Ext. " + c.ext : ""}</td>
              <td style="padding:3px 6px;font-size:7pt;color:#dc2626;text-align:right">✗</td>
            </tr>`;
          }).join("")}
        </table>
      </div>`
    ).join("");

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Inspection Summary — ${monthLabel}</title>
      <style>@page{size:letter portrait;margin:0.4in 0.5in} body{font-family:Arial,sans-serif;font-size:9pt} h1{font-size:14pt;margin:0} p{margin:2px 0;font-size:8pt;color:#555}</style>
    </head><body>
      <div style="background:#1e2d4a;color:white;padding:8px 12px;border-radius:4px;margin-bottom:10px">
        <h1>Monthly Inspections — Summary</h1>
        <p style="color:#93b4d8">${monthLabel} &nbsp;|&nbsp; Due: 21st of Every Month</p>
      </div>
      <div style="display:flex;gap:20px;margin-bottom:10px;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden">
        <div style="flex:1;text-align:center;padding:6px"><div style="font-size:18pt;font-weight:bold;color:#16a34a">${checkedCount}</div><div style="font-size:7pt;color:#6b7280">Completed</div></div>
        <div style="flex:1;text-align:center;padding:6px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb"><div style="font-size:18pt;font-weight:bold;color:#dc2626">${xedProperties.length}</div><div style="font-size:7pt;color:#6b7280">Not Done / Issues</div></div>
        <div style="flex:1;text-align:center;padding:6px"><div style="font-size:18pt;font-weight:bold;color:#9ca3af">${notReviewed}</div><div style="font-size:7pt;color:#6b7280">Not Reviewed</div></div>
      </div>
      ${xedProperties.length === 0 ? '<p style="text-align:center;color:#16a34a;font-weight:bold">✅ No issues this month!</p>' : rows}
      <div style="margin-top:14px;font-size:7pt;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:6px">Printed: ${new Date().toLocaleString()} &nbsp;|&nbsp; ApartmentCorp Monthly Inspections</div>
    </body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full flex flex-col" style={{ animation: "modalIn 0.2s cubic-bezier(0.23,1,0.32,1)", maxWidth: "min(860px, calc(100vw - 2rem))", maxHeight: "calc(100vh - 2rem)", height: "calc(100vh - 4rem)" }}>
        <div className="bg-[#1e2d4a] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg" style={{ fontFamily: "Georgia, serif" }}>Inspection Summary</h2>
            <p className="text-[#93b4d8] text-xs mt-0.5">{monthLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={printSummary} title="Print summary" className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-all active:scale-95">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button onClick={onClose} className="text-white/60 hover:text-white transition-colors p-1 rounded">
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-gray-200 border-b border-gray-200 flex-shrink-0">
          <div className="px-4 py-3 text-center">
            <div className="text-2xl font-bold text-green-600">{checkedCount}</div>
            <div className="text-xs text-gray-500 mt-0.5">Completed</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-2xl font-bold text-red-600">{xedProperties.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Not Done / Issues</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-2xl font-bold text-gray-400">{notReviewed}</div>
            <div className="text-xs text-gray-500 mt-0.5">Not Reviewed</div>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-4" style={{ flex: "1 1 0", minHeight: 0 }}>
          {xedProperties.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-gray-600 font-medium">No issues for {monthLabel}!</p>
              <p className="text-gray-400 text-sm mt-1">All reviewed properties are marked as completed.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                The following <span className="font-semibold text-red-600">{xedProperties.length} {xedProperties.length === 1 ? "property" : "properties"}</span> {xedProperties.length === 1 ? "has" : "have"} not completed their inspection for <span className="font-semibold">{monthLabel}</span>:
              </p>
              {byRegion.map((r) => (
                <div key={r.name} className="mb-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-[#1e2d4a] bg-[#f0f4f8] px-3 py-1.5 rounded mb-1">
                    {r.name}
                  </div>
                  <ul className="space-y-1">
                    {r.xed.map((prop) => {
                      const c = contactMap[prop];
                      const regionObj = REGIONS.find((rg) => rg.properties.includes(prop));
                      const note = regionObj ? state[buildKey(regionObj.name, prop)]?.note : undefined;
                      return (
                        <li key={prop} className="px-3 py-2 bg-red-50 border border-red-100 rounded">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-red-800">{prop}</span>
                              {c && <span className="text-xs text-red-500">— {c.manager}{c.ext ? <span className="ml-1 text-red-400">Ext. {c.ext}</span> : ""}</span>}
                            </div>
                            <span className="text-red-500 font-bold text-sm flex-shrink-0 ml-2">✗</span>
                          </div>
                          {note && (
                            <div className="mt-1 text-xs text-red-700 bg-red-100 rounded px-2 py-1 border border-red-200">
                              📝 {note}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-[#1e2d4a] hover:bg-[#2a3f6b] text-white text-sm font-medium rounded-md transition-all active:scale-95">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────

function EmailModal({ drafts, onClose, copiedIdx, onCopy, onOpen }: {
  drafts: { to: string; subject: string; body: string; managerName: string; property: string }[];
  onClose: () => void;
  copiedIdx: number | null;
  onCopy: (text: string, idx: number) => void;
  onOpen: (d: { to: string; subject: string; body: string }) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = drafts[activeIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ animation: "modalIn 0.2s cubic-bezier(0.23,1,0.32,1)" }}>
        <div className="bg-[#1e2d4a] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg" style={{ fontFamily: "Georgia, serif" }}>Draft Emails — Incomplete Inspections</h2>
            <p className="text-[#93b4d8] text-xs mt-0.5">{drafts.length} email{drafts.length !== 1 ? "s" : ""} · {drafts.reduce((a, d) => a + d.property.split(", ").length, 0)} properties marked ✗</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors p-1 rounded"><XIcon className="w-5 h-5" /></button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          {drafts.length > 1 && (
            <div className="w-52 border-r border-gray-200 overflow-y-auto bg-gray-50 flex-shrink-0">
              {drafts.map((d, i) => (
                <button key={i} onClick={() => setActiveIdx(i)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${i === activeIdx ? "bg-[#1e2d4a] text-white" : "hover:bg-gray-100 text-gray-700"}`}>
                  <div className="font-medium text-sm truncate">{d.managerName}</div>
                  <div className={`text-xs truncate mt-0.5 ${i === activeIdx ? "text-blue-200" : "text-gray-400"}`}>{d.property}</div>
                </button>
              ))}
            </div>
          )}
          {active && (
            <div className="flex-1 overflow-y-auto flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 space-y-1.5">
                {[["From","Brandon@ApartmentCorp.com"],["To",active.to],["Subject",active.subject]].map(([label,val]) => (
                  <div key={label} className="flex gap-2 text-sm">
                    <span className="text-gray-400 font-medium w-16 flex-shrink-0">{label}:</span>
                    <span className="text-gray-700">{val}</span>
                  </div>
                ))}
              </div>
              <div className="px-6 py-5 flex-1">
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{active.body}</pre>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3 flex-wrap">
                <button onClick={() => onOpen(active)} className="flex items-center gap-2 px-4 py-2 bg-[#1e2d4a] hover:bg-[#2a3f6b] text-white text-sm font-medium rounded-md transition-all active:scale-95">
                  <Mail className="w-4 h-4" /> Open in Email Client
                </button>
                <button onClick={() => onCopy(`To: ${active.to}\nSubject: ${active.subject}\n\n${active.body}`, activeIdx)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-md transition-all active:scale-95">
                  {copiedIdx === activeIdx
                    ? <><Check className="w-4 h-4 text-green-600" /><span className="text-green-600">Copied!</span></>
                    : <><Copy className="w-4 h-4" />Copy to Clipboard</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
