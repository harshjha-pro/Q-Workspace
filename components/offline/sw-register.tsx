"use client";
import { useEffect } from "react";

/** Registers /sw.js so Add Work opens without a connection (P2-38). Skipped in development. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // On the login page (after sign-out or on a shared phone) drop cached pages of the previous user.
    // The offline queue is kept: unsynced entries belong to whoever made them and sync on their next login.
    if (window.location.pathname.startsWith("/login") && "caches" in window) void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* not fatal: the app works online without it */
    });
  }, []);
  return null;
}
