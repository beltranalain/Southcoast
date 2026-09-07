import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { CHANNELS } from "@/lib/channels";
import { getSiteConfig } from "@/lib/siteConfig";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const { content } = await getSiteConfig();
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Get in touch</span>
          <h1 className="anton">Ask for<br /><span className="or">the mic.</span></h1>
          <p>Guest spots, collaborations, or just want to reach the show. Here is how to find us.</p>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 56 }}>
        <div className="wrap">
          <div className="contact-grid">
            <div>
              <ul className="contact-list">
                <li>
                  <div className="label">Email</div>
                  <div className="value"><a href={`mailto:${content.emailGeneral}`}>{content.emailGeneral}</a></div>
                </li>
                <li>
                  <div className="label">Guest and booking</div>
                  <div className="value"><a href={`mailto:${content.emailBooking}`}>{content.emailBooking}</a></div>
                </li>
                {CHANNELS.map((c) => (
                  <li key={c.key}>
                    <div className="label">{c.name}</div>
                    <div className="value">
                      <a href={c.url} target="_blank" rel="noopener noreferrer">youtube.com/{c.handle}</a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
