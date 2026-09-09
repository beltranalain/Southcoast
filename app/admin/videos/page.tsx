import { getUploads, youtubeConfigured } from "@/lib/youtube";
import { PRIMARY_CHANNEL } from "@/lib/channels";
import { listStreamVideos, streamIframeSrc } from "@/lib/stream";
import UploadVideoButton from "@/components/UploadVideoButton";

type Row = { id: string; title: string; thumbnail: string; publishedAt: number; source: "yt" | "cf"; href: string };

export default async function AdminVideos() {
  const [ytVideos, streamVids] = await Promise.all([
    getUploads(PRIMARY_CHANNEL.uploadsPlaylist, 25),
    listStreamVideos(),
  ]);
  // Merge YouTube uploads + Cloudflare Stream videos (recordings + uploads),
  // newest first, so a freshly uploaded file shows up here once processed.
  const yt: Row[] = ytVideos.map((v: any) => ({ id: v.id, title: v.title, thumbnail: v.thumbnail, publishedAt: new Date(v.publishedAt).getTime(), source: "yt", href: `https://www.youtube.com/watch?v=${v.id}` }));
  const cf: Row[] = (streamVids || []).map((v: any) => ({
    id: v.uid,
    title: v.meta?.name || "Untitled upload",
    thumbnail: v.thumbnail || "",
    publishedAt: new Date(v.created || 0).getTime(),
    source: "cf",
    href: streamIframeSrc(v.uid),
  }));
  const videos: Row[] = [...cf, ...yt].sort((a, b) => b.publishedAt - a.publishedAt);

  return (
    <>
      <div className="admin-topbar">
        <div>
          <h1>Videos</h1>
          <div className="sub">Real uploads from YouTube. Saved broadcasts from Cloudflare Stream will appear here too.</div>
        </div>
        <div className="admin-actions">
          <UploadVideoButton />
        </div>
      </div>

      {!youtubeConfigured && (
        <div className="notice" style={{ marginBottom: 22 }}>
          <strong>YouTube not connected.</strong> Add YOUTUBE_API_KEY and this list fills with the
          real videos from The South Coast Cane Show.
        </div>
      )}

      {videos.length ? (
        <div className="panel" style={{ padding: "8px 8px 0" }}>
          <table className="data">
            <thead>
              <tr><th>Video</th><th>Published</th><th>Source</th><th></th></tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={`${v.source}-${v.id}`}>
                  <td>
                    <div className="vid-cell">
                      <div className="vid-thumb" style={{ backgroundImage: `url(${v.thumbnail})`, backgroundSize: "cover" }} />
                      <div><div className="vt">{v.title}</div></div>
                    </div>
                  </td>
                  <td>{v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : "-"}</td>
                  <td><span className="pill published">{v.source === "cf" ? "Cloudflare" : "YouTube"}</span></td>
                  <td className="row-actions">
                    <a href={v.href} target="_blank" rel="noopener noreferrer">Open</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel">
          <p className="muted" style={{ fontSize: "13.5px" }}>
            No videos to show yet. Once the YouTube API key is connected, every upload appears here
            automatically - nothing is hard-coded.
          </p>
        </div>
      )}
    </>
  );
}
