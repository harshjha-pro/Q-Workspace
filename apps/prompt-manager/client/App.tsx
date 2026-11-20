import { useEffect, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import AppShell from './layout/AppShell';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Workspace, { SubprojectsTab } from './pages/workspace/Workspace';
import Overview from './pages/workspace/Overview';
import PromptsPage from './pages/workspace/Prompts';
import PromptEditorPage from './pages/workspace/PromptEditor';
import CollectionsTab, { CollectionDetail } from './pages/workspace/Collections';
import PromptPackPage from './pages/workspace/PromptPack';
import FilesTab from './pages/workspace/Files';
import FileDetail, { FileCompare } from './pages/workspace/FileDetail';
import { TasksTab, NotesTab, ActivityTab } from './pages/workspace/Productivity';
import BulkImport from './pages/BulkImport';
import VaultPage from './pages/Vault';
import LibraryPage, { TemplateDetail, TemplateEditor } from './pages/Library';
import { SearchPage, FavouritesPage, AllCollectionsPage } from './pages/Global';
import SettingsPage from './pages/settings/Settings';
import { Login, ChangePasswordScreen, UnlockScreen, SetupScreen } from './pages/auth/Auth';
import { DialogHost, ToastHost } from './components/overlay';
import { Card, EmptyState } from './components/ui';
import { useSession } from './lib/session';
import { BASE } from './lib/api';
import { refreshServerSettings } from './lib/serverSettings';
import { store } from './lib/store';

function NotFound() {
  return <Card><EmptyState icon={<Compass />} title="Page not found" action={<Link className="btn btn-primary" to="/">Go to dashboard</Link>}>The page you were looking for doesn’t exist.</EmptyState></Card>;
}

function makeRouter() {
  return createBrowserRouter([
    {
      element: <AppShell />,
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'projects', element: <Projects /> },
        {
          path: 'p/:id', element: <Workspace />,
          children: [
            { index: true, element: <Overview /> },
            { path: 'subprojects', element: <SubprojectsTab /> },
            { path: 'prompts', element: <PromptsPage /> },
            { path: 'prompts/new', element: <PromptEditorPage /> },
            { path: 'prompts/:pid', element: <PromptsPage /> },
            { path: 'prompts/:pid/edit', element: <PromptEditorPage /> },
            { path: 'collections', element: <CollectionsTab /> },
            { path: 'collections/:cid', element: <CollectionDetail /> },
            { path: 'collections/:cid/pack', element: <PromptPackPage /> },
            { path: 'pack', element: <PromptPackPage /> },
            { path: 'files', element: <Navigate to="reference" replace /> },
            { path: 'files/:category', element: <FilesTab /> },
            { path: 'file/:fid', element: <FileDetail /> },
            { path: 'file/:fid/compare', element: <FileCompare /> },
            { path: 'tasks', element: <TasksTab /> },
            { path: 'notes', element: <NotesTab /> },
            { path: 'activity', element: <ActivityTab /> },
          ],
        },
        { path: 'library', element: <LibraryPage /> },
        { path: 'library/new', element: <TemplateEditor /> },
        { path: 'library/:tid', element: <TemplateDetail /> },
        { path: 'library/:tid/edit', element: <TemplateEditor /> },
        { path: 'collections', element: <AllCollectionsPage /> },
        { path: 'search', element: <SearchPage /> },
        { path: 'favourites', element: <FavouritesPage /> },
        { path: 'import', element: <BulkImport /> },
        { path: 'vault', element: <VaultPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'settings/:section', element: <SettingsPage /> },
        { path: '*', element: <NotFound /> },
      ],
    },
  ], { basename: BASE.replace(/\/$/, '') || '/' });
}

function Workspace_() {
  const router = useMemo(makeRouter, []);
  useEffect(() => { void refreshServerSettings().then((s) => store.setSyncInterval(s.sync_interval_seconds)); }, []);
  return <RouterProvider router={router} />;
}

export default function App() {
  const s = useSession();
  return (
    <>
      {s.phase === 'boot' && <div className="loader-page" aria-busy>Loading…</div>}
      {s.phase === 'setup' && <SetupScreen />}
      {s.phase === 'login' && <Login />}
      {s.phase === 'change_password' && <ChangePasswordScreen />}
      {s.phase === 'unlock' && <UnlockScreen />}
      {s.phase === 'ready' && <Workspace_ />}
      <DialogHost />
      <ToastHost />
    </>
  );
}
