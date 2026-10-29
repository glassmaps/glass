// One 24 grid, 1.5 stroke, square caps, mitred joins. Drawn for this project.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "square",
  strokeLinejoin: "miter",
  "aria-hidden": true,
});

export const Search = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 20 20" /></svg>
);
export const Copy = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M8 8h11v11H8z" /><path d="M16 5H5v11" /></svg>
);
export const Check = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const Out = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M9 5h10v10" /><path d="M19 5 6 18" /></svg>
);
export const Plus = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const Minus = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 12h14" /></svg>
);
export const Fit = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
);
export const Close = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>
);
export const Share = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 13v7h14v-7" /></svg>
);
export const Redo = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M19 12a7 7 0 1 1-2.05-4.95" /><path d="M19.5 4v4h-4" /></svg>
);
export const Code = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /></svg>
);
export const XLogo = ({ size = 15, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z" />
  </svg>
);
export const GitHub = ({ size = 15, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49l-.01-1.7c-2.78.62-3.37-1.36-3.37-1.36-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.37 9.37 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.64 1.03 2.76 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9l-.01 2.81c0 .27.18.6.69.49A10.12 10.12 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
  </svg>
);
export const Tg = ({ size = 15, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M21.4 3.6 2.9 10.8c-1.3.5-1.3 1.2-.2 1.6l4.7 1.5 1.8 5.6c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8L23 5c.3-1.3-.5-1.8-1.6-1.4ZM8.7 13.6l9.6-6.1c.5-.3.9-.1.5.2l-7.9 7.2-.3 3.3-1.9-4.6Z" />
  </svg>
);
