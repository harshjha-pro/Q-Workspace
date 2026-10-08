"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The layout counts unread messages while the page is marking them read, so its badge can be one render
 * behind. One refresh after mount brings it up to date.
 */
export function RefreshOnce({ when }: { when: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (when) router.refresh();
  }, [when, router]);
  return null;
}
