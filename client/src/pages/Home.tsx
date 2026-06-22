/**
 * Monthly Inspections — Home Page
 * Design: Clean Corporate Operations Dashboard
 * Features:
 *  - Dark navy region headers
 *  - ✓ and ✗ toggle boxes per property
 *  - Drag-and-drop PDF upload zone per property (stored in localStorage as base64)
 *  - Click uploaded PDF to preview in new tab
 *  - Email drafting modal for X-marked properties
 *  - Progress bar + stats
 *  - Print-friendly layout
 */

import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import { Printer, RotateCcw, Mail, X as XIcon, Copy, Check, FileText, Upload, Eye, Trash2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PropertyContact {
  property: string;
  manager: string;
  email: string;
  region: string;
  regionalManager: string;
  regionalEmail: string;
}

interface PDFAttachment {
  name: string;
  dataUrl: string; // base64 data URL
  size: number;
  uploadedAt: string;
}

interface PropertyStatus {
  checked: boolean;
  xed: boolean;
  pdf?: PDFAttachment | null;
}

type InspectionState = Record<string, PropertyStatus>;

// ─── Contact Data ─────────────────────────────────────────────────────────────

const CONTACTS: PropertyContact[] = [
  // Region 1
  { property: "Arbor Crest",         manager: "Erica Finch",           email: "arborcrest@apartmentcorp.com",    region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Boca Ciega",          manager: "Katrina Weekly",         email: "katrina@apartmentcorp.com",       region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Coral Village",       manager: "Keyla Maranon",          email: "coralvillage@apartmentcorp.com",  region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Jefferson",           manager: "Brandy Amador",          email: "jefferson@apartmentcorp.com",     region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Macedonia",           manager: "Erika Scales",           email: "macedonia@apartmentcorp.com",     region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Opa Locka",           manager: "Rosa Villarroel",        email: "opa@apartmentcorp.com",           region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "River Pointe",        manager: "Stephanie Delong",       email: "stephanie@apartmentcorp.com",     region: "Region 1", regionalManager: "JR Rolon",          regionalEmail: "jrrolon@apartmentcorp.com" },
  { property: "Silver Springs",      manager: "Tarshia Pierce",         email: "silversprings@apartmentcorp.com", region: "Region 1", regionalManager: "Leslie Rolon",      regionalEmail: "leslie@apartmentcorp.com" },
  { property: "Thomasville",         manager: "Ebony Nelson",           email: "thomasville@apartmentcorp.com",   region: "Region 1", regionalManager: "Leslie Rolon",      regionalEmail: "leslie@apartmentcorp.com" },
  // Region 2
  { property: "Breckenridge",        manager: "(No manager listed)",    email: "lexingtonasst@apartmentcorp.com", region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Crossroads",          manager: "Jennifer Parks",         email: "crossroads@apartmentcorp.com",    region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Cumberland",          manager: "Kiara Brown",            email: "cumberland@apartmentcorp.com",    region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Grace Townhomes",     manager: "Susan Lopez",            email: "susan@apartmentcorp.com",         region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Grove Park",          manager: "Nikki Moreno",           email: "grovepark@apartmentcorp.com",     region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Holiday",             manager: "Arlene Vinson",          email: "holiday@apartmentcorp.com",       region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "La Promesa",          manager: "Ashley Clay",            email: "lapromesa@apartmentcorp.com",     region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Lexington",           manager: "(No manager listed)",    email: "lexingtonasst@apartmentcorp.com", region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  { property: "Walnut Hill",         manager: "Johann Armstead",        email: "walnut@apartmentcorp.com",        region: "Region 2", regionalManager: "Region 2 Manager",  regionalEmail: "" },
  // Region 3
  { property: "Bayou Pointe",        manager: "Jennifer Frederick",     email: "bayou@apartmentcorp.com",         region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Gates of Manhattan",  manager: "Lindgret Celestine",     email: "lindgret@apartmentcorp.com",      region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Howell Place",        manager: "Sandra Crump",           email: "howell@apartmentcorp.com",        region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Marrero",             manager: "Ketorah Parks",          email: "rubystarmanager@apartmentcorp.com",region: "Region 3", regionalManager: "Ginger Positerry", regionalEmail: "ginger@apartmentcorp.com" },
  { property: "North Pointe",        manager: "Jennifer Frederick",     email: "northpointe@apartmentcorp.com",   region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Pelican Bay",         manager: "Dequanta Sutherland",    email: "pelican@apartmentcorp.com",       region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Pirates Bend",        manager: "Sandra Crump",           email: "pirates@apartmentcorp.com",       region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Ruby Diamond",        manager: "Ketorah Parks",          email: "rubystarmanager@apartmentcorp.com",region: "Region 3", regionalManager: "Ginger Positerry", regionalEmail: "ginger@apartmentcorp.com" },
  { property: "St. Charles",         manager: "Deon Tolliver",          email: "stcharles@apartmentcorp.com",     region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Star",                manager: "Ketorah Parks",          email: "rubystarmanager@apartmentcorp.com",region: "Region 3", regionalManager: "Ginger Positerry", regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Thibodaux",           manager: "Susie Rogers",           email: "colonialleasing@apartmentcorp.com",region: "Region 3", regionalManager: "Ginger Positerry", regionalEmail: "ginger@apartmentcorp.com" },
  { property: "Windsor / Yorkshire", manager: "Kimberly Powell",        email: "windsor@apartmentcorp.com",       region: "Region 3", regionalManager: "Ginger Positerry",  regionalEmail: "ginger@apartmentcorp.com" },
  // Region 4
  { property: "Anaheim Gardens",     manager: "Priscilla Walters",      email: "priscilla@apartmentcorp.com",     region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Columbia",            manager: "Tammy Davis",            email: "tammy@apartmentcorp.com",         region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Fairfax",             manager: "Shraga Kurs",            email: "alberto@apartmentcorp.com",       region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Forest View",         manager: "Tammy / Heather",        email: "tammy@apartmentcorp.com",         region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Granite Ridge",       manager: "James Abeyta",           email: "james@apartmentcorp.com",         region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Midtown",             manager: "Steve Rand",             email: "alberto@apartmentcorp.com",       region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Oak Hills",           manager: "Heather Hein",           email: "heatherh@apartmentcorp.com",      region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Pacific",             manager: "Hailey Huber",           email: "pacificpointe@apartmentcorp.com", region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "River Garden",        manager: "Heather Snyder",         email: "rivergarden@apartmentcorp.com",   region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Urban",               manager: "Amunique Cannon",        email: "alberto@apartmentcorp.com",       region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
  { property: "Wilmington",          manager: "Alberto Spence",         email: "alberto@apartmentcorp.com",       region: "Region 4", regionalManager: "Blake Weddington",  regionalEmail: "blake@apartmentcorp.com" },
];

const contactMap = Object.fromEntries(CONTACTS.map((c) => [c.property, c]));

// ─── Checklist Regions ────────────────────────────────────────────────────────

const REGIONS: { name: string; properties: string[] }[] = [
  { name: "Region 1", properties: ["Arbor Crest","Boca Ciega","Coral Village","Jefferson","Macedonia","Opa Locka","River Pointe","Silver Springs","Thomasville"] },
  { name: "Region 2", properties: ["Breckenridge","Crossroads","Cumberland","Grace Townhomes","Grove Park","Holiday","La Promesa","Lexington","Walnut Hill"] },
  { name: "Region 3", properties: ["Bayou Pointe","Gates of Manhattan","Howell Place","Marrero","North Pointe","Pelican Bay","Pirates Bend","Ruby Diamond","St. Charles","Star","Thibodaux","Windsor / Yorkshire"] },
  { name: "Region 4", properties: ["Anaheim Gardens","Columbia","Fairfax","Forest View","Granite Ridge","Midtown","Oak Hills","Pacific","River Garden","Urban","Wilmington"] },
];

const TOTAL = REGIONS.reduce((acc, r) => acc + r.properties.length, 0);
const STORAGE_KEY = "monthly_inspections_v3";

function buildKey(region: string, property: string) {
  return `${region}::${property}`;
}

function loadState(): InspectionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveState(state: InspectionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Click Sound ──────────────────────────────────────────────────────────────

function playClick() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1000;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.02);
  } catch {}
}

// ─── Email Builder ────────────────────────────────────────────────────────────

function buildEmailDrafts(xedProperties: string[], month: string) {
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
    const subject = `Monthly Inspection Reminder — ${properties.join(", ")} — ${month}`;
    const body = `Dear ${contact.manager},

I hope this message finds you well. I am following up regarding the monthly property inspection${plural ? "s" : ""} that ${plural ? "were" : "was"} due on the 21st of this month for the following ${plural ? "properties" : "property"}:

${propList}

As of today, our records indicate that the inspection${plural ? "s have" : " has"} not been completed. Please ensure the inspection${plural ? "s are" : " is"} conducted and documented as soon as possible, and confirm completion by replying to this email.

If there are any circumstances preventing the inspection from being completed on schedule, please reach out so we can assist.

Thank you for your attention to this matter.

Best regards,
Brandon Rose
Special Projects
ApartmentCorp
Brandon@ApartmentCorp.com`;
    return { to: contact.email, subject, body, managerName: contact.manager, property: properties.join(", ") };
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const [state, setState] = useState<InspectionState>(loadState);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const month = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  useEffect(() => { saveState(state); }, [state]);

  const toggleStatus = useCallback((key: string, type: "checked" | "xed") => {
    playClick();
    setState((prev) => {
      const cur = prev[key] || { checked: false, xed: false };
      return { ...prev, [key]: { ...cur, [type]: !cur[type] } };
    });
  }, []);

  const attachPDF = useCallback((key: string, pdf: PDFAttachment | null) => {
    setState((prev) => {
      const cur = prev[key] || { checked: false, xed: false };
      return { ...prev, [key]: { ...cur, pdf } };
    });
  }, []);

  const xedProperties = REGIONS.flatMap((r) =>
    r.properties.filter((p) => state[buildKey(r.name, p)]?.xed)
  );

  const checkedCount  = Object.values(state).filter((s) => s.checked).length;
  const xedCount      = xedProperties.length;
  const reviewedCount = Object.values(state).filter((s) => s.checked || s.xed).length;
  const pdfCount      = Object.values(state).filter((s) => s.pdf).length;
  const progressPct   = Math.round((reviewedCount / TOTAL) * 100);
  const emailDrafts   = buildEmailDrafts(xedProperties, month);

  const handleReset = () => {
    if (window.confirm("Reset all inspection marks and uploaded PDFs for this month?")) setState({});
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const openMailto = (d: { to: string; subject: string; body: string }) => {
    window.open(`mailto:${d.to}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] print:bg-white">
      {/* ── Header ── */}
      <header className="bg-[#1e2d4a] text-white shadow-lg print:shadow-none">
        <div className="max-w-6xl mx-auto px-6 py-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
                Monthly Inspections
              </h1>
              <p className="mt-1 text-[#93b4d8] text-sm font-semibold tracking-widest uppercase">
                Due: 21st of Every Month
              </p>
              <p className="mt-0.5 text-[#6a8faf] text-xs">{month}</p>
            </div>
            <div className="flex gap-2 flex-wrap print:hidden">
              {xedCount > 0 && (
                <button
                  onClick={() => setShowEmailModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-red-500 hover:bg-red-400 text-white text-sm font-semibold transition-all active:scale-95 shadow"
                >
                  <Mail className="w-4 h-4" />
                  Draft Emails ({xedCount})
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm transition-all active:scale-95"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm transition-all active:scale-95"
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>

          {/* Stats + Progress */}
          <div className="mt-5 print:hidden">
            <div className="flex justify-between text-xs text-[#93b4d8] mb-1.5 flex-wrap gap-2">
              <span>
                <span className="font-bold text-white">{reviewedCount}</span> of{" "}
                <span className="font-bold text-white">{TOTAL}</span> Properties Reviewed
              </span>
              <span className="flex gap-4">
                <span className="text-green-300 font-medium">✓ {checkedCount} Passed</span>
                <span className="text-red-300 font-medium">✗ {xedCount} Issues</span>
                <span className="text-blue-300 font-medium">📄 {pdfCount} PDFs</span>
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #60a5fa, #34d399)" }}
              />
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
            <RegionBlock
              key={region.name}
              region={region}
              state={state}
              onToggle={toggleStatus}
              onAttachPDF={attachPDF}
            />
          ))}
        </div>
      </main>

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
          @page { size: letter; margin: 0.4in 0.5in; }
          .print\\:hidden { display: none !important; }
          body { background: white !important; }
          header { background: #1e2d4a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .region-header { background: #1e2d4a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .status-box.is-checked { border-color: #16a34a !important; background: #f0fdf4 !important; color: #16a34a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .status-box.is-xed { border-color: #dc2626 !important; background: #fef2f2 !important; color: #dc2626 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .pdf-drop-zone { display: none !important; }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Region Block ─────────────────────────────────────────────────────────────

function RegionBlock({
  region, state, onToggle, onAttachPDF,
}: {
  region: { name: string; properties: string[] };
  state: InspectionState;
  onToggle: (key: string, type: "checked" | "xed") => void;
  onAttachPDF: (key: string, pdf: PDFAttachment | null) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
      <div className="region-header bg-[#1e2d4a] px-4 py-2.5 flex items-center justify-between">
        <span className="text-white font-bold text-sm uppercase tracking-widest">{region.name}</span>
        <span className="text-[#93b4d8] text-xs font-medium">{region.properties.length} Properties</span>
      </div>

      {/* Column labels */}
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
          const isEven = idx % 2 === 0;
          const rowBg = status.checked && status.xed
            ? "bg-amber-50/40"
            : status.checked
            ? "bg-green-50/40"
            : status.xed
            ? "bg-red-50/25"
            : isEven ? "bg-white" : "bg-gray-50/40";

          return (
            <li key={prop} className={`flex items-center px-3 py-2 border-b border-gray-100 last:border-0 transition-colors ${rowBg}`}>
              {/* ✓ box */}
              <button
                onClick={() => onToggle(key, "checked")}
                title="Mark as completed"
                className={`status-box w-8 h-8 flex-shrink-0 rounded border-2 flex items-center justify-center font-bold text-sm transition-all duration-150 active:scale-90 select-none ${
                  status.checked
                    ? "is-checked border-green-500 bg-green-50 text-green-600 shadow-sm"
                    : "border-gray-300 bg-white text-transparent hover:border-green-400 hover:bg-green-50/60"
                }`}
              >✓</button>

              {/* ✗ box */}
              <button
                onClick={() => onToggle(key, "xed")}
                title="Mark as not done / issue"
                className={`status-box w-8 h-8 flex-shrink-0 rounded border-2 flex items-center justify-center font-bold text-sm transition-all duration-150 active:scale-90 select-none ml-1 ${
                  status.xed
                    ? "is-xed border-red-500 bg-red-50 text-red-600 shadow-sm"
                    : "border-gray-300 bg-white text-transparent hover:border-red-400 hover:bg-red-50/60"
                }`}
              >✗</button>

              {/* Property name */}
              <span className={`flex-1 text-sm font-medium pl-2 truncate ${
                status.checked && !status.xed ? "text-green-800"
                : status.xed && !status.checked ? "text-red-800"
                : status.checked && status.xed ? "text-amber-800"
                : "text-gray-800"
              }`}>
                {prop}
              </span>

              {/* PDF drop zone */}
              <div className="w-28 flex-shrink-0 print:hidden">
                <PDFDropZone
                  pdf={status.pdf ?? null}
                  onAttach={(pdf) => onAttachPDF(key, pdf)}
                  onRemove={() => onAttachPDF(key, null)}
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

function PDFDropZone({
  pdf, onAttach, onRemove,
}: {
  pdf: PDFAttachment | null;
  onAttach: (pdf: PDFAttachment) => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setError("");
    if (file.type !== "application/pdf") {
      setError("PDF only");
      setTimeout(() => setError(""), 2500);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Max 20 MB");
      setTimeout(() => setError(""), 2500);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      onAttach({
        name: file.name,
        dataUrl: e.target?.result as string,
        size: file.size,
        uploadedAt: new Date().toLocaleString(),
      });
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const openPDF = () => {
    if (!pdf) return;
    const win = window.open();
    if (win) {
      win.document.write(`<iframe src="${pdf.dataUrl}" style="width:100%;height:100%;border:none;" />`);
    }
  };

  if (pdf) {
    return (
      <div
        className="pdf-drop-zone flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-1.5 py-1 group"
        style={{ animation: "fadeIn 0.2s ease" }}
      >
        <button
          onClick={openPDF}
          title={`View: ${pdf.name}\n${formatBytes(pdf.size)}\nUploaded: ${pdf.uploadedAt}`}
          className="flex items-center gap-1 flex-1 min-w-0 hover:text-blue-700 transition-colors"
        >
          <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span className="text-xs text-blue-700 font-medium truncate max-w-[60px]">{pdf.name.replace(".pdf","")}</span>
          <Eye className="w-3 h-3 text-blue-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Remove PDF"
          className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`pdf-drop-zone relative flex flex-col items-center justify-center rounded border-2 border-dashed cursor-pointer transition-all duration-150 h-8 ${
        dragging
          ? "border-blue-500 bg-blue-50 scale-105"
          : error
          ? "border-red-400 bg-red-50"
          : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50"
      }`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      title="Drop PDF or click to browse"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
      />
      {error ? (
        <span className="text-red-500 text-[10px] font-medium px-1">{error}</span>
      ) : (
        <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
          <Upload className="w-3 h-3" />
          Drop PDF
        </span>
      )}
    </div>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────

function EmailModal({
  drafts, onClose, copiedIdx, onCopy, onOpen,
}: {
  drafts: { to: string; subject: string; body: string; managerName: string; property: string }[];
  onClose: () => void;
  copiedIdx: number | null;
  onCopy: (text: string, idx: number) => void;
  onOpen: (d: { to: string; subject: string; body: string }) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = drafts[activeIdx];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ animation: "modalIn 0.2s cubic-bezier(0.23,1,0.32,1)" }}
      >
        <div className="bg-[#1e2d4a] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg" style={{ fontFamily: "Georgia, serif" }}>
              Draft Emails — Incomplete Inspections
            </h2>
            <p className="text-[#93b4d8] text-xs mt-0.5">
              {drafts.length} email{drafts.length !== 1 ? "s" : ""} · {drafts.reduce((a, d) => a + d.property.split(", ").length, 0)} properties marked ✗
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors p-1 rounded">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {drafts.length > 1 && (
            <div className="w-52 border-r border-gray-200 overflow-y-auto bg-gray-50 flex-shrink-0">
              {drafts.map((d, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                    i === activeIdx ? "bg-[#1e2d4a] text-white" : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  <div className="font-medium text-sm truncate">{d.managerName}</div>
                  <div className={`text-xs truncate mt-0.5 ${i === activeIdx ? "text-blue-200" : "text-gray-400"}`}>{d.property}</div>
                </button>
              ))}
            </div>
          )}

          {active && (
            <div className="flex-1 overflow-y-auto flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 space-y-1.5">
                {[["From", "Brandon@ApartmentCorp.com"], ["To", active.to], ["Subject", active.subject]].map(([label, val]) => (
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
                <button
                  onClick={() => onOpen(active)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1e2d4a] hover:bg-[#2a3f6b] text-white text-sm font-medium rounded-md transition-all active:scale-95"
                >
                  <Mail className="w-4 h-4" /> Open in Email Client
                </button>
                <button
                  onClick={() => onCopy(`To: ${active.to}\nSubject: ${active.subject}\n\n${active.body}`, activeIdx)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-md transition-all active:scale-95"
                >
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
