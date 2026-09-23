// Shows a PIN pad until the portal's PIN has been entered on this browser.
import { useEffect, useRef, useState } from "react";
import { Delete, Lock } from "lucide-react";

const LENGTH = 4;

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");

  useEffect(() => {
    fetch("/api/pin/status", { credentials: "include" })
      .then(r => r.json())
      .then(s => setState(!s.required || s.unlocked ? "open" : "locked"))
      .catch(() => setState("open")); // the API itself still refuses without the PIN
  }, []);

  if (state === "checking") return <div className="min-h-screen bg-[#1e2d4a]" />;
  if (state === "open") return <>{children}</>;
  return <PinPad onUnlocked={() => setState("open")} />;
}

function PinPad({ onUnlocked }: { onUnlocked: () => void }) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (pin: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pin", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.unlocked) return onUnlocked();
      setError(out.error || "Wrong PIN.");
      setDigits("");
    } catch {
      setError("Couldn't reach the portal. Check your connection.");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  const press = (d: string) => {
    if (busy) return;
    const next = (digits + d).slice(0, LENGTH);
    setDigits(next);
    if (next.length === LENGTH) void submit(next);
  };

  return (
    <div className="min-h-screen bg-[#1e2d4a] flex items-center justify-center p-6" onClick={() => input.current?.focus()}>
      <div className="w-full max-w-xs text-center text-white">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
          <Lock className="h-6 w-6 text-[#93b4d8]" />
        </div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Monthly Inspections</h1>
        <p className="mt-1 text-sm text-[#93b4d8]">Enter the PIN to continue</p>

        <input
          ref={input}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="PIN"
          value={digits}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, "").slice(0, LENGTH);
            setDigits(v);
            if (v.length === LENGTH) void submit(v);
          }}
          className="sr-only"
        />
        <div className="my-6 flex justify-center gap-3" aria-hidden>
          {Array.from({ length: LENGTH }, (_, i) => (
            <span key={i} className={`h-4 w-4 rounded-full border-2 ${i < digits.length ? "border-emerald-400 bg-emerald-400" : "border-white/40"}`} />
          ))}
        </div>
        <p role="alert" className="h-5 text-sm text-red-300">{error}</p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
            <button key={d} onClick={() => press(d)} disabled={busy}
              className="h-14 rounded-xl bg-white/10 text-xl font-semibold hover:bg-white/20 active:scale-95 disabled:opacity-50">{d}</button>
          ))}
          <span />
          <button onClick={() => press("0")} disabled={busy}
            className="h-14 rounded-xl bg-white/10 text-xl font-semibold hover:bg-white/20 active:scale-95 disabled:opacity-50">0</button>
          <button onClick={() => setDigits(d => d.slice(0, -1))} aria-label="Delete digit" disabled={busy}
            className="flex h-14 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 active:scale-95">
            <Delete className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
