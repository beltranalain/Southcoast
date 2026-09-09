"use client";

import { useEffect, useState } from "react";
import { getIdToken } from "@/lib/firebase";

type Tip = { name: string; amount: number; message: string; ts: number };

const TIPS_ENABLED = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

function money(n: number) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function when(ts: number) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminTips() {
  const [tips, setTips] = useState<Tip[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "demo" | "error">("loading");

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/admin/tips", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
        const d = await res.json();
        if (!res.ok) { setState("error"); return; }
        if (!d.configured) { setState("demo"); return; }
        setTips(d.tips || []); setTotal(d.total || 0); setState("ready");
      } catch { setState("error"); }
    })();
  }, []);

  // Export every saved tip (permanent Firestore record) as a CSV file.
  function downloadCsv() {
    const rows = [
      ["Date", "Name", "Amount (USD)", "Message"],
      ...tips.map((t) => [new Date(t.ts).toISOString(), t.name, t.amount.toFixed(2), t.message || ""]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "tips.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const weekAgo = Date.now() - 7 * 86400000;
  const thisWeek = tips.filter((t) => t.ts >= weekAgo);
  const weekTotal = thisWeek.reduce((s, t) => s + t.amount, 0);
  const avg = tips.length ? total / tips.length : 0;

  const kpis = [
    { n: money(total), label: "Total raised" },
    { n: String(tips.length), label: "Tips received" },
    { n: money(weekTotal), label: "This week" },
    { n: money(avg), label: "Average tip" },
  ];

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Tips</h1>
          <div className="sub">Money viewers have sent during your shows. Payouts land in your Stripe account.</div>
        </div>
        {state === "ready" && tips.length > 0 && (
          <div className="admin-actions">
            <button className="btn btn-ghost btn-sm" type="button" onClick={downloadCsv}>Download CSV</button>
          </div>
        )}
      </div>

      {!TIPS_ENABLED && (
        <div className="notice" style={{ marginBottom: 18 }}>
          <strong>Tipping isn&apos;t switched on yet.</strong> Add your Stripe keys (and the webhook) to start taking tips. This page fills in as tips come in.
        </div>
      )}

      {state === "ready" && (
        <div className="kpis" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          {kpis.map((k) => (
            <div className="kpi" key={k.label}><div className="kpi-n">{k.n}</div><div className="kpi-l">{k.label}</div></div>
          ))}
        </div>
      )}

      <div className="panel">
        <h3>Recent tips</h3>
        {state === "loading" && <p className="muted" style={{ fontSize: 13 }}>Loading...</p>}
        {state === "demo" && <p className="muted" style={{ fontSize: 13 }}>Connect Firebase to track tips.</p>}
        {state === "error" && <p className="form-error">Could not load tips.</p>}
        {state === "ready" && tips.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No tips yet. When a viewer tips during a show, it shows up here.</p>}
        {state === "ready" && tips.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {tips.map((t, i) => (
              <div className="tip-log" key={i}>
                <span className="tip-log-amt">{money(t.amount)}</span>
                <div className="tip-log-mid">
                  <div className="tip-log-name">{t.name}</div>
                  {t.message && <div className="tip-log-msg">{t.message}</div>}
                </div>
                <span className="tip-log-when muted">{when(t.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
