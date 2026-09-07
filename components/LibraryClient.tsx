"use client";

import { useEffect, useState } from "react";
import { CHANNELS } from "@/lib/channels";

type YtVideo = { id: string; title: string; publishedAt: string; thumbnail: string };

export default function LibraryClient() {
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [videos, setVideos] = useState<YtVideo[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "ready">("idle");

  const playerSrc = `https://www.youtube.com/embed/videoseries?list=${channel.uploadsPlaylist}`;

  useEffect(() => {
    let active = true;
    setState("loading");
    fetch(`/api/youtube?type=uploads&channel=${channel.key}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const items: YtVideo[] = data?.items ?? [];
        setVideos(items);
        setState(items.length ? "ready" : "empty");
      })
      .catch(() => active && setState("empty"));
    return () => { active = false; };
  }, [channel]);

  return (
    <div className="wrap">
      <span className="eyebrow">Straight from YouTube</span>
      <h2 className="anton big" style={{ marginBottom: 20 }}>Now<br /><span className="or">playing</span></h2>
      <div className="filters">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            className={`filter-btn${channel.key === c.key ? " active" : ""}`}
            onClick={() => setChannel(c)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="player-wrap" style={{ marginBottom: 60 }}>
        <iframe
          key={channel.key}
          src={playerSrc}
          title={`${channel.name} uploads`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <span className="eyebrow">On-demand archive</span>
      <h2 className="anton big" style={{ marginBottom: 20 }}>Recent<br /><span className="or">episodes</span></h2>

      {state === "ready" && (
        <div className="grid grid-4">
          {videos.map((v) => (
            <a
              key={v.id}
              className="tile"
              href={`https://www.youtube.com/watch?v=${v.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="timg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div className="tb">
                <h3>{v.title}</h3>
                <p>{channel.name}</p>
              </div>
            </a>
          ))}
        </div>
      )}

      {state === "loading" && <p className="muted">Loading episodes...</p>}

      {state === "empty" && (
        <p className="muted" style={{ maxWidth: "52ch", fontSize: "14px" }}>
          Real episodes appear here automatically once the YouTube Data API key is connected.
          The player above already streams this channel&apos;s uploads live.
        </p>
      )}
    </div>
  );
}
