"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll effects: a top progress rail plus reveal-on-scroll for the page
 * sections. All classes are only ever added from here, so with no JavaScript
 * (or reduced motion) nothing is hidden — the disclosure document must always
 * render in full.
 */
export default function ScrollFX() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const root = document.documentElement;
        const max = root.scrollHeight - root.clientHeight;
        const progress = max > 0 ? window.scrollY / max : 0;
        if (bar.current) {
          bar.current.style.transform = `scaleX(${progress})`;
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    let reveal: (() => void) | null = null;
    if (
      typeof IntersectionObserver !== "undefined" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const viewport =
        window.innerHeight || document.documentElement.clientHeight || 0;
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".clause, .closing, .product-frame-section, .compat-strip",
        ),
      ).filter((node) => node.getBoundingClientRect().top >= viewport);

      if (targets.length > 0) {
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                entry.target.classList.add("did-reveal");
                observer.unobserve(entry.target);
              }
            }
          },
          { threshold: 0.06 },
        );

        for (const target of targets) {
          target.classList.add("will-reveal");
          observer.observe(target);
        }

        // Belt and braces: never leave a section hidden if the observer
        // misfires.
        const failsafe = window.setTimeout(() => {
          for (const target of targets) {
            target.classList.add("did-reveal");
          }
        }, 6000);

        reveal = () => {
          window.clearTimeout(failsafe);
          observer.disconnect();
          for (const target of targets) {
            target.classList.remove("will-reveal", "did-reveal");
          }
        };
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      reveal?.();
    };
  }, []);

  return (
    <div className="progress-rail" aria-hidden="true">
      <div ref={bar} className="progress-bar" />
    </div>
  );
}
