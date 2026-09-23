// Scraper controls and the other Manus-era panels: Scrape Activity, Run
// Scraper, Test Mappings, Saved Runs, Naming, Pre-Due Reminders and the
// "not connected to MyLoneWorkers" banner.
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { downloadReportPdf } from "@/lib/reportPdf";
import {
  AlertTriangle, Activity, BellRing, Check, Copy, Download, ExternalLink, FlaskConical, Loader2, Mail, Pencil,
  Play, Printer, RotateCcw, Save, Tag, Terminal, Trash2, X as XIcon,
} from "lucide-react";
import {
  applyNamingTemplate, buildPreDueReminders, DEFAULT_NAMING, mappingHealth, MONTH_NAMES, monthLabelOf, monthRange,
  NamingSettings, ReminderDraft,
} from "@shared/properties";

type Status = Record<string, { checked?: boolean; xed?: boolean } | undefined>;

export function monthKeyOf(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function todayMonthKey(now = new Date()) {
  return monthKeyOf(now.getFullYear(), now.getMonth());
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const i = y * 12 + (m - 1) + delta;
  return monthKeyOf(Math.floor(i / 12), i % 12);
}

function errorText(err: unknown) {
  return (err as { message?: string })?.message || "Something went wrong.";
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function Modal({ title, subtitle, icon, onClose, children, footer, width = 640, dark = false }: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  dark?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden" style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={title}
        className={`rounded-xl shadow-2xl w-full flex flex-col overflow-hidden ${dark ? "bg-[#1e2d4a] text-white" : "bg-white"}`}
        style={{ animation: "modalIn 0.2s cubic-bezier(0.23,1,0.32,1)", maxWidth: `min(${width}px, calc(100vw - 2rem))`, maxHeight: "calc(100vh - 2rem)" }}>
        <div className={`px-6 py-4 flex items-center justify-between flex-shrink-0 ${dark ? "border-b border-white/10" : "bg-[#1e2d4a] text-white"}`}>
          <div className="flex items-center gap-2.5">
            {icon}
            <div>
              <h2 className="font-bold text-lg" style={{ fontFamily: "Georgia, serif" }}>{title}</h2>
              {subtitle && <p className="text-[#93b4d8] text-xs mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white transition-colors p-1 rounded"><XIcon className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer && <div className={`px-6 py-3 flex items-center justify-between gap-3 flex-shrink-0 ${dark ? "border-t border-white/10" : "border-t border-gray-200 bg-gray-50"}`}>{footer}</div>}
      </div>
    </div>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────

export function UnmappedBanner() {
  const unmapped = mappingHealth().filter(p => !p.mapped);
  if (!unmapped.length) return null;
  return (
    <div className="max-w-6xl mx-auto px-6 pt-4 print:hidden">
      <div className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-amber-950 shadow-sm">
        <span className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <span>
            <b>{unmapped.length} propert{unmapped.length === 1 ? "y is" : "ies are"} not connected to MyLoneWorkers.</b>
            <span className="ml-1.5 text-sm text-amber-800">These remain manually tracked: {unmapped.map(p => p.property).join(", ")}.</span>
          </span>
        </span>
      </div>
    </div>
  );
}

// ── Scrape Activity ───────────────────────────────────────────────────────────

type Run = {
  id: number; label: string; kind: string; status: string; startMonthKey: string; endMonthKey: string;
  totalMonths: number; completedMonths: number; currentMonthKey: string | null; currentProperty: string | null;
  progressMessage: string | null; passed: number; failed: number; total: number; pdfs: number;
  errorMessage: string | null; githubRunUrl: string | null; startedAt: Date | string; completedAt: Date | string | null;
};

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-slate-200 text-slate-700",
  running: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  completed_with_errors: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-700",
  stalled: "bg-amber-100 text-amber-800",
};
const STATUS_LABEL: Record<string, string> = {
  queued: "Queued", running: "Running", completed: "Completed", completed_with_errors: "Completed with errors",
  failed: "Failed", stalled: "No response",
};

function rangeLabel(r: { startMonthKey: string; endMonthKey: string }) {
  return r.startMonthKey === r.endMonthKey ? monthLabelOf(r.startMonthKey) : `${monthLabelOf(r.startMonthKey)} → ${monthLabelOf(r.endMonthKey)}`;
}

function when(d: Date | string | null) {
  return d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

export function useScrapeActivity(onRunFinished: (run: Run) => void) {
  const [fast, setFast] = useState(false);
  const query = trpc.scraper.activity.useQuery(undefined, { refetchInterval: fast ? 3000 : 30000 });
  const runs = (query.data ?? []) as Run[];
  const active = runs.filter(r => r.status === "queued" || r.status === "running");
  useEffect(() => setFast(active.length > 0), [active.length]);

  // Refresh the checklist when a run we saw running finishes.
  const [seen, setSeen] = useState<Record<number, string>>({});
  useEffect(() => {
    const next: Record<number, string> = {};
    for (const r of runs) {
      next[r.id] = r.status;
      const before = seen[r.id];
      if ((before === "running" || before === "queued") && before !== r.status) onRunFinished(r);
    }
    if (JSON.stringify(next) !== JSON.stringify(seen)) setSeen(next);
  }, [runs]); // eslint-disable-line react-hooks/exhaustive-deps
  return { runs, active, refetch: query.refetch, isLoading: query.isLoading };
}

export function ScrapeActivityPanel({ runs, active, onViewLog }: { runs: Run[]; active: Run[]; onViewLog: (runId: number) => void }) {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-4 print:hidden" aria-label="Scrape activity">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Activity className={`h-5 w-5 ${active.length ? "text-sky-600" : "text-slate-500"}`} />
            <div>
              <h2 className="text-sm font-bold text-slate-800">Scrape Activity</h2>
              <p className="text-xs text-slate-500">Visible to everyone. Updates automatically while a run is active.</p>
            </div>
          </div>
          {active.length
            ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">{active.length} running</span>
            : <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">No active runs</span>}
        </div>
        <div className="divide-y divide-slate-100">
          {runs.length === 0 && (
            <div className="px-4 py-4 text-sm text-slate-500">
              No scrape activity yet. When a scrape starts, its month, property and progress appear here for everyone.
            </div>
          )}
          {runs.slice(0, 4).map(r => {
            const pct = r.totalMonths > 0 ? Math.min(100, Math.round((r.completedMonths / r.totalMonths) * 100)) : 0;
            const live = r.status === "running" || r.status === "queued";
            return (
              <div key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800 truncate">{r.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status] ?? STATUS_STYLE.queued}`}>
                        {live && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}{STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {rangeLabel(r)} · {r.completedMonths}/{r.totalMonths} month{r.totalMonths === 1 ? "" : "s"} · started {when(r.startedAt)}
                      {r.githubRunUrl && <> · <a href={r.githubRunUrl} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline inline-flex items-center gap-0.5">GitHub log <ExternalLink className="h-3 w-3" /></a></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-600 font-medium">
                      <span className="text-emerald-700">{r.passed} passed</span> · <span className="text-red-600">{r.failed} issues</span> · <span className="text-blue-600">{r.pdfs} PDFs</span>
                    </div>
                    <button onClick={() => onViewLog(r.id)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${live ? "bg-[#1e2d4a] text-white hover:bg-[#2a3f6b]" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      <Terminal className="h-3.5 w-3.5" /> {live ? "Watch live" : "View log"}
                    </button>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${r.status === "failed" ? "bg-red-400" : "bg-gradient-to-r from-sky-400 to-emerald-400"}`}
                    style={{ width: `${r.status === "completed" ? 100 : pct}%` }} />
                </div>
                {live && (r.currentProperty || r.progressMessage) && (
                  <div className="mt-1.5 text-xs text-slate-500">
                    {r.progressMessage || `${r.currentMonthKey ? monthLabelOf(r.currentMonthKey) + ": " : ""}${r.currentProperty}`}
                  </div>
                )}
                {r.status === "stalled" && (
                  <div className="mt-1.5 text-xs text-amber-800">No update for over 90 minutes. Check that the Mac runner is online, then start the run again.</div>
                )}
                {r.errorMessage && <div className="mt-1.5 text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">{r.errorMessage}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Run Scraper ───────────────────────────────────────────────────────────────

const PRESETS: { label: string; range: (now: string) => [string, string] }[] = [
  { label: "This Month", range: n => [n, n] },
  { label: "Last Month", range: n => [shiftMonth(n, -1), shiftMonth(n, -1)] },
  { label: "Last 3 Months", range: n => [shiftMonth(n, -2), n] },
  { label: "Last 6 Months", range: n => [shiftMonth(n, -5), n] },
  { label: "Year to Date", range: n => [`${n.slice(0, 4)}-01`, n] },
  { label: "Last Year", range: n => [`${Number(n.slice(0, 4)) - 1}-01`, `${Number(n.slice(0, 4)) - 1}-12`] },
];

function MonthPicker({ label, value, onChange, years }: { label: string; value: string; onChange: (k: string) => void; years: number[] }) {
  const [y, m] = value.split("-").map(Number);
  const cls = "w-full bg-white/10 text-white text-sm rounded px-2 py-1.5 border border-white/20 focus:outline-none focus:border-emerald-400";
  return (
    <div>
      <div className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1.5">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label={`${label} month`} value={m - 1} onChange={e => onChange(monthKeyOf(y, Number(e.target.value)))} className={cls}>
          {MONTH_NAMES.map((n, i) => <option key={n} value={i} className="bg-[#1e2d4a]">{n}</option>)}
        </select>
        <select aria-label={`${label} year`} value={y} onChange={e => onChange(monthKeyOf(Number(e.target.value), m - 1))} className={cls}>
          {years.map(v => <option key={v} value={v} className="bg-[#1e2d4a]">{v}</option>)}
        </select>
      </div>
    </div>
  );
}

export function RunScraperModal({ onClose, onStarted }: { onClose: () => void; onStarted: (runId: number) => void }) {
  const now = todayMonthKey();
  const [start, setStart] = useState(now);
  const [end, setEnd] = useState(now);
  const [error, setError] = useState("");
  const years = Array.from({ length: 6 }, (_, i) => Number(now.slice(0, 4)) - 4 + i);
  const months = monthRange(start, end);
  const future = end > now;
  const mutation = trpc.scraper.start.useMutation({
    onSuccess: run => { onStarted(run.id); },
    onError: err => setError(errorText(err)),
  });
  const valid = months.length > 0 && months.length <= 36 && !future;

  return (
    <Modal dark title="Run Scraper" subtitle="Pull inspections from MyLoneWorkers on the Mac runner" icon={<Play className="w-5 h-5 text-emerald-400" />} onClose={onClose} width={520}
      footer={<>
        <button onClick={onClose} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 active:scale-95">Cancel</button>
        <button onClick={() => { setError(""); mutation.mutate({ startMonthKey: start, endMonthKey: end }); }} disabled={!valid || mutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start Scraper
        </button>
      </>}>
      <div className="px-6 py-4">
        <div className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-2">Quick ranges</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => { const [s, e] = p.range(now); setStart(s); setEnd(e); }}
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white hover:bg-white/15 active:scale-95">{p.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <MonthPicker label="From" value={start} onChange={setStart} years={years} />
          <MonthPicker label="To" value={end} onChange={setEnd} years={years} />
        </div>
        {months.length > 0 ? (
          <div className="mt-3 bg-emerald-900/40 border border-emerald-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-emerald-300 text-xs font-semibold uppercase tracking-widest mb-0.5">Selected Range</div>
              <div className="text-white text-sm font-medium">{monthLabelOf(start)} → {monthLabelOf(end)}</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-emerald-400 leading-none">{months.length}</div>
              <div className="text-emerald-300/70 text-xs mt-0.5">month{months.length !== 1 ? "s" : ""} total</div>
            </div>
          </div>
        ) : (
          <div className="mt-3 bg-red-900/40 border border-red-500/30 rounded-lg px-4 py-3 text-red-300 text-sm">⚠️ End date must be on or after start date</div>
        )}
        {future && <p className="mt-2 text-red-300 text-xs">The range can't include future months.</p>}
        {months.length > 36 && <p className="mt-2 text-red-300 text-xs">Pick 36 months or fewer.</p>}
        <p className="mt-3 text-yellow-300/80 text-xs">⚠️ Existing data for selected months will be overwritten. PDFs you attached by hand are kept when the scraper has none to file.</p>
        <p className="mt-1 text-white/50 text-xs">Progress shows in Scrape Activity. The Mac runner must be on and signed in to MyLoneWorkers.</p>
        {error && <div className="mt-3 rounded-lg border border-red-400/40 bg-red-900/40 px-3 py-2 text-sm text-red-200">{error}</div>}
      </div>
    </Modal>
  );
}

// ── Test Mappings ─────────────────────────────────────────────────────────────

export function TestMappingsModal({ onClose, onStarted }: { onClose: () => void; onStarted: (runId: number) => void }) {
  const mapped = mappingHealth().filter(p => p.mapped);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const month = todayMonthKey();
  const mutation = trpc.scraper.start.useMutation({
    onSuccess: run => { onStarted(run.id); },
    onError: err => setError(errorText(err)),
  });
  const all = picked.length === mapped.length;

  return (
    <Modal dark title="Test Mappings" subtitle={`Scrape ${monthLabelOf(month)} for just the properties you pick`} icon={<FlaskConical className="w-5 h-5 text-sky-300" />} onClose={onClose} width={720}
      footer={<>
        <span className="text-xs text-white/60"><b className="text-sky-300">{picked.length}</b> propert{picked.length === 1 ? "y" : "ies"} selected</span>
        <div className="flex gap-3">
          <button onClick={onClose} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 active:scale-95">Cancel</button>
          <button onClick={() => { setError(""); mutation.mutate({ startMonthKey: month, endMonthKey: month, properties: picked }); }}
            disabled={!picked.length || mutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Start Test Scrape
          </button>
        </div>
      </>}>
      <div className="px-6 py-4">
        <label className="mb-3 flex items-center gap-2 text-sm text-white/80 cursor-pointer">
          <input type="checkbox" checked={all} onChange={() => setPicked(all ? [] : mapped.map(p => p.property))} className="h-4 w-4 accent-sky-400" />
          Select all
        </label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {mapped.map(p => {
            const on = picked.includes(p.property);
            return (
              <label key={`${p.region}-${p.property}`}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${on ? "border-sky-400/70 bg-sky-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                <input type="checkbox" checked={on} onChange={() => setPicked(v => on ? v.filter(x => x !== p.property) : [...v, p.property])} className="h-4 w-4 accent-sky-400" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">{p.property}</span>
                  <span className="block text-[11px] text-white/50">{p.region}</span>
                </span>
              </label>
            );
          })}
        </div>
        {error && <div className="mt-3 rounded-lg border border-red-400/40 bg-red-900/40 px-3 py-2 text-sm text-red-200">{error}</div>}
      </div>
    </Modal>
  );
}

// ── Saved Runs ────────────────────────────────────────────────────────────────

export function SavedRunsModal({ onClose, onOpenMonth }: { onClose: () => void; onOpenMonth: (monthKey: string) => void }) {
  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.scraper.savedRuns.useQuery();
  const runs = data as Run[];
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const refresh = () => { utils.scraper.savedRuns.invalidate(); utils.scraper.activity.invalidate(); };
  const rename = trpc.scraper.rename.useMutation({ onSuccess: () => { setEditing(null); refresh(); } });
  const remove = trpc.scraper.remove.useMutation({ onSuccess: refresh });

  return (
    <Modal title="Saved Runs" subtitle={`${runs.length} finished scraper run${runs.length === 1 ? "" : "s"}. Deleting a run keeps its inspection data.`} icon={<Tag className="w-5 h-5 text-[#93b4d8]" />} onClose={onClose} width={860}
      footer={<><span /><button onClick={onClose} className="px-4 py-2 bg-[#1e2d4a] hover:bg-[#2a3f6b] text-white text-sm font-medium rounded-md active:scale-95">Close</button></>}>
      <div className="p-5">
        {isLoading ? <div className="text-sm text-gray-400 py-10 text-center">Loading…</div>
          : runs.length === 0 ? <div className="text-sm text-gray-500 py-10 text-center">No finished runs yet. Runs appear here when a scrape finishes.</div>
          : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b">
                  <th className="py-2 pr-2">Name</th><th className="py-2 pr-2">Range</th><th className="py-2 pr-2 text-center">Months</th>
                  <th className="py-2 pr-2 text-center">Passed</th><th className="py-2 pr-2 text-center">Issues</th><th className="py-2 pr-2 text-center">PDFs</th>
                  <th className="py-2 pr-2">Created</th><th />
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 align-middle">
                    <td className="py-2 pr-2">
                      {editing === r.id ? (
                        <form className="flex gap-1" onSubmit={e => { e.preventDefault(); if (draft.trim()) rename.mutate({ id: r.id, label: draft.trim() }); }}>
                          <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} aria-label="Run name"
                            className="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 outline-none" />
                          <button type="submit" title="Save name" className="rounded bg-emerald-600 text-white px-2"><Save className="w-3.5 h-3.5" /></button>
                          <button type="button" title="Cancel" onClick={() => setEditing(null)} className="rounded bg-gray-200 px-2"><XIcon className="w-3.5 h-3.5" /></button>
                        </form>
                      ) : (
                        <button onClick={() => onOpenMonth(r.endMonthKey)} className="text-left font-medium text-[#1e2d4a] hover:underline" title="Open this month">{r.label}</button>
                      )}
                      {r.status === "completed_with_errors" && <div className="text-[11px] text-amber-700">Completed with errors</div>}
                    </td>
                    <td className="py-2 pr-2 text-gray-600 whitespace-nowrap">{rangeLabel(r)}</td>
                    <td className="py-2 pr-2 text-center">{r.totalMonths}</td>
                    <td className="py-2 pr-2 text-center text-green-700 font-semibold">{r.passed}</td>
                    <td className="py-2 pr-2 text-center text-red-600 font-semibold">{r.failed}</td>
                    <td className="py-2 pr-2 text-center text-blue-600">{r.pdfs}</td>
                    <td className="py-2 pr-2 text-gray-500 whitespace-nowrap">{when(r.completedAt ?? r.startedAt)}</td>
                    <td className="py-2 whitespace-nowrap text-right">
                      <button title="Rename" onClick={() => { setEditing(r.id); setDraft(r.label); }} className="p-1.5 text-gray-400 hover:text-[#1e2d4a]"><Pencil className="w-4 h-4" /></button>
                      <button title="Delete run" onClick={() => { if (window.confirm(`Delete "${r.label}"? The inspection data it filed stays in the portal.`)) remove.mutate({ id: r.id }); }}
                        className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </Modal>
  );
}

// ── Naming ────────────────────────────────────────────────────────────────────

export function useNaming(): NamingSettings {
  const { data } = trpc.settings.naming.useQuery(undefined, { staleTime: 60_000 });
  return data ?? DEFAULT_NAMING;
}

export function NamingModal({ onClose, currentMonthKey }: { onClose: () => void; currentMonthKey: string }) {
  const utils = trpc.useUtils();
  const saved = useNaming();
  const [form, setForm] = useState<NamingSettings>(saved);
  useEffect(() => setForm(saved), [saved.runTemplate, saved.summaryPdfTemplate, saved.comparePdfTemplate]); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState("");
  const mutation = trpc.settings.setNaming.useMutation({
    onSuccess: () => { utils.settings.naming.invalidate(); onClose(); },
    onError: err => setError(errorText(err)),
  });
  const sample = {
    month: monthLabelOf(currentMonthKey),
    previous: monthLabelOf(shiftMonth(currentMonthKey, -1)),
    start: monthLabelOf(shiftMonth(currentMonthKey, -2)),
    end: monthLabelOf(currentMonthKey),
    count: 3,
  };
  const field = (key: keyof NamingSettings, label: string, help: string, pdf: boolean) => (
    <div>
      <label className="block text-sm font-semibold text-[#1e2d4a]" htmlFor={`naming-${key}`}>{label}</label>
      <p className="text-xs text-gray-500 mb-1.5">{help}</p>
      <input id={`naming-${key}`} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 outline-none" />
      <p className="mt-1 text-xs text-gray-400">Preview: <span className="text-gray-700 font-medium">{applyNamingTemplate(form[key], sample, DEFAULT_NAMING[key])}{pdf ? ".pdf" : ""}</span></p>
    </div>
  );
  return (
    <Modal title="Naming Conventions" subtitle="Control names for saved scraper runs and PDF downloads." icon={<Tag className="w-5 h-5 text-[#93b4d8]" />} onClose={onClose} width={620}
      footer={<>
        <button onClick={() => setForm(DEFAULT_NAMING)} className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"><RotateCcw className="w-3.5 h-3.5" /> Restore defaults</button>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-lg bg-white border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.runTemplate.trim() || !form.summaryPdfTemplate.trim() || !form.comparePdfTemplate.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">
            {mutation.isPending ? "Saving..." : "Save naming rules"}
          </button>
        </div>
      </>}>
      <div className="p-6 space-y-5">
        {field("runTemplate", "Saved scraper runs", "Used when you start a range with Run Scraper.", false)}
        {field("summaryPdfTemplate", "Summary PDF download", "Used when downloading the current month's Summary PDF.", true)}
        {field("comparePdfTemplate", "Compare PDF download", "Used when downloading the previous-month versus current-month comparison.", true)}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <b>Available placeholders:</b> {"{month}"}, {"{previous}"}, {"{start}"}, {"{end}"}, and {"{count}"}. PDF downloads automatically append <b>.pdf</b> and remove characters unsupported by file systems.
        </div>
        {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      </div>
    </Modal>
  );
}

// ── Pre-Due Reminders ─────────────────────────────────────────────────────────

export function preDueReportSpec(drafts: ReminderDraft[], monthLabel: string) {
  return {
    title: "Pre-Due Inspection Reminders",
    subtitle: `${monthLabel} · Due the 21st · ${drafts.reduce((n, d) => n + d.properties.length, 0)} properties not yet complete`,
    sections: drafts.map(d => ({
      title: `${d.regionalManager} — ${d.region}`,
      headers: ["Property", "Manager", "Ext.", "Email"],
      widths: [3, 3, 1, 4],
      rows: d.properties.map(p => [p.property, p.manager || "—", p.ext || "", p.email || "—"]),
    })),
    emptyMessage: "Every property is marked complete.",
  };
}

export function PreDueModal({ status, monthLabel, onClose }: { status: Status; monthLabel: string; onClose: () => void }) {
  const drafts = useMemo(() => buildPreDueReminders(status, monthLabel), [status, monthLabel]);
  const [active, setActive] = useState(0);
  const [edits, setEdits] = useState<Record<number, Partial<{ to: string; cc: string; subject: string; body: string }>>>({});
  const [copied, setCopied] = useState(false);
  const d = drafts[active];
  const cur = d ? { to: d.to, cc: d.cc.join(", "), subject: d.subject, body: d.body, ...edits[active] } : null;
  const set = (k: "to" | "cc" | "subject" | "body", v: string) => setEdits(e => ({ ...e, [active]: { ...e[active], [k]: v } }));

  const openMail = () => {
    if (!cur) return;
    const q = [`cc=${encodeURIComponent(cur.cc.replace(/\s+/g, ""))}`, `subject=${encodeURIComponent(cur.subject)}`, `body=${encodeURIComponent(cur.body)}`];
    window.open(`mailto:${encodeURIComponent(cur.to.trim())}?${q.join("&")}`, "_blank");
  };
  const copy = () => {
    if (!cur) return;
    navigator.clipboard.writeText(`To: ${cur.to}\nCC: ${cur.cc}\nSubject: ${cur.subject}\n\n${cur.body}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const printReport = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    w.document.write(`<!DOCTYPE html><html><head><title>Pre-Due Reminders — ${esc(monthLabel)}</title>
      <style>@page{size:letter portrait;margin:0.4in 0.5in} body{font-family:Arial,sans-serif;font-size:9pt} h1{font-size:14pt;margin:0} table{width:100%;border-collapse:collapse;margin:4px 0 12px} td,th{padding:3px 6px;border-bottom:1px solid #eee;text-align:left;font-size:8.5pt} th{color:#555}</style>
      </head><body><div style="background:#1e2d4a;color:white;padding:8px 12px;border-radius:4px;margin-bottom:10px"><h1>Pre-Due Inspection Reminders</h1><div style="color:#93b4d8;font-size:8pt">${esc(monthLabel)} · Due the 21st</div></div>
      ${drafts.map(x => `<div style="background:#f0f4f8;padding:3px 8px;font-weight:bold;font-size:8pt;text-transform:uppercase">${esc(x.regionalManager)} — ${esc(x.region)}</div>
        <table><tr><th>Property</th><th>Manager</th><th>Ext.</th><th>Email</th></tr>${x.properties.map(p => `<tr><td>${esc(p.property)}</td><td>${esc(p.manager || "—")}</td><td>${esc(p.ext)}</td><td>${esc(p.email || "—")}</td></tr>`).join("")}</table>`).join("")}
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const input = "w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 outline-none";
  return (
    <Modal title="Pre-Due Reminders" subtitle={`${monthLabel} · ${drafts.length} regional manager${drafts.length === 1 ? "" : "s"} · ${drafts.reduce((n, x) => n + x.properties.length, 0)} properties not yet complete`}
      icon={<BellRing className="w-5 h-5 text-[#93b4d8]" />} onClose={onClose} width={1000}
      footer={<>
        <div className="flex gap-2">
          <button onClick={() => downloadReportPdf(preDueReportSpec(drafts, monthLabel), `Pre-Due-Reminders-${monthLabel}`)} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-white border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"><Download className="w-4 h-4" /> Download PDF</button>
          <button onClick={printReport} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-white border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"><Printer className="w-4 h-4" /> Print report</button>
        </div>
        <button onClick={onClose} className="px-4 py-2 bg-[#1e2d4a] hover:bg-[#2a3f6b] text-white text-sm font-medium rounded-md">Close</button>
      </>}>
      {!d || !cur ? (
        <div className="py-14 text-center text-gray-600"><div className="text-4xl mb-2">✅</div>Every property is marked complete for {monthLabel}.</div>
      ) : (
        <div className="flex min-h-[420px]">
          <div className="w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto">
            {drafts.map((x, i) => (
              <button key={x.region} onClick={() => setActive(i)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 ${i === active ? "bg-[#1e2d4a] text-white" : "hover:bg-gray-100 text-gray-700"}`}>
                <div className="font-medium text-sm truncate">{x.regionalManager}</div>
                <div className={`text-xs mt-0.5 ${i === active ? "text-blue-200" : "text-gray-400"}`}>{x.region} · {x.properties.length} propert{x.properties.length === 1 ? "y" : "ies"}</div>
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-0 p-5 space-y-2.5">
            {(["to", "cc", "subject"] as const).map(k => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <span className="w-16 flex-shrink-0 text-gray-400 font-medium capitalize">{k === "cc" ? "CC" : k}:</span>
                <input value={cur[k]} onChange={e => set(k, e.target.value)} className={input} />
              </label>
            ))}
            <textarea value={cur.body} onChange={e => set("body", e.target.value)} aria-label="Email body" rows={16} className={`${input} font-sans leading-relaxed`} />
            <div className="flex gap-3 flex-wrap pt-1">
              <button onClick={openMail} className="flex items-center gap-2 px-4 py-2 bg-[#1e2d4a] hover:bg-[#2a3f6b] text-white text-sm font-medium rounded-md active:scale-95"><Mail className="w-4 h-4" /> Open in Email Client</button>
              <button onClick={copy} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-md active:scale-95">
                {copied ? <><Check className="w-4 h-4 text-green-600" /><span className="text-green-600">Copied!</span></> : <><Copy className="w-4 h-4" /> Copy Draft</>}
              </button>
              {edits[active] && <button onClick={() => setEdits(e => { const n = { ...e }; delete n[active]; return n; })} className="text-sm text-gray-500 hover:text-gray-800">Undo my edits</button>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Live console (the Manus "Run Scraper" log view) ─────────────────────────

function lineClass(line: string) {
  if (line.startsWith("━")) return "text-white font-bold mt-2";
  if (line.includes("✅")) return "text-emerald-400";
  if (line.includes("❌")) return "text-red-400";
  if (line.includes("⚠️")) return "text-yellow-400";
  if (line.includes("📄")) return "text-blue-400";
  if (line.includes("🔐")) return "text-purple-400";
  if (line.startsWith("[")) return "text-white/85";
  return "text-white/70";
}

export function RunConsoleModal({ runId, onClose }: { runId: number; onClose: () => void }) {
  const [lines, setLines] = useState<{ id: number; line: string }[]>([]);
  const [afterId, setAfterId] = useState(0);
  const [live, setLive] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const { data } = trpc.scraper.log.useQuery({ runId, afterId }, { refetchInterval: live ? 2000 : false });
  const run = data?.run as Run | null | undefined;
  const active = !run || run.status === "queued" || run.status === "running";

  useEffect(() => {
    if (!data) return;
    if (data.lines.length) {
      setLines(prev => {
        const seen = new Set(prev.map(l => l.id));
        return [...prev, ...data.lines.filter(l => !seen.has(l.id))];
      });
      setAfterId(data.lines[data.lines.length - 1].id);
    }
    // Keep polling until the run has finished and its last lines are in.
    if (data.run && !(data.run.status === "queued" || data.run.status === "running") && !data.lines.length) setLive(false);
  }, [data]);

  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines.length]);

  const done = run && !active;
  return (
    <Modal dark title={run?.label ?? "Run Scraper"} subtitle={run ? `${rangeLabel(run)} · ${run.completedMonths}/${run.totalMonths} month${run.totalMonths === 1 ? "" : "s"}` : undefined}
      icon={<Terminal className="w-5 h-5 text-emerald-400" />} onClose={onClose} width={640}
      footer={done ? (
        <>
          <span className="text-xs text-white/50">{run.completedAt ? `Finished ${when(run.completedAt)}` : ""}</span>
          <button onClick={onClose} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 active:scale-95">Close</button>
        </>
      ) : (
        <>
          <span className="text-xs text-white/50">You can close this; the run keeps going on the Mac.</span>
          <span className="flex items-center gap-2 text-sm text-white/80">
            <Loader2 className="h-4 w-4 animate-spin" /> {run?.status === "queued" ? "Waiting for the Mac runner…" : "Running, please wait..."}
          </span>
        </>
      )}>
      <div className="px-5 py-4 flex flex-col gap-3">
        <div ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
          className="bg-black/30 rounded-lg p-3 overflow-y-auto text-xs font-mono leading-relaxed" style={{ minHeight: 260, maxHeight: "55vh" }}>
          {lines.length === 0 && <div className="text-white/40">{!run ? "Loading…" : active ? "No log lines yet." : "No live log was recorded for this run."}</div>}
          {lines.map(l => <div key={l.id} className={`py-0.5 whitespace-pre-wrap break-words ${lineClass(l.line)}`}>{l.line}</div>)}
          {active && <div className="text-white/40 animate-pulse mt-1">Running...</div>}
        </div>
        {done && (
          <div className="bg-black/20 rounded-lg p-4 text-center">
            <p className="text-white font-semibold text-base mb-2">
              {run.status === "failed" ? "Scraper Failed" : run.status === "stalled" ? "No response from the Mac runner" : "Scraper Complete!"}
            </p>
            <div className="flex justify-center gap-6">
              <div><div className="text-2xl font-bold text-emerald-400">{run.passed}</div><div className="text-xs text-white/60">Passed</div></div>
              <div><div className="text-2xl font-bold text-red-400">{run.failed}</div><div className="text-xs text-white/60">Issues</div></div>
              <div><div className="text-2xl font-bold text-blue-400">{run.pdfs}</div><div className="text-xs text-white/60">PDFs</div></div>
            </div>
            {run.errorMessage && <p className="mt-3 text-xs text-red-300">{run.errorMessage}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
