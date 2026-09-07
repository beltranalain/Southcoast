import type { Metadata } from "next";
import LibraryClient from "@/components/LibraryClient";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">On demand</span>
          <h1 className="anton">The<br /><span className="or">archive</span></h1>
          <p>
            The player pulls real uploads from YouTube now; the archive grid fills from our own
            Cloudflare Stream library as broadcasts are saved.
          </p>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 56 }}>
        <LibraryClient />
      </section>
    </>
  );
}
