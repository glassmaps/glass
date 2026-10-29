import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/method"];
  if (site.tokenMint) pages.push(`/t/${site.tokenMint}`);
  return pages.map((p) => ({ url: `${site.url}${p}`, changeFrequency: "daily", priority: p ? 0.7 : 1 }));
}
