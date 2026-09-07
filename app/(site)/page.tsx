import { PRIMARY_CHANNEL } from "@/lib/channels";
import { getLiveInfo } from "@/lib/youtube";
import HomeMarquee from "@/components/HomeMarquee";

export default async function HomePage() {
  const live = await getLiveInfo(PRIMARY_CHANNEL.channelId);

  return <HomeMarquee live={{ live: live.live, viewers: live.viewers }} />;
}
