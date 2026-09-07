// Simple presentational bar chart (no client JS, no deps). Renders themed bars
// from a numeric series. Values are shown on hover via the native title.
export default function BarChart({
  data,
  labels,
  height = 170,
  format = (n: number) => String(n),
}: {
  data: number[];
  labels?: string[];
  height?: number;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data);
  const empty = data.every((v) => v === 0);

  return (
    <div className="chart">
      <div className="chart-bars" style={{ height }}>
        {data.map((v, i) => (
          <div className="chart-col" key={i} title={`${labels?.[i] ? labels[i] + ": " : ""}${format(v)}`}>
            <span className="chart-val">{v > 0 ? format(v) : ""}</span>
            <div className="chart-bar" style={{ height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      {labels && (
        <div className="chart-labels">
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
      {empty && <p className="chart-empty muted">No data yet.</p>}
    </div>
  );
}
