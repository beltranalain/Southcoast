import { getUploads, youtubeConfigured } from "@/lib/youtube";
import { PRIMARY_CHANNEL } from "@/lib/channels";
import UploadVideoButton from "@/components/UploadVideoButton";

export default async function AdminVideos() {
  const videos = await getUploads(PRIMARY_CHANNEL.uploadsPlaylist, 25);

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
                <tr key={v.id}>
                  <td>
                    <div className="vid-cell">
                      <div className="vid-thumb" style={{ backgroundImage: `url(${v.thumbnail})`, backgroundSize: "cover" }} />
                      <div><div className="vt">{v.title}</div></div>
                    </div>
                  </td>
                  <td>{new Date(v.publishedAt).toLocaleDateString()}</td>
                  <td><span className="pill published">YouTube</span></td>
                  <td className="row-actions">
                    <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer">Open</a>
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
