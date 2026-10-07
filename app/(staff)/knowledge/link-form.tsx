"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Select } from "@/components/ui/input";
import { ActionButton } from "../work/action-button";
import { linkArticleAction, unlinkArticleAction } from "./actions";

export function LinkDialog({ articleId, types }: { articleId: string; types: { id: string; name: string }[] }) {
  return (
    <FormDialog trigger="Link to a compliance type" title="Link this article" description="Linked articles are shown on the Due-Date Master next to the compliance type or extension." action={linkArticleAction.bind(null, articleId)} submitLabel="Link">
      {(err) => (
        <>
          <Field label="Link to" error={err("entityId")}>
            <Select name="entityId" required defaultValue="">
              <option value="" disabled>Choose…</option>
              <optgroup label="Compliance types">{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
            </Select>
          </Field>
          <input type="hidden" name="entityType" value="COMPLIANCE_TYPE" />
        </>
      )}
    </FormDialog>
  );
}

export function LinkExtensionDialog({ articleId, extensions }: { articleId: string; extensions: { id: string; name: string }[] }) {
  if (!extensions.length) return null;
  return (
    <FormDialog trigger="Link to an extension" title="Link to a due-date extension" action={linkArticleAction.bind(null, articleId)} submitLabel="Link">
      {(err) => (
        <>
          <Field label="Extension" error={err("entityId")}>
            <Select name="entityId" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {extensions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
          <input type="hidden" name="entityType" value="EXTENSION" />
        </>
      )}
    </FormDialog>
  );
}

export function UnlinkButton({ articleId, linkId }: { articleId: string; linkId: string }) {
  return <ActionButton variant="ghost" action={unlinkArticleAction.bind(null, articleId, linkId)} confirm="Remove this link?">Remove</ActionButton>;
}
