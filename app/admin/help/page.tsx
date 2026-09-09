// Admin SOP / operating guide. Static content - explains every Studio page:
// purpose, how to use, do / don't. Visible to every role.

type Section = {
  id: string;
  title: string;
  purpose: string;
  use: string[];
  dos: string[];
  donts: string[];
};

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "Overview",
    purpose: "Your dashboard at a glance - real numbers pulled live from your connected services (no fake data).",
    use: [
      "Read the stat cards: site users, YouTube subscribers, total views, videos, revenue (tips), estimated cost per show, and live status.",
      "Scan the 14-day charts for revenue and new sign-ups, and the per-channel subscriber/view bars.",
      "Use it as your daily pulse - if a number looks wrong, check the matching page (Tips, Users, Analytics).",
    ],
    dos: ["Check it before and after a broadcast to see impact.", "Trust it - everything here is real, from Firebase / YouTube / Stripe."],
    donts: ["Don't expect numbers you haven't connected (e.g. YouTube stats need the YouTube key).", "Don't treat 'Est. cost / show' as a bill - it's an estimate (see Costs)."],
  },
  {
    id: "go-live",
    title: "Go Live (the Studio)",
    purpose: "Run your whole show from the browser - camera, guests, graphics, and going live to your site + simulcast, all composited into one program feed.",
    use: [
      "Pick your Camera and Microphone from the dropdowns. Use Camera / Mic on-off to release the devices when you're not using them (the webcam light goes off).",
      "Choose a layout: Grid (equal tiles) or Spotlight (one big + a side strip).",
      "Press Go Live to broadcast. The red 'Stop broadcast' ends it. 'Open live page' shows what viewers see.",
      "Tabs on the right: On air (banners + pinned comments), Chat (moderate + clear), Guests (invite/admit/mute), Scene (branded background + green screen), Intro (starting-soon bumper), Sounds (soundboard), Sources (simulcast destinations).",
      "Record locally saves a copy of the program to your computer.",
    ],
    dos: ["Do a 30-second test broadcast before an important show.", "Turn the camera off when you step away.", "Add your simulcast destinations (Sources) before going live."],
    donts: ["Don't rely on screen-share from a phone - it's desktop only.", "Don't close the browser tab while live - it ends the broadcast.", "Don't run 8+ guests on a weak laptop - browser compositing is heavy."],
  },
  {
    id: "guests",
    title: "Go Live - Guests",
    purpose: "Bring people onto the show from their own browser (no software to install).",
    use: [
      "Copy the invite link from the Guests tab and send it to your guest.",
      "They open it, pick camera/mic, and land in the green room. You'll see them under 'In the room'.",
      "Click Admit to put them on the program; Remove takes them off.",
      "Use Mute (per guest) or Mute all to silence guests instantly without dropping them.",
    ],
    dos: ["Admit guests one at a time so you can frame the layout.", "Mute guests who aren't speaking to cut background noise."],
    donts: ["Don't share the invite link publicly - anyone with it can join the green room.", "Don't forget to Remove guests when they leave."],
  },
  {
    id: "scene-intro-sounds",
    title: "Go Live - Scene, Intro & Sounds",
    purpose: "Make the broadcast look and sound produced: branded background, a 'starting soon' bumper, and sound effects.",
    use: [
      "Scene: put yourself over a background with green-screen or the AI virtual background, add a frame + logo, and a rotating news ticker.",
      "Intro: show a branded 'Starting soon' card (or a looping intro video) before the show starts - great for early arrivers.",
      "Sounds: upload short clips as pads; tap to play them into the broadcast + your monitor.",
    ],
    dos: ["Light an even green screen for the cleanest key.", "Keep sound clips short (stings, applause).", "Use the Intro card while you get set up."],
    donts: ["Don't use a huge background image - keep it reasonable so it saves.", "Don't paste a random MP4 as the intro video - it must be a CORS-enabled URL (e.g. a Cloudflare Stream download link) or it won't play."],
  },
  {
    id: "sources",
    title: "Go Live - Sources (Simulcast)",
    purpose: "Send your broadcast out to other platforms at the same time (YouTube, Facebook, Twitch, or any RTMP).",
    use: [
      "Pick a preset or Custom, paste the platform's RTMP URL + stream key, and add it.",
      "Toggle a destination on/off to pause it without deleting; Remove deletes it.",
      "This runs server-side on Cloudflare - it doesn't use your computer's upload.",
    ],
    dos: ["Add destinations before going live.", "Double-check the stream key from each platform."],
    donts: ["Don't share your stream keys.", "Don't expect LinkedIn/Kick/etc. presets - use Custom with the per-broadcast URL those platforms give you."],
  },
  {
    id: "videos",
    title: "Videos",
    purpose: "Your library - real YouTube uploads plus videos saved to Cloudflare Stream (recordings and direct uploads).",
    use: [
      "Browse the merged list (newest first). The Source tag shows YouTube or Cloudflare.",
      "Upload video: pick a file - it uploads straight to Cloudflare Stream and appears here once processed.",
      "Open plays the video (YouTube link or the Cloudflare player).",
    ],
    dos: ["Wait a minute after upload for Cloudflare to finish processing, then refresh.", "Keep auto-save on (Settings) so broadcasts land here automatically."],
    donts: ["Don't upload enormous files casually - Cloudflare storage has a per-minute cost (see Costs)."],
  },
  {
    id: "schedule",
    title: "Schedule",
    purpose: "Publish upcoming broadcasts. These show a live countdown on the Home + Live pages and drive the cost estimator.",
    use: [
      "Add a broadcast: date, time, timezone, show name, optional note and cover image.",
      "It saves automatically and sorts soonest-first. Viewers see a countdown.",
      "Use 'Go live' on an item to jump straight into the Studio; 'Clear expired' removes past shows.",
    ],
    dos: ["Set the correct timezone - viewers see it converted to their own.", "Add a cover image for a polished look."],
    donts: ["Don't leave stale past shows up - clear them.", "Don't forget the schedule feeds the shows/month cost estimate."],
  },
  {
    id: "content",
    title: "Content",
    purpose: "Edit the words on your public site - about text, contact emails, and your show/series info.",
    use: ["Update the About paragraph and the general/booking emails.", "Manage the series that appear on the Shows page."],
    dos: ["Keep the About text current.", "Use a real inbox for the contact emails."],
    donts: ["Don't paste secrets here - it's public site copy."],
  },
  {
    id: "branding",
    title: "Branding",
    purpose: "Your look - logo, favicon, site name, tagline, domain, and accent/background/live colors. Applies site-wide instantly.",
    use: [
      "Upload a logo and favicon (they're resized for you).",
      "Set the site name, tagline, and colors; toggle the show-name channel bug.",
      "The logo also appears on the studio 'Camera off' card and the off-air player.",
    ],
    dos: ["Use a transparent PNG logo.", "Pick an accent color with good contrast on dark."],
    donts: ["Don't upload huge images - they're stored inline; keep them reasonable."],
  },
  {
    id: "users",
    title: "Users",
    purpose: "Your viewers - the accounts that sign in to chat. This is NOT your staff (that's Team).",
    use: [
      "See who signed up, how (Google/email), and when.",
      "Moderate: timeout (pick a duration), ban, or remove a viewer from chat.",
    ],
    dos: ["Timeout first for minor issues; ban for repeat offenders.", "Remember bans are by account, so they must be signed in."],
    donts: ["Don't confuse Users (viewers) with Team (your staff).", "Don't ban someone you only want to pause - use timeout."],
  },
  {
    id: "tips",
    title: "Tips",
    purpose: "Every donation, saved permanently - who, how much, their message, and when. Payouts land in your Stripe account.",
    use: [
      "Read the KPIs (total, count, this week, average) and the full list with messages.",
      "Download CSV to export all donations for your records/accounting.",
      "Turn tips on/off in Settings (Accept tips) to show/hide the tip buttons.",
    ],
    dos: ["Export a CSV periodically for your books.", "Know this record is separate from chat - clearing chat never deletes a donation."],
    donts: ["Don't look for payouts here - money settles in Stripe."],
  },
  {
    id: "costs",
    title: "Costs",
    purpose: "Estimate your monthly spend and set a soft budget alert. Cloudflare Stream is the only usage-based cost; everything else is free-tier at your scale.",
    use: [
      "See the estimated monthly total + breakdown. Set a budget to get an 80% warning and a 100% alert.",
      "Use the per-show estimator (auto-filled from your schedule, recordings, and typical viewers) to see cost per show.",
      "Add 'Account Analytics Read' to your Cloudflare token to see real delivered-minutes; until then it estimates.",
    ],
    dos: ["Set a budget so you're never surprised.", "Save your 'typical viewers' so the estimate stays accurate."],
    donts: ["Don't treat estimates as the exact bill - the authoritative number is in your Cloudflare dashboard."],
  },
  {
    id: "analytics",
    title: "Analytics",
    purpose: "Audience stats from the YouTube Data API - subscribers, views, video counts, and recent uploads per channel.",
    use: ["Review growth across your channels.", "Cross-check against Overview."],
    dos: ["Use it to see which channel is growing."],
    donts: ["Don't expect on-site viewer analytics here - that's a future add."],
  },
  {
    id: "settings",
    title: "Settings",
    purpose: "Connections and platform basics. Confirms each service is working and holds a few defaults.",
    use: [
      "Integrations: each service is pinged live (Working / Error / Not set up). Keys live in environment variables, never shown here.",
      "Live defaults: auto-simulcast, auto-save broadcasts to library, enable live chat, and Accept tips (hides tip buttons when off).",
      "Appearance: light/dark theme for the studio on this device. Account: your sign-in email + change password.",
    ],
    dos: ["Re-check after changing any keys.", "Keep 'auto-save broadcasts' on if you want a library (adds storage cost)."],
    donts: ["Don't expect to paste keys here - they're managed securely in environment variables."],
  },
  {
    id: "team",
    title: "Team (owners only)",
    purpose: "Add staff and control what each can do. This is how you run a studio with more than one person.",
    use: [
      "Add a team member by email and pick a role: Owner, Manager, Host, or Moderator.",
      "Change a role or remove a member anytime. Your protected owner accounts can't be removed.",
      "A member signs in with that email (Google or email/password) and only sees what their role allows.",
    ],
    dos: ["Give streamers the Host role (Go Live + Schedule + Videos only).", "Keep Owner for the few people who manage everything."],
    donts: ["Don't give everyone Owner - use the least access needed.", "Don't share one login - add each person to the Team."],
  },
];

