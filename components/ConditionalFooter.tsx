"use client";

import { usePathname } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";

// The home page is a single, no-scroll marquee, so it carries no footer.
// Every other page still shows the full footer (links + Donkey Ideas credit).
export default function ConditionalFooter({ brand }: { brand: { name: string; tagline: string } }) {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <SiteFooter brand={brand} />;
}
