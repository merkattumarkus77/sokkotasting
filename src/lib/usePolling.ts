"use client";

import { useEffect, useRef } from "react";

// Every poll costs Firestore reads on the server (Spark: 50k reads/day), so
// polling pauses while the tab is hidden and catches up as soon as it is
// visible again. `intervalMs: null` disables polling.
export function usePolling(poll: () => Promise<void> | void, intervalMs: number | null): void {
  const pollRef = useRef(poll);
  useEffect(() => {
    pollRef.current = poll;
  });

  useEffect(() => {
    if (intervalMs === null) return;

    const run = () => {
      if (!document.hidden) void pollRef.current();
    };
    run();
    const id = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs]);
}
