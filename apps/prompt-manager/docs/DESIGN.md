# Prompt & Project Manager — Screen Inventory & Design System

This document is the build blueprint. The PRD is the source of truth; the reference
images are visual guidance only.

---

## 1. Design system

### 1.1 Tokens (`client/styles/tokens.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F7FB` | `#0E1320` | App canvas |
| `--surface` | `#FFFFFF` | `#161D2E` | Cards, sheets, inputs |
| `--surface-2` | `#F1F3F9` | `#1C2438` | Hover, segmented controls, table heads |
| `--border` | `#E4E7EF` | `#273049` | Hairlines |
| `--text` | `#0F172A` | `#E6EAF3` | Primary text |
| `--text-2` | `#5B6478` | `#A3ACC2` | Secondary text |
| `--text-3` | `#8A93A6` | `#6F7891` | Hints, meta |
| `--primary` | `#3F51A3` | `#7D8EE0` | Primary actions, active nav |
| `--primary-soft` | `#ECEFFB` | `#232C4A` | Selected rows, chips |
| `--sidebar` | `#1B2440` | `#0A0F1C` | Desktop sidebar |
| `--success` | `#1F9D55` | `#3CC27A` | Completed, Optional badge, synced |
| `--warning` | `#E59A0B` | `#F2B544` | Favourite star, pending |
| `--danger` | `#D64545` | `#F07474` | Delete, errors, Mandatory accent ring |

Mandatory prompts use the **primary** badge plus a left accent bar. Optional prompts use the
**success** badge. Status uses **neutral** for Not Started, **primary** for In Progress and
**success** for Completed.

* **Typography:** Inter Variable, self-hosted for offline use. Scale: 28/22/18/15/14/13/12 px.
  Weights are 400 for body, 500 for labels and 600 for headings. The tabular-numbers feature
  is used for stats.
* **Spacing:** a 4 px base, using 4, 8, 12, 16, 20, 24, 32 and 40.
* **Radius:** 8 px for controls, 12 px for cards and 16 px for sheets.
  Shadows are a single soft elevation.
* **Motion:** 120–180 ms opacity and transform changes only, disabled under
  `prefers-reduced-motion`.
* **Touch:** targets are at least 44 px on mobile. Inputs use a 16 px font on mobile so iOS
  doesn't zoom in.

### 1.2 Components (`client/components/`)

| Component | Notes |
|---|---|
| `Button` | Variants: primary, secondary, ghost, danger, outline. Sizes: sm, md, lg. Supports an icon and a loading state. |
| `IconButton` | Square ghost button with an `aria-label`. |
| `Input`, `Textarea`, `Select`, `Field` | Label, hint, error and required marker. |
| `Checkbox`, `Radio`, `Switch`, `Segmented` | Accessible native inputs, restyled. |
| `Badge`, `TypeBadge`, `StatusBadge`, `Chip`, `TagInput` | Tags are a free-entry list with autocomplete from known tags. |
| `Card`, `StatCard`, `ListRow`, `EmptyState`, `Skeleton` | |
| `Tabs` | Horizontally scrollable on mobile, so it never overflows. |
| `Modal` | A centred dialog on desktop and a **bottom sheet** (or full screen) at ≤ 720 px. |
| `ActionMenu` | A popover on desktop and a bottom-sheet action list on mobile. |
| `ConfirmDialog`, `Toast` | |
| `Stepper` | Used by the bulk import wizard. |
| `ProgressBar`, `FileIcon`, `Breadcrumbs`, `PageHeader`, `SearchBox`, `Pagination` | |
| `VariableForm` | Detects `{variables}` and renders a fill-in form with a live preview. |
| `DiffView` | Side by side on desktop; on mobile, a toggle between Before, After and Changes. |

### 1.3 Layout

* **Desktop (≥ 1024 px):** a 240 px dark sidebar, a top bar with global search, sync status and
  account, and a content area with a maximum width of 1280 px.
