// Derived selectors over the local replica.
import { store } from './store';
import type { Project, Prompt, Collection, CollectionStep, FileRec, FileCategory, Task, Note, Activity, FileVersion, PromptVersion, Template } from '../../shared/schema';

export const projects = () => store.all('projects');
export const topProjects = (includeArchived = false) => projects().filter((p) => !p.parent_id && (includeArchived || !p.archived));
export const subprojectsOf = (id: string, includeArchived = true) => projects().filter((p) => p.parent_id === id && (includeArchived || !p.archived)).sort(bySort);
export const getProject = (id?: string | null) => store.get('projects', id);
export const parentOf = (p?: Project) => (p?.parent_id ? getProject(p.parent_id) : undefined);

export const bySort = (a: { sort: number; created_at: string }, b: { sort: number; created_at: string }) => a.sort - b.sort || a.created_at.localeCompare(b.created_at);
export const byUpdated = (a: { updated_at: string }, b: { updated_at: string }) => b.updated_at.localeCompare(a.updated_at);

export const promptsOf = (projectId: string) => store.all('prompts').filter((p) => p.project_id === projectId).sort(bySort);
export const collectionsOf = (projectId: string) => store.all('collections').filter((c) => c.project_id === projectId).sort(bySort);
export const stepsOf = (collectionId: string): (CollectionStep & { prompt: Prompt })[] =>
  store.all('collection_steps').filter((s) => s.collection_id === collectionId).sort(bySort)
    .map((s) => ({ ...s, prompt: store.get('prompts', s.prompt_id)! })).filter((s) => s.prompt);
export const tasksOf = (projectId: string) => store.all('tasks').filter((t) => t.project_id === projectId).sort((a, b) => Number(a.done) - Number(b.done) || bySort(a, b));
export const notesOf = (projectId: string) => store.all('notes').filter((n) => n.project_id === projectId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || byUpdated(a, b));
export const versionsOfPrompt = (promptId: string): PromptVersion[] => store.all('prompt_versions').filter((v) => v.prompt_id === promptId).sort((a, b) => b.version_no - a.version_no);
export const versionsOfFile = (fileId: string): FileVersion[] => store.all('file_versions').filter((v) => v.file_id === fileId).sort((a, b) => b.major - a.major || b.minor - a.minor);
export const activityOf = (projectId: string, includeSubs = true) => {
  const ids = new Set([projectId, ...(includeSubs ? subprojectsOf(projectId).map((s) => s.id) : [])]);
  return store.all('activity').filter((a) => a.project_id && ids.has(a.project_id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export type FileView = FileRec & { _pending?: boolean; _progress?: number; _status?: string; _error?: string; _versionId?: string };
export function filesOf(projectId: string, category?: FileCategory): FileView[] {
  const rows: FileView[] = store.all('files').filter((f) => f.project_id === projectId && (!category || f.category === category));
  for (const p of store.pendingFiles.values()) {
    if (p.target_file_id) continue;
    if (p.project_id !== projectId || (category && p.category !== category)) continue;
    rows.push({
      id: p.id, project_id: p.project_id, category: p.category as FileCategory, name: p.name, description: p.description, prompt_ids: p.prompt_ids,
      latest_version_id: null, version_count: 0, size: p.size, mime: p.mime, ext: p.ext, tags: [], rev: 0, deleted: 0, deleted_at: null, delete_batch: null,
      created_at: p.created_at, updated_at: p.created_at, _pending: true, _progress: p.progress, _status: p.status, _error: p.error, _versionId: p.versionId,
    });
  }
  return rows.sort(byUpdated);
}

export function taskProgress(projectId: string, includeSubs = false) {
  const ids = new Set([projectId, ...(includeSubs ? subprojectsOf(projectId).map((s) => s.id) : [])]);
  const tasks = store.all('tasks').filter((t) => ids.has(t.project_id));
  const done = tasks.filter((t) => t.done).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

export function projectCounts(projectId: string) {
  const subs = subprojectsOf(projectId);
  const ids = new Set([projectId, ...subs.map((s) => s.id)]);
  const count = <T extends { project_id: string }>(rows: T[]) => rows.filter((r) => ids.has(r.project_id)).length;
  return {
    subprojects: subs.length,
    prompts: count(store.all('prompts')),
    files: count(store.all('files')),
    collections: count(store.all('collections')),
    notes: count(store.all('notes')),
    tasks: count(store.all('tasks')),
  };
}

export function breadcrumbsFor(p?: Project): Project[] {
  if (!p) return [];
  const parent = parentOf(p);
  return parent ? [parent, p] : [p];
}

export function allTags(): string[] {
  const s = new Set<string>();
  for (const t of store.all('tags')) s.add(t.name);
  for (const e of ['projects', 'prompts', 'templates', 'files'] as const) for (const r of store.all(e)) for (const t of (r as { tags: string[] }).tags || []) s.add(t);
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** Ensure tags typed by the user exist as Tag records (so they can be managed/renamed). */
export function registerTags(tags: string[]) {
  const known = new Set(store.all('tags').map((t) => t.name.toLowerCase()));
  for (const t of tags) if (t.trim() && !known.has(t.toLowerCase())) { store.create('tags', { name: t.trim() }); known.add(t.toLowerCase()); }
}

export function projectLabel(id: string | null | undefined) {
  const p = getProject(id);
  if (!p) return '';
  const parent = parentOf(p);
  return parent ? `${parent.name} › ${p.name}` : p.name;
}

/** Mark a project as recently accessed (throttled to avoid noisy sync). */
const touched = new Map<string, number>();
export function touchProject(id: string) {
  const t = Date.now();
  if ((touched.get(id) ?? 0) > t - 5 * 60_000) return;
  touched.set(id, t);
  if (getProject(id)) store.update('projects', id, { last_accessed_at: new Date().toISOString() });
}

export type { Project, Prompt, Collection, CollectionStep, FileRec, Task, Note, Activity, Template };
