"use client";
import { useEffect, useState } from "react";

/** The method page's contents, with the section you are reading marked and a progress rail. */
export function DocNav({ items, version }: { items: { id: string; label: string }[]; version: string }) {
  const [at, setAt] = useState(items[0]?.id);
  const [p, setP] = useState(0);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const onScroll = () => {
      const y = window.scrollY + 140;
      let cur = items[0].id;
      for (const e of els) if (e.offsetTop <= y) cur = e.id;
      setAt(cur);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);
  return (
    <nav className="doc-nav" aria-label="On this page">
      <span className="micro">Method {version}</span>
      <div className="doc-rail"><i style={{ transform: `scaleY(${p})` }} /></div>
      <ol>
        {items.map((i, n) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={at === i.id ? "true" : undefined}>
              <span className="num">{String(n + 1).padStart(2, "0")}</span>
              {i.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
