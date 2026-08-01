"use client";

import { useEffect } from "react";

/**
 * Reveal-on-scroll for the clause sections. The classes are only ever added
 * from here, so with no JavaScript (or reduced motion) nothing is hidden —
 * the disclosure document must always render in full.
 */
export default function ScrollFX() {
  useEffect(() => {
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const viewport =
      window.innerHeight || document.documentElement.clientHeight || 0;
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".clause, .closing, .product-frame-section, .compat-strip",
      ),
    ).filter((node) => node.getBoundingClientRect().top >= viewport);

    if (targets.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("did-reveal");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08 },
    );

    for (const target of targets) {
      target.classList.add("will-reveal");
      observer.observe(target);
    }

    // Belt and braces: never leave a section hidden if the observer misfires.
    const failsafe = window.setTimeout(() => {
      for (const target of targets) {
        target.classList.add("did-reveal");
      }
    }, 6000);

    return () => {
      window.clearTimeout(failsafe);
      observer.disconnect();
      for (const target of targets) {
        target.classList.remove("will-reveal", "did-reveal");
      }
    };
  }, []);

  return null;
}
