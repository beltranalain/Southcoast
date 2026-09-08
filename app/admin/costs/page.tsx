"use client";

import { useEffect, useState } from "react";
import { getIdToken } from "@/lib/firebase";

type Row = { key: string; name: string; detail: string; cost: number | null; free: boolean };
type Usage = { configured: boolean; total: number; budget: number; breakdown: Row[]; prices: { storagePer1k: number; deliveryPer1k: number } };

function money(n: number | null) {
  if (n == null) return "-";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdminCosts() {
  const [data, setData] = useState<Usage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [budget, setBudget] = useState("");
  const [msg, setMsg] = useState("");
  // Per-show delivery estimator (works even before Cloudflare analytics are on).
  const [viewers, setViewers] = useState("50");
  const [minutes, setMinutes] = useState("120");
  const [shows, setShows] = useState("4");

  async function load() {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/usage", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      const d = await res.json();
      if (!res.ok) { setState("error"); return; }
      setData(d); setBudget(d.budget ? String(d.budget) : ""); setState("ready");
    } catch { setState("error"); }
  }
  useEffect(() => { load(); }, []);

  async function saveBudget() {
    setMsg("");
    const token = await getIdToken();
    const res = await fetch("/api/admin/usage", {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ budget: Number(budget) || 0 }),
    });
    const d = await res.json();
    if (d.saved) { setMsg("Budget saved."); setData((x) => (x ? { ...x, budget: d.budget } : x)); }
    else setMsg("Could not save.");
  }

  const total = data?.total ?? 0;
  const cap = data?.budget ?? 0;
  // Delivery = viewer-minutes * price-per-minute. WebRTC + HLS bill the same.
  const perMin = (data?.prices.deliveryPer1k ?? 1) / 1000;
  const v = Math.max(0, Number(viewers) || 0);
  const m = Math.max(0, Number(minutes) || 0);
  const s = Math.max(0, Number(shows) || 0);
  const perShow = v * m * perMin;
  const perMonth = perShow * s;
  const pct = cap > 0 ? Math.min(999, (total / cap) * 100) : 0;
  const level = cap === 0 ? "none" : pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok";

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Costs</h1>
          <div className="sub">Estimated monthly spend across your services. Set a budget to get an alert.</div>
        </div>
        <div className="admin-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={load}>Refresh</button>
        </div>
      </div>

      {state === "error" && <p className="form-error">Could not load usage.</p>}

      {state === "ready" && data && (
        <>
          {level === "over" && <div className="form-error" style={{ marginBottom: 16 }}><strong>Over budget.</strong> Estimated {money(total)} vs your {money(cap)} cap.</div>}
          {level === "warn" && <div className="notice" style={{ marginBottom: 16 }}><strong>Approaching your budget.</strong> {money(total)} of {money(cap)} ({Math.round(pct)}%).</div>}

          <div className="two-col">
            <div>
              <div className="panel">
                <h3>This month (estimated)</h3>
                <div className="cost-total">{money(total)}<span> / mo</span></div>
                {cap > 0 && (
                  <div className="budget-bar">
                    <div className={`budget-fill ${level}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                )}
                <div className="panel-sub" style={{ marginTop: 10 }}>
                  {cap > 0 ? `${Math.round(pct)}% of your ${money(cap)} budget` : "No budget set yet."} · Estimates only - the exact bill is in your Cloudflare dashboard.
                </div>
              </div>

              <div className="panel">
                <h3>Breakdown</h3>
                {data.breakdown.map((r) => (
                  <div className="dest-row" key={r.key}>
                    <div style={{ minWidth: 0 }}><div className="dest-name">{r.name}</div><div className="dest-meta">{r.detail}</div></div>
                    <span className={`cost-val${r.free ? " free" : ""}`}>{r.free ? "Free" : money(r.cost)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="panel">
                <h3>Monthly budget + alert</h3>
                <div className="panel-sub">You&apos;ll see a warning at 80% and an over-budget alert at 100%. (Soft cap - it warns, it doesn&apos;t shut anything off.)</div>
                <div className="form-field" style={{ marginTop: 12 }}>
                  <label>Budget (USD / month)</label>
                  <input type="number" min={0} step={5} value={budget} placeholder="e.g. 50" onChange={(e) => setBudget(e.target.value)} />
                </div>
                <button className="btn btn-primary btn-sm" type="button" onClick={saveBudget}>Save budget</button>
                {msg && <p className="form-ok" style={{ marginTop: 10 }}>{msg}</p>}
              </div>

              <div className="panel">
                <h3>Per-show cost estimator</h3>
                <div className="panel-sub">Streaming cost is viewer-minutes &times; {money(perMin)} per minute (WebRTC and HLS bill the same). Storage and everything else are separate.</div>
                <div className="est-grid" style={{ marginTop: 12 }}>
                  <div className="form-field">
                    <label>Avg. viewers</label>
                    <input type="number" min={0} step={10} value={viewers} onChange={(e) => setViewers(e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label>Show length (min)</label>
                    <input type="number" min={0} step={15} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label>Shows / month</label>
                    <input type="number" min={0} step={1} value={shows} onChange={(e) => setShows(e.target.value)} />
                  </div>
                </div>
                <div className="est-out">
                  <div><span>Per show</span><b>{money(perShow)}</b></div>
                  <div><span>Per month</span><b className="or">{money(perMonth)}</b></div>
                </div>
                <div className="panel-sub" style={{ marginTop: 8 }}>{v.toLocaleString()} viewers &times; {m.toLocaleString()} min = {(v * m).toLocaleString()} viewer-minutes per show.</div>
              </div>

              <div className="panel">
                <h3>How pricing works</h3>
                <div className="panel-sub">Cloudflare Stream is the only usage-based cost. Everything else is on a free tier at your scale.</div>
                <ul className="pricelist">
                  <li><span>Video storage</span><b>${data.prices.storagePer1k} / 1,000 min stored</b></li>
                  <li><span>Video delivery</span><b>${data.prices.deliveryPer1k} / 1,000 min watched</b></li>
                  <li><span>Firebase / YouTube / Workers / Vercel</span><b>Free tier</b></li>
                  <li><span>Stripe (tips)</span><b>~2.9% + 30¢ per tip</b></li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
