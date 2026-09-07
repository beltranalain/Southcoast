import "server-only";

// Server-side YouTube Data API v3 helpers. The API key stays on the server.
// Every function degrades gracefully (returns empty / null) when no key is set.

const API = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY;

export const youtubeConfigured = Boolean(KEY);

export type YtVideo = {
  id: string;
  title: string;
  publishedAt: string;
  thumbnail: string;
};

export async function getUploads(
  uploadsPlaylistId: string,
  max = 12
): Promise<YtVideo[]> {
  if (!KEY) return [];
  const url = `${API}/playlistItems?part=snippet&maxResults=${max}&playlistId=${uploadsPlaylistId}&key=${KEY}`;
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((item: any) => {
      const s = item.snippet ?? {};
      const t = s.thumbnails ?? {};
      return {
        id: s.resourceId?.videoId ?? "",
        title: s.title ?? "",
        publishedAt: s.publishedAt ?? "",
        thumbnail: (t.medium ?? t.high ?? t.default ?? {}).url ?? "",
      } as YtVideo;
    });
  } catch {
    return [];
  }
}

// Returns the videoId of an active live broadcast for a channel, or null.
export async function getLiveVideoId(channelId: string): Promise<string | null> {
  if (!KEY) return null;
  const url = `${API}/search?part=id&channelId=${channelId}&eventType=live&type=video&key=${KEY}`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.items?.[0]?.id?.videoId ?? null;
  } catch {
    return null;
  }
}

export type LiveInfo = { live: boolean; videoId: string | null; viewers: number | null };

// Whether a channel is live right now, plus concurrent viewers if available.
export async function getLiveInfo(channelId: string): Promise<LiveInfo> {
  const videoId = await getLiveVideoId(channelId);
  if (!videoId || !KEY) return { live: Boolean(videoId), videoId, viewers: null };
  try {
    const res = await fetch(
      `${API}/videos?part=liveStreamingDetails&id=${videoId}&key=${KEY}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return { live: true, videoId, viewers: null };
    const data = await res.json();
    const c = data.items?.[0]?.liveStreamingDetails?.concurrentViewers;
    return { live: true, videoId, viewers: c ? Number(c) : null };
  } catch {
    return { live: true, videoId, viewers: null };
  }
}

export type ChannelStats = { subscribers: number; views: number; videos: number };

// Aggregate statistics across one or more channels (one API call).
export async function getAllStats(channelIds: string[]): Promise<ChannelStats | null> {
  if (!KEY || channelIds.length === 0) return null;
  const url = `${API}/channels?part=statistics&id=${channelIds.join(",")}&key=${KEY}`;
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const data = await res.json();
    let subscribers = 0, views = 0, videos = 0;
    for (const it of data.items ?? []) {
      const s = it.statistics ?? {};
      subscribers += Number(s.subscriberCount || 0);
      views += Number(s.viewCount || 0);
      videos += Number(s.videoCount || 0);
    }
    return { subscribers, views, videos };
  } catch {
    return null;
  }
}

export type ChannelStatRow = { channelId: string; subscribers: number; views: number; videos: number };

// Per-channel statistics (for comparison charts). One API call.
export async function getStatsByChannel(channelIds: string[]): Promise<ChannelStatRow[]> {
  if (!KEY || channelIds.length === 0) return [];
  const url = `${API}/channels?part=statistics&id=${channelIds.join(",")}&key=${KEY}`;
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((it: any) => ({
      channelId: String(it.id || ""),
      subscribers: Number(it.statistics?.subscriberCount || 0),
      views: Number(it.statistics?.viewCount || 0),
      videos: Number(it.statistics?.videoCount || 0),
    }));
  } catch {
    return [];
  }
}
