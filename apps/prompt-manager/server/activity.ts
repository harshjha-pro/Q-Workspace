import { insertRow, uuid, getRow } from './db';
import type { EntityName } from '../shared/schema';

/** Resolve the owning project id for any record (used for activity & search scoping). */
export function projectOf(entity: EntityName, row: Record<string, any> | undefined): string | null {
  if (!row) return null;
  switch (entity) {
    case 'projects': return row.id;
    case 'prompts': case 'collections': case 'files': case 'tasks': case 'notes': return row.project_id ?? null;
    case 'collection_steps': return (getRow<any>('collections', row.collection_id))?.project_id ?? null;
    case 'prompt_versions': return (getRow<any>('prompts', row.prompt_id))?.project_id ?? null;
    case 'file_versions': return (getRow<any>('files', row.file_id))?.project_id ?? null;
    default: return null;
  }
}

export function logActivity(projectId: string | null, entity: string, entityId: string, action: string, summary: string) {
  insertRow('activity', { id: uuid(), project_id: projectId, entity, entity_id: entityId, action, summary: summary.slice(0, 300) });
}
