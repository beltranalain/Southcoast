import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Inter, Anton } from "next/font/google";
import "./globals.css";
import { getSiteConfig } from "@/lib/siteConfig";

// Render per request so admin edits to content + branding appear immediately.
export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getSiteConfig();
  return {
    title: {
      default: `${branding.siteName} - Cane with a Camera`,
      template: `%s - ${branding.siteName}`,
    },
    description:
      "Cane with a Camera - an independent studio making five shows. Live talk, long-form, from the road, and a documentary series. Watch here and on YouTube at the same time.",
    ...(branding.favicon ? { icons: { icon: branding.favicon } } : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { branding } = await getSiteConfig();
  // Drive the whole design system off the saved accent/background/live colors.
  // --amber is the token the stylesheet actually uses everywhere.
  const themeVars = {
    "--amber": branding.accent,
    "--orange": branding.accent,
    "--accent": branding.accent,
    "--bg": branding.background,
    "--live": branding.live,
  } as CSSProperties;

  return (
    <html lang="en" className={`${inter.variable} ${anton.variable}`} style={themeVars}>
      <body>{children}</body>
    </html>
  );
}
