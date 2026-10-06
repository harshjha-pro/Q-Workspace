"use client";
import { useSyncExternalStore, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";
import { NOTIFICATION_KINDS, isUnmutable } from "@/components/notifications/kinds";
import { markAllReadAction, savePreferencesAction } from "./actions";

export function MarkAllRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await markAllReadAction(); router.refresh(); })}>
      {pending ? "Working…" : "Mark all read"}
    </Button>
  );
}

type Perm = NotificationPermission | "unsupported";
const readPermission = (): Perm => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

const noSubscribe = () => () => {};

/** Browser permission lives outside React (unknown during server render); the answer to the prompt overrides it. */
export function EnableBrowserNotifications() {
  const live = useSyncExternalStore<Perm | "unknown">(noSubscribe, readPermission, () => "unknown");
  const [answered, setAnswered] = useState<Perm | null>(null);
  const perm = answered ?? live;
  if (perm === "unknown") return null;
  if (perm === "unsupported") return <Alert tone="warn">This browser does not support notifications. You will still see them here and on the bell.</Alert>;
  if (perm === "granted") return <Alert tone="success">Browser notifications are allowed on this device. They appear only while QEPEX is open in a tab.</Alert>;
  if (perm === "denied") return <Alert tone="warn">Browser notifications are blocked for this site. Allow them in the browser&apos;s site settings, then reload.</Alert>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" onClick={async () => setAnswered(await Notification.requestPermission())}>Enable browser notifications</Button>
      <span className="text-xs text-muted">Pop-ups appear only while QEPEX is open in a tab.</span>
    </div>
  );
}

export function PreferencesForm({ prefs }: { prefs: { quietFrom: string | null; quietTo: string | null; browserEnabled: boolean; muted: string[] } }) {
  return (
    <ActionForm action={savePreferencesAction} submitLabel="Save preferences">
      {(errorFor) => (
        <>
          <Checkbox name="browserEnabled" defaultChecked={prefs.browserEnabled} label="Show browser pop-ups for new notifications" />
          <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
            <Field label="Quiet from" error={errorFor("quietFrom")}><Input name="quietFrom" type="time" defaultValue={prefs.quietFrom ?? ""} /></Field>
            <Field label="Quiet until" error={errorFor("quietTo")}><Input name="quietTo" type="time" defaultValue={prefs.quietTo ?? ""} /></Field>
          </div>
          <p className="text-xs text-muted">Quiet hours (IST) and muted kinds only silence pop-ups. Everything still appears in this list and on the bell.</p>
          <fieldset>
            <legend className="mb-1 text-xs font-medium">Mute pop-ups for</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {NOTIFICATION_KINDS.map((k) => isUnmutable(k.kind) ? (
                <Checkbox key={k.kind} disabled checked={false} readOnly label={<span className="text-muted">{k.label} (escalations cannot be muted)</span>} />
              ) : (
                <Checkbox key={k.kind} name="muted" value={k.kind} defaultChecked={prefs.muted.includes(k.kind)} label={k.label} />
              ))}
            </div>
          </fieldset>
        </>
      )}
    </ActionForm>
  );
}