* **Tablet (721–1023 px):** a 72 px icon rail sidebar with the same top bar.
* **Mobile (≤ 720 px):** a top app bar with back, title and actions, plus a **bottom navigation**
  (Home, Projects, Search, Library, More). More opens a sheet with Collections, Favourites,
  Pinned, Bulk Import, Settings, Sync and Logout. Primary actions use a floating button or a
  sticky bottom bar within thumb reach.

---

## 2. Screen inventory

| # | Screen | Route | Desktop | Mobile |
|---|---|---|---|---|
| A1 | Login | `/login` | Centred card | Full screen, large inputs |
| A2 | Forced password change | `/change-password` | Card with a strength meter | Full screen |
| A3 | Offline unlock / idle lock | (overlay) | Card | Full screen |
| D1 | Dashboard | `/` | Stats grid, quick actions, recent, pinned, favourites, active, activity | Stats 2×2, quick actions as horizontal chips, stacked sections |
| P1 | Projects list | `/projects` | Table-like rows with filters (status, tag, archived), sort | Cards, filter sheet, FAB |
| P2 | Create or edit project / subproject | sheet | Modal | Full-screen sheet |
| W0 | Workspace (project or subproject) | `/p/:id/:tab` | Header, tab bar, breadcrumbs | Header, scrollable tabs |
| W1 | Overview | `/p/:id` | Stats, progress, quick actions, recent items | Stacked |
| W2 | Subprojects | `/p/:id/subprojects` | Rows | Cards |
| W3 | Prompts | `/p/:id/prompts` | Filter rail, list, detail split view | List, then full-screen detail |
| W4 | Prompt editor | `/p/:id/prompts/:pid/edit`, `/new` | Panel | **Full-screen editor** with sticky Save |
| W5 | Prompt detail: Use / Variables / History / Compare | `/p/:id/prompts/:pid` | Split | Full screen with tabs |
| W6 | Collections | `/p/:id/collections` | Rows | Cards |
| W7 | Collection detail and workflow runner | `/p/:id/collections/:cid` | Steps and runner | Step-by-step runner with a large Next button |
| W8 | Reference / Additional / AI Output files | `/p/:id/files/:category` | Grid or list | List, upload button |
| W9 | File detail: preview, versions, compare | `/p/:id/file/:fid` | Preview, info rail | Preview, info sheet |
| W10 | Version compare | `/p/:id/file/:fid/compare` | Side by side | A/B/Diff toggle |
| W11 | Tasks | `/p/:id/tasks` | Checklist with progress | Same, with an add bar |
| W12 | Notes | `/p/:id/notes` | Master–detail Markdown editor | List, then full-screen editor |
| W13 | Activity history | `/p/:id/activity` | Timeline | Timeline |
| W14 | Prompt pack generator | `/p/:id/pack`, `/p/:id/collections/:cid/pack` | Select, variables, result | Three-step full screen |
| I1 | Bulk import wizard | `/import` | Five-step stepper | Stepper with paste and file picker |
| L1 | Template library | `/library` | Card grid with tag filters | Card list |
| L2 | Template editor and detail | `/library/:tid` | Panel | Full screen |
| L3 | Use template (insert into project) | sheet | Modal | Full-screen sheet |
| C1 | All collections | `/collections` | Grouped by project | List |
| S1 | Global search | `/search` | Filters rail and results | Filter chips, results |
| F1 | Favourites and pinned | `/favourites` | Sections | Sections |
| T1 | Settings: Account, Security, Storage, Sync and Conflicts, Backup, Application, Tags, Trash, About | `/settings/:section` | Side tabs | Section list, then detail |
| T2 | Conflict resolver | `/settings/sync` | Side by side | Toggle view |

---

## 3. Architecture

* **Server:** Fastify, SQLite (WAL, FTS5) and a pluggable blob store (disk or S3-compatible).
  Files are encrypted at rest with AES-256-GCM.
* **Client:** React with an **encrypted local replica** in IndexedDB. Reads are served locally, so
  the app works offline. Writes go to an outbox and are pushed to `/api/sync/push`. Conflicts are
  detected per field against the base the client last saw.
* **Online-only operations** are those that need the server: file upload (offline uploads are
  queued), bulk import, server-side document text extraction, full-text document search (offline
  search falls back to local metadata), backup and restore, and storage migration.
