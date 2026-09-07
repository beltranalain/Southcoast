// Central content model. Today these are defaults baked into the app so it
// runs with zero setup. Once Firestore is connected, the admin Content and
// Branding sections write to it and these become the fallback.

export type NavItem = { href: string; label: string };

export const NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/live", label: "Live" },
  { href: "/shows", label: "Shows" },
  { href: "/library", label: "Library" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export const BRAND = {
  name: "Cane with a Camera",
  tagline: "Five shows. One camera.",
  host: "South Coast Cane",
  domain: "southcoastcane.com",
  accent: "#F5A524",
  emailGeneral: "hello@southcoastcane.com",
  emailBooking: "booking@southcoastcane.com",
};

export const HERO = {
  headlinePre: "Real stories from the ",
  headlineGlow: "South Coast",
  headlinePost: ", on our own stage.",
  intro:
    "Live broadcasts, original series, and the full Cane with a Camera 2.0 film family. Streaming on our own platform and on YouTube at the same time.",
  primaryLabel: "Watch Live",
  secondaryLabel: "Explore the Shows",
};

export type Series = {
  key: string;
  title: string;
  tag: string;
  badge: string;
  blurb: string;
  href: string;
  by: string;       // host / credit line
  category: string; // two-word slate label, e.g. "Live\nTalk"
  art: string;      // gradient art-well class: a1..a6
};

export const SERIES: Series[] = [
  {
    key: "cane-show",
    title: "The South Coast Cane Show",
    tag: "Flagship",
    badge: "Live talk",
    blurb:
      "Two hours of reaction, tape and whatever the chat drags in. No script, no rundown, no producer telling him to wrap.",
    href: "/live",
    by: "South Coast Cane",
    category: "Live\nTalk",
    art: "a2",
  },
  {
    key: "patio",
    title: "Patio Perspectives",
    tag: "Long-form",
    badge: "Long-form",
    blurb: "Unhurried, long-form conversation in the open air. Real perspectives, no studio polish.",
    href: "/library",
    by: "South Coast Cane",
    category: "Long\nForm",
    art: "a5",
  },
  {
    key: "one-thing",
    title: "Let Me Tell U 1 Thing",
    tag: "Short-form",
    badge: "Short-form",
    blurb: "Two people, one table, whatever came up that week. Under ten minutes, posted straight to the archive.",
    href: "/library",
    by: "The CEO and South Coast Cane",
    category: "Short\nForm",
    art: "a3",
  },
  {
    key: "riding",
    title: "Riding with South Coast Cane",
    tag: "On the road",
    badge: "On the road",
    blurb: "Windshield time and open-road thoughts, shot from the driver's seat. The show that moves with you.",
    href: "/library",
    by: "South Coast Cane",
    category: "On the\nRoad",
    art: "a4",
  },
  {
    key: "rise",
    title: "Rise of the Fall",
    tag: "Docu-series",
    badge: "Docu-series",
    blurb: "A documentary series told in chapters. The turns, the setbacks, and the comebacks.",
    href: "/library",
    by: "Chapter 4 in edit",
    category: "Docu\nSeries",
    art: "a6",
  },
];

export type DemoVideo = {
  title: string;
  seriesKey: string;
  seriesName: string;
  badge: string;
  duration: string;
};

// Placeholder library rows shown until real videos load from YouTube / Stream.
export const DEMO_VIDEOS: DemoVideo[] = [
  { title: "Season Opener: Back on the Coast", seriesKey: "cane-show", seriesName: "The South Coast Cane Show", badge: "The Cane Show", duration: "42:10" },
  { title: "Late Evening, Long Talk", seriesKey: "patio", seriesName: "Patio Perspectives", badge: "Patio", duration: "28:45" },
  { title: "The Long Way Home", seriesKey: "riding", seriesName: "Riding with South Coast Cane", badge: "Riding", duration: "19:02" },
  { title: "One Thing About Patience", seriesKey: "one-thing", seriesName: "Let Me Tell You One Thing", badge: "One Thing", duration: "06:31" },
  { title: "Chapter One: The Turn", seriesKey: "rise", seriesName: "Rise of the Fall", badge: "Rise", duration: "51:22" },
  { title: "Guests and Ground Rules", seriesKey: "cane-show", seriesName: "The South Coast Cane Show", badge: "The Cane Show", duration: "38:04" },
  { title: "Neighbors and Notes", seriesKey: "patio", seriesName: "Patio Perspectives", badge: "Patio", duration: "33:17" },
  { title: "Coast Highway at Dusk", seriesKey: "riding", seriesName: "Riding with South Coast Cane", badge: "Riding", duration: "24:50" },
];

export type ScheduleItem = { when: string; title: string; note: string; cover?: string; startsAt?: number; tz?: string };

// Empty by default - the creator adds real broadcasts in Studio -> Schedule.
export const SCHEDULE: ScheduleItem[] = [
];

// ---- Editable site configuration (admin -> Firestore -> public site) ----
// These shapes are what the admin Content and Branding pages read and write.
// DEFAULT_* are the fallback used in demo mode and before anything is saved.

export type SiteContent = {
  aboutText: string;
  emailGeneral: string;
  emailBooking: string;
};

export const DEFAULT_CONTENT: SiteContent = {
  aboutText:
    "An independent studio out of South Florida making five shows that have almost nothing in common. Live talk, long-form conversation, video shot from the driver's seat and a documentary series told in chapters. Some of it is about football. Most of it isn't. One person shoots it, cuts it and hosts it.\n\nBroadcasts go out live on this site and on YouTube at the same time, so the community that already follows along on YouTube never gets left behind, while the home base stays fully ours.",
  emailGeneral: BRAND.emailGeneral,
  emailBooking: BRAND.emailBooking,
};

export type SiteBranding = {
  siteName: string;
  tagline: string;
  domain: string;
  accent: string;
  background: string;
  live: string;
  logo: string; // data URL (resized client-side) or ""
  favicon: string; // data URL or ""
  showChannelBug: boolean; // permanent show-name label on the live page
  channelBug: string; // label text (falls back to the show name)
};

export const DEFAULT_BRANDING: SiteBranding = {
  siteName: BRAND.name,
  tagline: BRAND.tagline,
  domain: BRAND.domain,
  accent: "#F5A524",
  background: "#0A0908",
  live: "#E8402A",
  logo: "",
  favicon: "",
  showChannelBug: false,
  channelBug: "The South Coast Cane Show",
};

// Branded "scene": background behind the host, optional green-screen removal,
// plus a frame overlay + logo (like a TV broadcast look).
export type SiteScene = {
  enabled: boolean;
  mode: "none" | "chroma" | "ml"; // background removal: off / green-screen / AI
  chroma: string; // key color for green-screen
  background: string; // data URL
  frame: string; // transparent PNG overlay, data URL
  logo: string; // data URL (top-center)
};

export const DEFAULT_SCENE: SiteScene = {
  enabled: false,
  mode: "chroma",
  chroma: "#00b140",
  background: "",
  frame: "",
  logo: "",
};

export const LIBRARY_FILTERS = [
  { key: "all", label: "All" },
  { key: "cane-show", label: "The South Coast Cane Show" },
  { key: "rise", label: "Rise of the Fall" },
  { key: "patio", label: "Patio Perspectives" },
  { key: "riding", label: "Riding with South Coast Cane" },
  { key: "one-thing", label: "Let Me Tell You One Thing" },
];
