"use client";

import { useEffect } from "react";

/**
 * Netlify's free plan adds a fixed "Powered by Netlify" badge in the bottom-right corner, on top of
 * the page. It isn't hidden (that's a paid feature); instead its height is published as the CSS
 * variable --badge-space so the bottom tab bar, the floating add button and the page's bottom
 * padding sit above it. 0px wherever there's no badge (local development, other hosts).
 */
const BADGE_ID = "nl-badge-frame";

export function badgeHeight(doc: Document): number {
  const el = doc.getElementById(BADGE_ID);
  if (!el) return 0;
  const style = doc.defaultView?.getComputedStyle(el);
  if (style && (style.display === "none" || style.visibility === "hidden")) return 0;
  return Math.ceil(el.getBoundingClientRect().height);
}

export function PlatformBadgeSpace() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => root.style.setProperty("--badge-space", `${badgeHeight(document)}px`);
    update();
    // The badge is injected after the page loads, and can be removed again.
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--badge-space");
    };
  }, []);
  return null;
}
