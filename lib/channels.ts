// Real YouTube channel identifiers for South Coast Cane.
// uploadsPlaylist = channel ID with the "UC" prefix swapped for "UU".

export type Channel = {
  key: string;
  name: string;
  handle: string;
  url: string;
  channelId: string;
  uploadsPlaylist: string;
};

function uploads(channelId: string): string {
  return "UU" + channelId.slice(2);
}

export const CHANNELS: Channel[] = [
  {
    key: "cane-show",
    name: "The South Coast Cane Show",
    handle: "@SouthCoastCaneShow",
    url: "https://www.youtube.com/@SouthCoastCaneShow",
    channelId: "UC_HAwaQ2BKMPGClxLv9UXvw",
    uploadsPlaylist: uploads("UC_HAwaQ2BKMPGClxLv9UXvw"),
  },
  {
    key: "south-coast-cane",
    name: "Retro South Coast Cane",
    handle: "@SouthCoastCane",
    url: "https://www.youtube.com/@SouthCoastCane",
    channelId: "UCQhsILAXiBaCPVHjg-8RNhg",
    uploadsPlaylist: uploads("UCQhsILAXiBaCPVHjg-8RNhg"),
  },
  {
    key: "one-thing",
    name: "Let Me Tell You One Thing",
    handle: "@LetMeTellU1Thing",
    url: "https://www.youtube.com/@LetMeTellU1Thing",
    channelId: "UCWNtkswImE6nmxNkGOGtGzg",
    uploadsPlaylist: uploads("UCWNtkswImE6nmxNkGOGtGzg"),
  },
];

// The channel whose live stream anchors the public Live page.
export const PRIMARY_CHANNEL = CHANNELS[0];

export function channelByKey(key: string): Channel | undefined {
  return CHANNELS.find((c) => c.key === key);
}
