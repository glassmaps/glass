import { useId } from "react";
import { AURORA, BACK_D, FRONT, WORD_BOX, WORD_D } from "./brand-paths";

export function Mark({ className, mono }: { className?: string; mono?: string }) {
  const id = useId().replace(/:/g, "");
  const fill = mono || `url(#g${id})`;
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      {!mono && (
        <defs>
          <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="8" y1="92" x2="92" y2="8">
            <stop offset="0" stopColor={AURORA[0]} />
            <stop offset=".5" stopColor={AURORA[1]} />
            <stop offset="1" stopColor={AURORA[2]} />
          </linearGradient>
        </defs>
      )}
      <g fill={fill}>
        <circle cx={FRONT.cx} cy={FRONT.cy} r={FRONT.r} />
        <path d={BACK_D} />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  const [x, y, w, h] = WORD_BOX;
  return (
    <svg className={className} viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label="Glass">
      <path d={WORD_D} />
    </svg>
  );
}
