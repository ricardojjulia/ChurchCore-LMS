# UI Destructive Actions, Confirmation Patterns & Caching Architecture

## 1. Destructive Action Confirmation Pattern (Mandatory)

### Anti-Patterns (NEVER USE)
- **`window.confirm()` or `window.alert()`**: Browser popup blockers, automated test harnesses, and headless or sandbox environments frequently suppress or automatically dismiss native dialogs without executing the callback.
- **Translucent / Floating Backdrop Modals for Inline Actions**: Modals that render dynamic overlays under pointer coordinates or attach uncoordinated `pointer-events` / `onClick` outside-click listeners risk instantaneous self-dismissal due to event bubbling when the trigger button is clicked.

### Established Standard: Inline 2-Step Confirmation
Always use deterministic, inline two-step confirmation state machines for destructive deletions:
- Trigger button (e.g. `🗑️ Delete Module`, `Delete Item`, `×`) transitions local state to a confirming state (`deletingId === item.id` or `confirmDeleteModule === true`).
- The UI replaces the trigger button in-place with:
  1. A high-contrast confirmation button: `[Delete]` / `[Confirm Delete]` (with loading spinner during pending transition).
  2. A cancel button: `[Cancel]` (which resets the confirmation state immediately).
- For severe errors, render in-app dismissible banner notifications (`actionError` state) rather than `alert()`.

---

## 2. PWA Service Worker & Cache Invalidation

### Guidelines
- Service worker caching (`@ducanh2912/next-pwa` or Workbox) can aggressively cache Next.js App Router chunks, causing users and automated testing to execute stale Javascript bundles across deployments.
- When disabling PWA or deploying critical fixes, ensure:
  1. Service workers are unregistered proactively in client bootstrap (`navigator.serviceWorker.getRegistrations()`).
  2. Stale `window.caches` (CacheStorage) keys are purged.
  3. `next.config.mjs` disables PWA in environments where real-time freshness is critical.

---

## 3. Server Actions & Cascading DB Deletions

### Guidelines
- When deleting hierarchical entities (e.g., `courses` -> `course_modules` -> `course_blocks`):
  1. Always verify caller authorization using centralized helper (`getStaffCaller`).
  2. Perform explicit cascading cleanup of foreign-key references (`block_submissions`, `survey_responses`, `survey_participation`, `checklist_progress`) if not handled by `ON DELETE CASCADE` in Postgres.
  3. Revalidate affected Next.js paths (`revalidatePath(...)`) immediately upon completion.
