import { PRIMARY_CHANNEL } from "@/lib/channels";
import { getLiveInfo } from "@/lib/youtube";
import { getSiteConfig } from "@/lib/siteConfig";
import HomeMarquee from "@/components/HomeMarquee";

export default async function HomePage() {
  const [live, { schedule }] = await Promise.all([
    getLiveInfo(PRIMARY_CHANNEL.channelId),
    getSiteConfig(),
  ]);
  const shows = [...schedule]
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))
    .map((it) => ({ when: it.when, title: it.title, startsAt: it.startsAt ?? 0, cover: it.cover ?? "" }));

  return <HomeMarquee live={{ live: live.live, viewers: live.viewers }} schedule={shows} />;
}
