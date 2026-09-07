import SiteHeader from "@/components/SiteHeader";
import ConditionalFooter from "@/components/ConditionalFooter";
import { getSiteConfig } from "@/lib/siteConfig";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { branding } = await getSiteConfig();
  const brand = { name: branding.siteName, tagline: branding.tagline, logo: branding.logo };
  return (
    <>
      <SiteHeader brand={brand} />
      {children}
      <ConditionalFooter brand={brand} />
    </>
  );
}
