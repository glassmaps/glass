"use client";
import { useEffect } from "react";

/** Starts a section's drawings when it scrolls into view. Content never waits on this: it only adds `in`. */
export function Reveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (list) => {
        for (const en of list) {
          if (!en.isIntersecting) continue;
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}
