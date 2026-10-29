"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "./icons";

export function CopyButton({ value, label = "Copy address", size = 13 }: { value: string; label?: string; size?: number }) {
  const [done, setDone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={done ? "Copied" : label}
      title={done ? "Copied" : label}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          clearTimeout(t.current);
          t.current = setTimeout(() => setDone(false), 1400);
        } catch {
          /* clipboard blocked: nothing to show */
        }
      }}
    >
      {done ? <Check size={size} style={{ color: "var(--good)" }} /> : <Copy size={size} />}
    </button>
  );
}
