// Single source of truth for synced entities. Used by the server (DDL, validation,
// sync) and the client (local replica, typed access).

export type FieldType = 'text' | 'int' | 'bool' | 'json' | 'real';

export interface EntityDef {
  table: string;
  fields: Record<string, FieldType>;
  /** Fields the client may set through sync mutations. */
  writable: string[];
  /** Fields where concurrent edits must be surfaced as a conflict instead of last-write-wins. */
  conflictFields: string[];
  /** Server-only entities (created as side effects) cannot be mutated by clients. */
  clientWritable: boolean;
  /** Field that ties the record to a project (for activity + cascading delete). */
  projectKey?: string;
  label: string;
  titleField?: string;
}

const base = { id: 'text', rev: 'int', deleted: 'int', deleted_at: 'text', delete_batch: 'text', created_at: 'text', updated_at: 'text' } as const;

const ENTITY_DEFS = {
  projects: {
    table: 'projects', label: 'Project', titleField: 'name', clientWritable: true, projectKey: 'id',
    fields: { ...base, parent_id: 'text', name: 'text', description: 'text', icon: 'text', avatar: 'text', color: 'text', status: 'text', tags: 'json', favourite: 'bool', pinned: 'bool', archived: 'bool', sort: 'real', variable_values: 'json', last_accessed_at: 'text' },
    writable: ['parent_id', 'name', 'description', 'icon', 'avatar', 'color', 'status', 'tags', 'favourite', 'pinned', 'archived', 'sort', 'variable_values', 'last_accessed_at'],
    conflictFields: ['name', 'description'],
  },
  prompts: {
    table: 'prompts', label: 'Prompt', titleField: 'title', clientWritable: true, projectKey: 'project_id',
    fields: { ...base, project_id: 'text', title: 'text', content: 'text', description: 'text', purpose: 'text', type: 'text', tags: 'json', instructions: 'text', variables: 'json', sort: 'real', version_no: 'int', source_template_id: 'text', import_job_id: 'text' },
    writable: ['project_id', 'title', 'content', 'description', 'purpose', 'type', 'tags', 'instructions', 'variables', 'sort', 'source_template_id'],
    conflictFields: ['title', 'content', 'description', 'purpose', 'instructions'],
  },
  prompt_versions: {
    table: 'prompt_versions', label: 'Prompt version', titleField: 'title', clientWritable: false,
    fields: { ...base, prompt_id: 'text', version_no: 'int', title: 'text', content: 'text', description: 'text', purpose: 'text', type: 'text', tags: 'json', instructions: 'text', change_note: 'text' },
    writable: [], conflictFields: [],
  },
  templates: {
    table: 'templates', label: 'Template', titleField: 'title', clientWritable: true,
    fields: { ...base, title: 'text', content: 'text', description: 'text', purpose: 'text', type: 'text', tags: 'json', instructions: 'text', variables: 'json', favourite: 'bool', sort: 'real', import_job_id: 'text' },
    writable: ['title', 'content', 'description', 'purpose', 'type', 'tags', 'instructions', 'variables', 'favourite', 'sort'],
    conflictFields: ['title', 'content', 'description', 'purpose', 'instructions'],
  },
  collections: {
    table: 'collections', label: 'Collection', titleField: 'name', clientWritable: true, projectKey: 'project_id',
    fields: { ...base, project_id: 'text', name: 'text', description: 'text', sort: 'real', workflow_status: 'text', current_step_id: 'text', started_at: 'text', finished_at: 'text' },
    writable: ['project_id', 'name', 'description', 'sort', 'workflow_status', 'current_step_id', 'started_at', 'finished_at'],
    conflictFields: ['name', 'description'],
  },
  collection_steps: {
    table: 'collection_steps', label: 'Workflow step', clientWritable: true,
    fields: { ...base, collection_id: 'text', prompt_id: 'text', sort: 'real', instructions: 'text', completed: 'bool', completed_at: 'text' },
    writable: ['collection_id', 'prompt_id', 'sort', 'instructions', 'completed', 'completed_at'],
    conflictFields: ['instructions'],
  },
  files: {
    table: 'files', label: 'File', titleField: 'name', clientWritable: true, projectKey: 'project_id',
    fields: { ...base, project_id: 'text', category: 'text', name: 'text', description: 'text', prompt_ids: 'json', latest_version_id: 'text', version_count: 'int', size: 'int', mime: 'text', ext: 'text', tags: 'json' },
    writable: ['project_id', 'category', 'name', 'description', 'prompt_ids', 'tags'],
    conflictFields: ['name', 'description'],
  },
  file_versions: {
    table: 'file_versions', label: 'File version', clientWritable: false,
    fields: { ...base, file_id: 'text', label: 'text', major: 'int', minor: 'int', original_name: 'text', size: 'int', mime: 'text', ext: 'text', sha256: 'text', note: 'text', extract_status: 'text', scan_status: 'text' },
    writable: [], conflictFields: [],
  },
  tasks: {
    table: 'tasks', label: 'Task', titleField: 'title', clientWritable: true, projectKey: 'project_id',
    fields: { ...base, project_id: 'text', title: 'text', description: 'text', done: 'bool', due_date: 'text', priority: 'text', sort: 'real', completed_at: 'text' },
    writable: ['project_id', 'title', 'description', 'done', 'due_date', 'priority', 'sort', 'completed_at'],
    conflictFields: ['title', 'description'],
  },
  notes: {
    table: 'notes', label: 'Note', titleField: 'title', clientWritable: true, projectKey: 'project_id',
    fields: { ...base, project_id: 'text', title: 'text', body: 'text', pinned: 'bool', sort: 'real' },
    writable: ['project_id', 'title', 'body', 'pinned', 'sort'],
    conflictFields: ['title', 'body'],
  },
  tags: {
    table: 'tags', label: 'Tag', titleField: 'name', clientWritable: true,
    fields: { ...base, name: 'text', color: 'text' },
    writable: ['name', 'color'], conflictFields: [],
  },
  activity: {
    table: 'activity', label: 'Activity', clientWritable: false, projectKey: 'project_id',
    fields: { ...base, project_id: 'text', entity: 'text', entity_id: 'text', action: 'text', summary: 'text' },
    writable: [], conflictFields: [],
  },
  import_jobs: {
    table: 'import_jobs', label: 'Import', clientWritable: false,
    fields: { ...base, destination: 'text', project_id: 'text', format: 'text', filename: 'text', default_type: 'text', total: 'int', imported: 'int', skipped: 'int', failed: 'int', duplicates: 'int', status: 'text' },
    writable: [], conflictFields: [],
  },
} satisfies Record<string, EntityDef>;

