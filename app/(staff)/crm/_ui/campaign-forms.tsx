"use client";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { CONSTITUTIONS, SERVICE_LINES } from "../_lib/labels";
import { CheckList, type Action, type Option } from "./common";

export type CampaignDefaults = { name: string; messageText: string; segment: { categories: string[]; serviceLines: string[]; constitutions: string[]; groupIds: string[]; primaryOnly: boolean; channel: string } };

export function CampaignDialog({ action, groups, d, trigger }: { action: Action; groups: Option[]; d?: CampaignDefaults; trigger: string }) {
  const s = d?.segment;
  return (
    <FormDialog trigger={trigger} triggerVariant={d ? "secondary" : "default"} title={d ? "Edit campaign" : "New client communication"} description="Greetings, firm updates or due-date extension notes. Nothing is sent from the app — you get the list and copy-ready text." action={action} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Name *" error={err("name")}><Input name="name" required defaultValue={d?.name} placeholder="e.g. Diwali greetings 2026" /></Field>
          <Field label="Message *" hint="{name} and {client} are replaced for each recipient." error={err("messageText")}><Textarea name="messageText" rows={6} required defaultValue={d?.messageText} /></Field>
          <div><p className="mb-1 text-xs font-medium">Category</p><CheckList name="categories" options={[["A", "A"], ["B", "B"], ["C", "C"]]} defaults={s?.categories} /></div>
          <div><p className="mb-1 text-xs font-medium">Has an active engagement in</p><CheckList name="serviceLines" options={SERVICE_LINES} defaults={s?.serviceLines} /></div>
          <div><p className="mb-1 text-xs font-medium">Constitution</p><CheckList name="constitutions" options={CONSTITUTIONS} defaults={s?.constitutions} /></div>
          {groups.length ? (
            <div><p className="mb-1 text-xs font-medium">Group</p><div className="max-h-32 overflow-y-auto rounded-md border border-line p-2"><CheckList name="groupIds" options={groups.map((g) => [g.id, g.name] as const)} defaults={s?.groupIds} /></div></div>
          ) : null}
          <p className="text-xs text-muted">Leave a filter empty to include everyone. Contacts who opted out are always left out.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Channel" error={err("segment.channel")}>
              <Select name="channel" defaultValue={s?.channel ?? "PREFERRED"}><option value="PREFERRED">Each contact&apos;s preferred channel</option><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option></Select>
            </Field>
            <div className="self-end"><Checkbox name="allContacts" label="All contacts (not only primary)" defaultChecked={s ? !s.primaryOnly : false} /></div>
          </div>
        </>
      )}
    </FormDialog>
  );
}