const ROLE_ROWS: { role: string; sees: string }[] = [
  { role: "Owner", sees: "Everything, including Team management and billing/branding." },
  { role: "Manager", sees: "Everything except Team management." },
  { role: "Host", sees: "Go Live, Schedule, Videos - runs and schedules shows. No admin/business pages." },
  { role: "Moderator", sees: "Go Live and Users - runs the show and moderates chat/viewers." },
];

export default function AdminHelp() {
  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Help &amp; SOP</h1>
          <div className="sub">How the Studio works - what each page is for, how to use it, and what to avoid.</div>
        </div>
      </div>

      <div className="panel">
        <h3>First broadcast, step by step</h3>
        <ol className="sop-steps">
          <li><b>Branding</b> - set your logo, name, and colors.</li>
          <li><b>Schedule</b> - add your show so viewers get a countdown.</li>
          <li><b>Go Live &rarr; Sources</b> - add YouTube/other simulcast destinations (optional).</li>
          <li><b>Go Live</b> - pick camera + mic, choose a layout, invite guests if any.</li>
          <li>Optional: set an <b>Intro</b> "starting soon" card and a <b>Scene</b> background.</li>
          <li>Press <b>Go Live</b>. Moderate from the <b>Chat</b> tab. Press <b>Stop broadcast</b> when done.</li>
          <li>If auto-save is on, the recording lands in <b>Videos</b>.</li>
        </ol>
      </div>

      <div className="panel">
        <h3>Roles - who can see what</h3>
        <div className="panel-sub">Set roles under Team. Access is enforced everywhere - a limited role literally cannot open the pages it&apos;s not allowed to.</div>
        <div style={{ marginTop: 8 }}>
          {ROLE_ROWS.map((r) => (
            <div className="dest-row" key={r.role}>
              <div style={{ minWidth: 0 }}><div className="dest-name">{r.role}</div><div className="dest-meta">{r.sees}</div></div>
            </div>
          ))}
        </div>
      </div>

      {SECTIONS.map((s) => (
        <div className="panel" id={s.id} key={s.id}>
          <h3>{s.title}</h3>
          <div className="panel-sub">{s.purpose}</div>
          <div className="sop-block">
            <div className="sop-label">How to use</div>
            <ul className="sop-list">{s.use.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <div className="sop-cols">
            <div className="sop-block">
              <div className="sop-label ok">Do</div>
              <ul className="sop-list">{s.dos.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <div className="sop-block">
              <div className="sop-label bad">Don&apos;t</div>
              <ul className="sop-list">{s.donts.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          </div>
        </div>
      ))}

      <div className="panel">
        <h3>Quick troubleshooting</h3>
        <ul className="sop-list">
          <li><b>Camera stays on / light won&apos;t turn off:</b> use Camera off in Go Live - it releases the device.</li>
          <li><b>Guest not showing:</b> make sure you clicked Admit, and that they allowed camera/mic in their browser.</li>
          <li><b>Tips button missing:</b> check Settings &rarr; Accept tips is on and Stripe shows Working.</li>
          <li><b>Costs delivery shows a dash:</b> add "Account Analytics Read" to your Cloudflare token.</li>
          <li><b>A page says loading / bounces you:</b> your role doesn&apos;t have access - ask an Owner.</li>
          <li><b>Old chat keeps showing:</b> it resets on Go Live, or use Clear chat in the Chat tab.</li>
        </ul>
      </div>
    </>
  );
}
