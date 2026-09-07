// Read-only integration status. Reflects which services have their keys set in
// the server environment (Vercel env vars / Cloudflare). Never shows secret
// values - secrets live in env vars, not in the dashboard.
const INTEGRATIONS = [
  {
    name: "Firebase",
    detail: "Admin sign-in, content, and image storage",
    ok: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.FIREBASE_ADMIN_PROJECT_ID),
  },
  {
    name: "YouTube Data API",
    detail: "Pulls real videos and live status",
    ok: Boolean(process.env.YOUTUBE_API_KEY),
  },
  {
    name: "Cloudflare Stream",
    detail: "Live ingest, simulcast, and video storage",
    ok: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_STREAM_API_TOKEN),
  },
  {
    name: "Live chat (Cloudflare Durable Objects)",
    detail: "Real-time chat Worker",
    ok: Boolean(process.env.NEXT_PUBLIC_CHAT_WS_URL),
  },
  {
    name: "Contact email (Resend)",
    detail: "Delivers contact-form messages",
    ok: Boolean(process.env.RESEND_API_KEY),
  },
];

export default function AdminSettings() {
  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Settings</h1>
          <div className="sub">Connections and platform basics.</div>
        </div>
      </div>

      <div className="two-col">
        <div>
          <div className="panel">
            <h3>Integrations</h3>
            <div className="panel-sub">
              Managed by your developer through secure environment variables. This view is
              read-only - no keys are shown here.
            </div>
            {INTEGRATIONS.map((i) => (
              <div className="dest-row" key={i.name}>
                <div>
                  <div className="dest-name">{i.name}</div>
                  <div className="dest-meta">{i.detail}</div>
                </div>
                <span className={`pill ${i.ok ? "published" : "draft"}`}>
                  {i.ok ? "Connected" : "Not connected"}
                </span>
              </div>
            ))}
          </div>
          <div className="panel">
            <h3>Brand</h3>
            <div className="panel-sub">Edit names and colors under Branding. Saved changes apply site-wide.</div>
            <div className="panel-split">
              <div className="form-field"><label>Site name</label><input type="text" defaultValue="South Coast Cane" readOnly /></div>
              <div className="form-field"><label>Domain</label><input type="text" defaultValue="southcoastcane.com" readOnly /></div>
            </div>
          </div>
        </div>
        <div>
          <div className="panel">
            <h3>Live defaults</h3>
            <div className="panel-sub">Applied to every new broadcast.</div>
            <div className="dest-row">
              <div><div className="dest-name">Auto-simulcast to YouTube</div><div className="dest-meta">On by default</div></div>
              <label className="toggle"><input type="checkbox" defaultChecked /><span className="track" /></label>
            </div>
            <div className="dest-row">
              <div><div className="dest-name">Auto-save broadcasts to library</div><div className="dest-meta">Recording kept as VOD</div></div>
              <label className="toggle"><input type="checkbox" defaultChecked /><span className="track" /></label>
            </div>
            <div className="dest-row">
              <div><div className="dest-name">Enable live chat</div><div className="dest-meta">On the live page</div></div>
              <label className="toggle"><input type="checkbox" defaultChecked /><span className="track" /></label>
            </div>
          </div>
          <div className="panel">
            <h3>Account</h3>
            <div className="panel-sub">Your Studio sign-in.</div>
            <div className="form-field"><label>Email</label><input type="email" defaultValue="creator@southcoastcane.com" /></div>
            <button className="btn btn-ghost btn-sm" type="button">Change password</button>
          </div>
        </div>
      </div>
    </>
  );
}
