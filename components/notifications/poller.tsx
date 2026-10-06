"use client";
import { useEffect, useState } from "react";
import { inQuietHours, istClock } from "./kinds";

const POLL_MS = 60_000;

type PollResponse = {
  now: string;
  unread: number;
  items: { id: string; kind: string; title: string; body: string; priority: string }[];
  prefs: { browserEnabled: boolean; quietFrom: string | null; quietTo: string | null; muted: string[] };
};

function popup(n: PollResponse["items"][number], prefs: PollResponse["prefs"]) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!prefs.browserEnabled || prefs.muted.includes(n.kind) || inQuietHours(prefs.quietFrom, prefs.quietTo, istClock())) return;
  const note = new Notification(n.title, { body: n.body || undefined, tag: n.id });
  note.onclick = () => {
    window.focus();
    // A full navigation on purpose: this route handler marks it read, then redirects to the link.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/notifications/${encodeURIComponent(n.id)}/open`;
    note.close();
  };
}

/**
 * Polls /api/notifications every 60 s while the app is open (no push server). Returns the live
 * unread count; `serverCount` (from the layout) wins whenever the server re-renders.
 */
export function useNotificationPoller(serverCount: number) {
  const [state, setState] = useState({ base: serverCount, count: serverCount });
  // A fresh server render (router.refresh after "mark read") resets the badge.
  if (state.base !== serverCount) setState({ base: serverCount, count: serverCount });

  useEffect(() => {
    let cursor: string | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const res = await fetch(`/api/notifications${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
        if (res.status === 401) stopped = true;
        if (res.ok) {
          const data = (await res.json()) as PollResponse;
          cursor = data.now;
          setState((s) => ({ ...s, count: data.unread }));
          // Oldest first so popups appear in the order they were raised.
          for (const n of [...data.items].reverse()) popup(n, data.prefs);
        }
      } catch {
        // Offline or server restarting: try again next tick.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  return state.count;
}
