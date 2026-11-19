import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import { metaGet, metaSet } from './idb';

export interface ServerSettings {
  session_idle_minutes: number; session_max_days: number; upload_max_mb: number; storage_mode: 'local' | 'self_hosted' | 'cloud';
  blob_driver: 'disk' | 's3'; encrypt_files: boolean; sync_interval_seconds: number; backup_schedule: 'off' | 'daily' | 'weekly';
  backup_keep: number; backup_last_at: string; backup_last_status: string; ocr_enabled: boolean; trash_retention_days: number;
  app_prefs: { default_project_view: string; default_prompt_type: string; date_format: string };
}
const DEFAULTS: ServerSettings = {
  session_idle_minutes: 30, session_max_days: 30, upload_max_mb: 50, storage_mode: 'local', blob_driver: 'disk', encrypt_files: true, sync_interval_seconds: 30,
  backup_schedule: 'off', backup_keep: 7, backup_last_at: '', backup_last_status: '', ocr_enabled: false, trash_retention_days: 30,
  app_prefs: { default_project_view: 'list', default_prompt_type: 'optional', date_format: 'relative' },
};
let current: ServerSettings = DEFAULTS;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export async function refreshServerSettings() {
  try { current = { ...DEFAULTS, ...(await api<ServerSettings>('/api/settings')) }; loaded = true; void metaSet('serverSettings', current); emit(); }
  catch { const c = await metaGet<ServerSettings>('serverSettings'); if (c) { current = { ...DEFAULTS, ...c }; emit(); } }
  return current;
}
export async function patchServerSettings(p: Partial<ServerSettings>) {
  current = { ...DEFAULTS, ...(await api<ServerSettings>('/api/settings', { method: 'PATCH', body: p })) };
  void metaSet('serverSettings', current);
  emit();
  return current;
}
export function useServerSettings() {
  const v = useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l); }, () => current);
  useEffect(() => { if (!loaded) void refreshServerSettings(); }, []);
  return v;
}
