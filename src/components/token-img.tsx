"use client";
import { useEffect, useRef, useState } from "react";
import { identiconUrl } from "@/lib/identicon";

/**
 * A token picture that cannot end up blank. It loads through /api/img (which tries every source and
 * answers with a drawn tile at worst); if even that request fails, the tile is drawn here.
 * A cached image can finish before React attaches onLoad/onError, so the state is also read after mount.
 */
export function TokenImg({ mint, image, symbol = "", size, className }: { mint: string; image?: string | null; symbol?: string; size: number; className?: string }) {
  const src = `/api/img?m=${mint}${image ? `&u=${encodeURIComponent(image)}` : ""}${symbol ? `&s=${encodeURIComponent(symbol)}` : ""}`;
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => setFailed(false), [src]);
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      className={className}
      src={failed ? identiconUrl(mint, symbol) : src}
      alt=""
      width={size}
      height={size}
      decoding="async"
      fetchPriority="high"
      onError={() => setFailed(true)}
    />
  );
}
