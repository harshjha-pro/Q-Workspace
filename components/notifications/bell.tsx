"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotificationPoller } from "./poller";

export function NotificationBell({ unread }: { unread: number }) {
  const count = useNotificationPoller(unread);
  const label = count ? `Notifications (${count} unread)` : "Notifications";
  return (
    <Link href="/notifications" aria-label={label} title={label} className="relative rounded p-1.5 text-muted hover:bg-gray-100">
      <Bell className="h-5 w-5" />
      {count ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