export type EntityName = keyof typeof ENTITY_DEFS;
export const ENTITIES: Record<EntityName, EntityDef> = ENTITY_DEFS;
export const ENTITY_NAMES = Object.keys(ENTITIES) as EntityName[];

// ---------- Typed rows ----------
interface BaseRow { id: string; rev: number; deleted: number; deleted_at: string | null; delete_batch: string | null; created_at: string; updated_at: string }
export type Status = 'not_started' | 'in_progress' | 'completed';
export type PromptType = 'mandatory' | 'optional';
export type FileCategory = 'reference' | 'additional' | 'output';
/** An input of a prompt. `declared` = added by the user (kept even if not placed in the text as {Name}). */
export interface VariableMeta { name: string; required: boolean; description?: string; declared?: boolean }

export interface Project extends BaseRow { parent_id: string | null; name: string; description: string; icon: string; avatar: string; color: string; status: Status; tags: string[]; favourite: boolean; pinned: boolean; archived: boolean; sort: number; variable_values: Record<string, string>; last_accessed_at: string | null }
export interface Prompt extends BaseRow { project_id: string; title: string; content: string; description: string; purpose: string; type: PromptType; tags: string[]; instructions: string; variables: VariableMeta[]; sort: number; version_no: number; source_template_id: string | null; import_job_id: string | null }
export interface PromptVersion extends BaseRow { prompt_id: string; version_no: number; title: string; content: string; description: string; purpose: string; type: PromptType; tags: string[]; instructions: string; change_note: string }
export interface Template extends BaseRow { title: string; content: string; description: string; purpose: string; type: PromptType; tags: string[]; instructions: string; variables: VariableMeta[]; favourite: boolean; sort: number; import_job_id: string | null }
export interface Collection extends BaseRow { project_id: string; name: string; description: string; sort: number; workflow_status: 'idle' | 'running' | 'done'; current_step_id: string | null; started_at: string | null; finished_at: string | null }
export interface CollectionStep extends BaseRow { collection_id: string; prompt_id: string; sort: number; instructions: string; completed: boolean; completed_at: string | null }
export interface FileRec extends BaseRow { project_id: string; category: FileCategory; name: string; description: string; prompt_ids: string[]; latest_version_id: string | null; version_count: number; size: number; mime: string; ext: string; tags: string[] }
export interface FileVersion extends BaseRow { file_id: string; label: string; major: number; minor: number; original_name: string; size: number; mime: string; ext: string; sha256: string; note: string; extract_status: string; scan_status: string }
export interface Task extends BaseRow { project_id: string; title: string; description: string; done: boolean; due_date: string | null; priority: '' | 'low' | 'medium' | 'high'; sort: number; completed_at: string | null }
export interface Note extends BaseRow { project_id: string; title: string; body: string; pinned: boolean; sort: number }
export interface Tag extends BaseRow { name: string; color: string }
export interface Activity extends BaseRow { project_id: string | null; entity: string; entity_id: string; action: string; summary: string }
export interface ImportJob extends BaseRow { destination: 'library' | 'project'; project_id: string | null; format: string; filename: string; default_type: PromptType; total: number; imported: number; skipped: number; failed: number; duplicates: number; status: string }

