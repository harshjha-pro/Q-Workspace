import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Pencil, Copy, Archive, ArchiveRestore, Trash2, Pin, PinOff, Star, StarOff, FolderPlus, PackageOpen, Download, Type } from 'lucide-react';
import { ActionMenu, confirmDialog, promptDialog, toast } from './overlay';
import { IconButton } from './ui';
import { ProjectFormModal } from './domain';
import { store } from '../lib/store';
import { api, downloadUrl } from '../lib/api';
import { subprojectsOf, projectCounts } from '../lib/data';
import type { Project } from '../../shared/schema';

export async function duplicateProject(p: Project, nav: (to: string) => void) {
  const name = await promptDialog({ title: `Duplicate ${p.parent_id ? 'subproject' : 'project'}`, label: 'Name of the copy', defaultValue: `${p.name} (copy)`, confirmLabel: 'Duplicate', message: 'Copies prompts (with fresh version history), collections, tasks, notes and files. Files share storage with the original.' });
  if (!name) return;
  if (!navigator.onLine) { toast.error('Duplicating needs a connection to the server.'); return; }
  try {
    const r = await api<{ id: string }>(`/api/projects/${p.id}/duplicate`, { body: { name } });
    await store.sync();
    toast.success('Duplicated');
    nav(`/p/${r.id}`);
  } catch (e) { toast.error((e as Error).message); }
}

export async function deleteProject(p: Project, after?: () => void) {
  const c = projectCounts(p.id);
  const ok = await confirmDialog({
    title: `Delete “${p.name}”?`, danger: true, confirmLabel: 'Move to trash',
    message: <>This moves the {p.parent_id ? 'subproject' : 'project'}{c.subprojects ? `, its ${c.subprojects} subproject${c.subprojects === 1 ? '' : 's'}` : ''} and everything inside ({c.prompts} prompts, {c.files} files, {c.notes} notes, {c.tasks} tasks) to the trash. You can restore it from Settings → Trash.</>,
  });
  if (!ok) return;
  store.remove('projects', p.id);
  toast.success('Moved to trash', { label: 'Undo', onClick: () => void restoreLatest(p.id) });
  after?.();
}

async function restoreLatest(id: string) {
  try {
    await store.sync();
    const trash = await api<{ id: string; batch: string }[]>('/api/trash');
    const t = trash.find((x) => x.id === id);
    if (t) { await api(`/api/trash/${t.batch}/restore`, { method: 'POST' }); await store.sync(); toast.success('Restored'); }
  } catch (e) { toast.error((e as Error).message); }
}

export function ProjectMenu({ project, onDeleted, size = 'sm' }: { project: Project; onDeleted?: () => void; size?: 'sm' | 'md' }) {
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [newSub, setNewSub] = useState(false);
  const p = project;
  const rename = async () => {
    const name = await promptDialog({ title: 'Rename', label: 'Name', defaultValue: p.name, confirmLabel: 'Rename' });
    if (name && name !== p.name) { store.update('projects', p.id, { name }); toast.success('Renamed'); }
  };
  return (
    <>
      <ActionMenu title={p.name} items={[
        { label: 'Edit details', icon: <Pencil />, onClick: () => setEdit(true) },
        { label: 'Rename', icon: <Type />, onClick: rename },
        { label: 'Add subproject', icon: <FolderPlus />, onClick: () => setNewSub(true), hidden: !!p.parent_id },
        { label: p.pinned ? 'Unpin from dashboard' : 'Pin to dashboard', icon: p.pinned ? <PinOff /> : <Pin />, onClick: () => store.update('projects', p.id, { pinned: !p.pinned }) },
        { label: p.favourite ? 'Remove from favourites' : 'Add to favourites', icon: p.favourite ? <StarOff /> : <Star />, onClick: () => store.update('projects', p.id, { favourite: !p.favourite }) },
        { label: 'Generate prompt pack', icon: <PackageOpen />, onClick: () => nav(`/p/${p.id}/pack`) },
        { label: 'Export prompts (JSON)', icon: <Download />, onClick: () => downloadUrl(`/api/projects/${p.id}/export-prompts?format=json`) },
        { label: 'Export prompts (CSV)', icon: <Download />, onClick: () => downloadUrl(`/api/projects/${p.id}/export-prompts?format=csv`) },
        { label: 'Duplicate', icon: <Copy />, onClick: () => void duplicateProject(p, nav) },
        { label: p.archived ? 'Unarchive' : 'Archive', icon: p.archived ? <ArchiveRestore /> : <Archive />, onClick: () => { store.update('projects', p.id, { archived: !p.archived }); toast.success(p.archived ? 'Unarchived' : 'Archived — hidden from lists and the dashboard'); } },
        { divider: true, label: '' },
        { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => void deleteProject(p, onDeleted) },
      ]} trigger={(t) => <IconButton size={size} label="Project actions" icon={<MoreVertical />} {...t} />} />
      <ProjectFormModal open={edit} onClose={() => setEdit(false)} project={p} />
      <ProjectFormModal open={newSub} onClose={() => setNewSub(false)} parentId={p.id} onSaved={(s) => nav(`/p/${s.id}`)} />
    </>
  );
}

export { subprojectsOf };
