import { PRIMARY_CHANNEL } from "@/lib/channels";
import { getLiveInfo } from "@/lib/youtube";
import { getSiteConfig } from "@/lib/siteConfig";
import HomeMarquee from "@/components/HomeMarquee";

export default async function HomePage() {
  const [live, { schedule }] = await Promise.all([
    getLiveInfo(PRIMARY_CHANNEL.channelId),
    getSiteConfig(),
  ]);
  const next = schedule[0] ? { when: schedule[0].when, title: schedule[0].title, startsAt: schedule[0].startsAt ?? 0, cover: schedule[0].cover ?? "" } : null;

  return <HomeMarquee live={{ live: live.live, viewers: live.viewers }} nextShow={next} />;
}
