"use client";

import React, { useEffect, useState } from "react";

interface LoadingSpinnerProps {
  /** Show an updated message after this many milliseconds (default: 5000). Set to 0 to disable. */
  stallThreshold?: number;
  stallMessage?: string;
}

export default function LoadingSpinner({
  stallThreshold = 5000,
  stallMessage = "Still loading…",
}: LoadingSpinnerProps) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!stallThreshold) return;
    const t = setTimeout(() => setStalled(true), stallThreshold);
    return () => clearTimeout(t);
  }, [stallThreshold]);

  return (
    <div className="progress">
      <div className="spin" />
      <p className="stage">{stalled ? stallMessage : "Loading…"}</p>
    </div>
  );
}
