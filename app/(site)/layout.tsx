import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getSiteConfig } from "@/lib/siteConfig";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { branding } = await getSiteConfig();
  const brand = { name: branding.siteName, tagline: branding.tagline };
  return (
    <>
      <SiteHeader brand={brand} />
      {children}
      <SiteFooter brand={brand} />
    </>
  );
}
