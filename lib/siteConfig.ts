import "server-only";

import { getAdminDb, adminConfigured } from "./firebaseAdmin";
import {
  DEFAULT_CONTENT,
  DEFAULT_BRANDING,
  SCHEDULE,
  type SiteContent,
  type SiteBranding,
  type ScheduleItem,
} from "./siteData";

export type SiteConfig = {
  content: SiteContent;
  branding: SiteBranding;
  schedule: ScheduleItem[];
};

const FALLBACK: SiteConfig = {
  content: DEFAULT_CONTENT,
  branding: DEFAULT_BRANDING,
  schedule: SCHEDULE,
};

// Reads editable content + branding + schedule from Firestore, merged over the
// defaults. Falls back to defaults when Firebase Admin is not configured.
export async function getSiteConfig(): Promise<SiteConfig> {
  if (!adminConfigured) return FALLBACK;
  try {
    const db = getAdminDb();
    if (!db) return FALLBACK;
    const [c, b, s] = await Promise.all([
      db.collection("site").doc("content").get(),
      db.collection("site").doc("branding").get(),
      db.collection("site").doc("schedule").get(),
    ]);
    const scheduleItems = s.exists ? (s.data()?.items as ScheduleItem[] | undefined) : undefined;
    return {
      content: { ...DEFAULT_CONTENT, ...(c.exists ? (c.data() as Partial<SiteContent>) : {}) },
      branding: { ...DEFAULT_BRANDING, ...(b.exists ? (b.data() as Partial<SiteBranding>) : {}) },
      schedule: Array.isArray(scheduleItems) ? scheduleItems : SCHEDULE,
    };
  } catch {
    return FALLBACK;
  }
}
