import "server-only";

import { getAdminDb, adminConfigured } from "./firebaseAdmin";
import {
  DEFAULT_CONTENT,
  DEFAULT_BRANDING,
  DEFAULT_SCENE,
  DEFAULT_BUMPER,
  DEFAULT_SOUNDS,
  DEFAULT_RUNDOWN,
  SCHEDULE,
  type SiteContent,
  type SiteBranding,
  type SiteScene,
  type SiteBumper,
  type SoundPad,
  type SiteRundown,
  type ScheduleItem,
} from "./siteData";

export type SiteConfig = {
  content: SiteContent;
  branding: SiteBranding;
  schedule: ScheduleItem[];
  scene: SiteScene;
  bumper: SiteBumper;
  sounds: SoundPad[];
  rundown: SiteRundown;
};

const FALLBACK: SiteConfig = {
  content: DEFAULT_CONTENT,
  branding: DEFAULT_BRANDING,
  schedule: SCHEDULE,
  scene: DEFAULT_SCENE,
  bumper: DEFAULT_BUMPER,
  sounds: DEFAULT_SOUNDS,
  rundown: DEFAULT_RUNDOWN,
};

// Reads editable content + branding + schedule from Firestore, merged over the
// defaults. Falls back to defaults when Firebase Admin is not configured.
export async function getSiteConfig(): Promise<SiteConfig> {
  if (!adminConfigured) return FALLBACK;
  try {
    const db = getAdminDb();
    if (!db) return FALLBACK;
    const [c, b, s, sc, bm, sd, rd] = await Promise.all([
      db.collection("site").doc("content").get(),
      db.collection("site").doc("branding").get(),
      db.collection("site").doc("schedule").get(),
      db.collection("site").doc("scene").get(),
      db.collection("site").doc("bumper").get(),
      db.collection("site").doc("sounds").get(),
      db.collection("site").doc("rundown").get(),
    ]);
    const scheduleItems = s.exists ? (s.data()?.items as ScheduleItem[] | undefined) : undefined;
    const soundItems = sd.exists ? (sd.data()?.items as SoundPad[] | undefined) : undefined;
    return {
      content: { ...DEFAULT_CONTENT, ...(c.exists ? (c.data() as Partial<SiteContent>) : {}) },
      branding: { ...DEFAULT_BRANDING, ...(b.exists ? (b.data() as Partial<SiteBranding>) : {}) },
      schedule: Array.isArray(scheduleItems) ? scheduleItems : SCHEDULE,
      scene: { ...DEFAULT_SCENE, ...(sc.exists ? (sc.data() as Partial<SiteScene>) : {}) },
      bumper: { ...DEFAULT_BUMPER, ...(bm.exists ? (bm.data() as Partial<SiteBumper>) : {}) },
      sounds: Array.isArray(soundItems) ? soundItems : DEFAULT_SOUNDS,
      rundown: { ...DEFAULT_RUNDOWN, ...(rd.exists ? (rd.data() as Partial<SiteRundown>) : {}) },
    };
  } catch {
    return FALLBACK;
  }
}
