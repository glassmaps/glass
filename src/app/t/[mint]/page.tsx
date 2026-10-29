import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/chrome";
import { MapScreen } from "@/components/map-screen";
import { isAddress } from "@/lib/address";
import { cachedMap } from "@/lib/analyze";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ mint: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mint } = await params;
  if (!isAddress(mint)) return { title: "Not an address" };
  const m = await cachedMap(mint);
  const name = m ? `${m.token.symbol ? "$" + m.token.symbol : m.token.name}` : `${mint.slice(0, 4)}…${mint.slice(-4)}`;
  const description = m
    ? `${m.holdersTotal.toLocaleString("en-US")} holders. ${m.clusters.reduce((s, c) => s + c.pct, 0).toFixed(1)}% of supply sits in linked wallets. Score ${m.score.total}/100. Every link opens its transaction.`
    : "Bubble map with receipts: every link between two holders opens the transaction that proves it.";
  return {
    title: `${name} holders`,
    description,
    openGraph: { title: `${name} on Glass`, description, images: [{ url: `/api/card/${mint}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: `${name} on Glass`, description, images: [`/api/card/${mint}`] },
  };
}

export default async function TokenPage({ params }: Props) {
  const { mint } = await params;
  if (!isAddress(mint)) notFound();
  const initial = await cachedMap(mint);
  return (
    <>
      <Header />
      <main>
        <MapScreen mint={mint} initial={initial} />
      </main>
    </>
  );
}