export interface RowMap {
  projects: Project; prompts: Prompt; prompt_versions: PromptVersion; templates: Template; collections: Collection;
  collection_steps: CollectionStep; files: FileRec; file_versions: FileVersion; tasks: Task; notes: Note; tags: Tag;
  activity: Activity; import_jobs: ImportJob;
}

export const DEFAULTS: { [K in EntityName]?: Partial<RowMap[K]> } = {
  projects: { parent_id: null, description: '', icon: 'folder', avatar: '', color: 'indigo', status: 'not_started', tags: [], favourite: false, pinned: false, archived: false, sort: 0, variable_values: {}, last_accessed_at: null },
  prompts: { description: '', purpose: '', type: 'optional', tags: [], instructions: '', variables: [], sort: 0, version_no: 1, source_template_id: null, import_job_id: null },
  templates: { description: '', purpose: '', type: 'optional', tags: [], instructions: '', variables: [], favourite: false, sort: 0, import_job_id: null },
  collections: { description: '', sort: 0, workflow_status: 'idle', current_step_id: null, started_at: null, finished_at: null },
  collection_steps: { instructions: '', completed: false, completed_at: null, sort: 0 },
  files: { description: '', prompt_ids: [], tags: [], latest_version_id: null, version_count: 0, size: 0, mime: '', ext: '' },
  tasks: { description: '', done: false, due_date: null, priority: '', sort: 0, completed_at: null },
  notes: { body: '', pinned: false, sort: 0 },
  tags: { color: 'slate' },
};

export const STATUS_LABEL: Record<Status, string> = { not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed' };
export const CATEGORY_LABEL: Record<FileCategory, string> = { reference: 'Reference Files', additional: 'Additional Files', output: 'AI Outputs' };
export const FILE_CATEGORIES: FileCategory[] = ['reference', 'additional', 'output'];

/** Upload allow-list. Architecture permits adding more formats here. */
export const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};
