import "server-only";

// Cloudflare Realtime (SFU) server helpers. The app token stays server-side;
// the browser talks to Cloudflare only through /api/realtime.

const APP_ID = process.env.CLOUDFLARE_REALTIME_APP_ID;
const APP_TOKEN = process.env.CLOUDFLARE_REALTIME_APP_TOKEN;

export const realtimeConfigured = Boolean(APP_ID && APP_TOKEN);

const BASE = APP_ID ? `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}` : "";

export async function rtcFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${APP_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}
