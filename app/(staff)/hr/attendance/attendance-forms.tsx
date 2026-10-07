"use client";
import { useState } from "react";
import { FormDialog } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { checkInAction, requestRegularisationAction } from "./actions";

/** Optional mobile check-in for client-site days (spec 11.2); the phone's location is added only if the person allows it. */
export function CheckInDialog({ clients }: { clients: { id: string; name: string }[] }) {
  const [geo, setGeo] = useState("");
  const [msg, setMsg] = useState("");
  const locate = () => {
    if (!navigator.geolocation) return setMsg("Location is not available on this device.");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGeo(`location ${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)} (±${Math.round(p.coords.accuracy)} m)`); setMsg(""); },
      () => setMsg("Location permission was not given."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  return (
    <FormDialog trigger="Client-site check-in" triggerVariant="default" title="Check in at a client site" description="Marks today present at the client site. Your work entries still record the hours." action={checkInAction} submitLabel="Check in">
      {(err) => (
        <>
          <Field label="Client (optional)" error={err("clientId")}>
            <Select name="clientId" defaultValue="">{[<option key="" value="">—</option>, ...clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)]}</Select>
          </Field>
          <Field label="Note" error={err("note")}><Input name="note" placeholder="e.g. Stock audit at the factory" /></Field>
          <input type="hidden" name="geo" value={geo} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={locate}>Add my location</Button>
            <span className="text-xs text-muted">{geo || msg}</span>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function RegulariseDialog({ today }: { today: string }) {
  return (
    <FormDialog trigger="Regularise a day" title="Regularise a missed day" description="For a day you worked but logged no entries. Your manager approves it." action={requestRegularisationAction} submitLabel="Send">
      {(err) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" error={err("date")}><Input type="date" name="date" max={today} required /></Field>
            <Field label="I was" error={err("requestedStatus")}>
              <Select name="requestedStatus" defaultValue="PRESENT"><option value="PRESENT">In office</option><option value="CLIENT_SITE">At a client site</option><option value="WFH">Working from home</option></Select>
            </Field>
          </div>
          <Field label="Reason" error={err("reason")}><Textarea name="reason" required /></Field>
        </>
      )}
    </FormDialog>
  );
}
