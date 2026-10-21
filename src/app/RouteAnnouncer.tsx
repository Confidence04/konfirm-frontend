"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Centralized route-change handler: on every client-side navigation it
// moves focus to the new page's main landmark/heading and writes the new
// page's title into a visually-hidden aria-live region, mirroring the
// "route announcer" pattern browsers give for free on a full page load but
// Next.js client-side transitions never provide on their own.
export default function RouteAnnouncer() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState("");
  const firstRender = useRef(true);

  useEffect(() => {
    // Skip the initial mount: the browser's own load already handled focus
    // and any assistive-tech announcement for the first page.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const heading = document.querySelector("h1");
    const title = (heading?.textContent || document.title || "Page").trim();
    setAnnouncement(`Navigated to ${title}`);

    const focusTarget = (heading as HTMLElement | null) ?? document.querySelector("main");
    if (focusTarget) {
      if (!focusTarget.hasAttribute("tabindex")) {
        focusTarget.setAttribute("tabindex", "-1");
      }
      (focusTarget as HTMLElement).focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
      }}
    >
      {announcement}
    </div>
  );
}
