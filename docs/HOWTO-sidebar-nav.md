# HOWTO: Collapsible Side Navigation

ChurchCore LMS ships with a collapsible left-rail sidebar (v0.18.0+). This guide covers usage, customisation, and common extension patterns.

---

## How it works

The sidebar is built from four files:

| File | Role |
|------|------|
| `src/components/layout/SidebarContext.tsx` | React context + `useSidebar()` hook; owns collapse state |
| `src/components/layout/SidebarClient.tsx` | `'use client'` — all visual sidebar UI |
| `src/components/layout/Sidebar.tsx` | Server component — fetches user/profile/counts, renders `SidebarClient` |
| `src/components/layout/SidebarMain.tsx` | `'use client'` content wrapper — applies `md:pl-14` / `md:pl-60` based on collapsed state |

**Collapsed width:** `w-14` (56 px) — icons only, `title` tooltips on hover  
**Expanded width:** `w-60` (240 px) — icons + labels + section headers  
**Transition:** `transition-[width] duration-200` on the sidebar; `transition-[padding-left]` on the content area  
**Persistence:** `localStorage` key `sidebar-collapsed` (`"true"` / `"false"`)  

The sidebar is `hidden md:flex` — invisible on mobile, where the existing bottom nav takes over.

---

## Reading collapse state in any component

```tsx
'use client'
import { useSidebar } from '@/components/layout/SidebarContext'

export function MyComponent() {
  const { collapsed, toggle } = useSidebar()
  return (
    <div className={collapsed ? 'compact-layout' : 'full-layout'}>
      <button onClick={toggle}>Toggle sidebar</button>
    </div>
  )
}
```

Any client component inside `<SidebarProvider>` (which wraps the entire app in `layout.tsx`) can call `useSidebar()`.

---

## Adding a nav link

Open `src/components/layout/SidebarClient.tsx` and add an entry to the `LINKS` array:

```tsx
import { Bell } from 'lucide-react'   // pick any Lucide icon

const LINKS: NavLink[] = [
  // ...existing links
  {
    href:       '/my-new-page',
    label:      'My Page',
    Icon:       Bell,
    adminOnly:  false,   // true → admin/manager only
    staffOnly:  false,   // true → teacher/admin/manager only
    guardianOnly: false, // true → guardian role only
  },
]
```

Badge counts are supported:

```tsx
{ href: '/alerts', label: 'Alerts', Icon: Bell, msgBadge: true }
// msgBadge  → uses messageCount prop
// healthBadge → uses healthErrorCount prop
```

---

## Adding a new nav section

Sections (dividers + labels) are rendered from filtered slices of `LINKS`. If you add a new role (e.g. `teacherOnly`):

1. Add the flag to the `NavLink` interface:
   ```tsx
   interface NavLink {
     // ...
     teacherOnly?: boolean
   }
   ```
2. Filter it in `SidebarClient`:
   ```tsx
   const teacher = LINKS.filter(l => l.teacherOnly && isStaff)
   ```
3. Render it:
   ```tsx
   {teacher.length > 0 && (
     <>
       <SectionDivider label="Teacher" collapsed={collapsed} />
       {teacher.map(link => <NavItem key={link.href} link={link} {...linkProps} />)}
     </>
   )}
   ```
4. Pass the new flag as a prop through `Sidebar.tsx` → `SidebarClient`.

---

## Changing icons

All icons come from `lucide-react`. Browse the full catalogue at [lucide.dev](https://lucide.dev). Import and use:

```tsx
import { BookMarked } from 'lucide-react'

{ href: '/library', label: 'Library', Icon: BookMarked }
```

---

## Persisting to a cookie instead of localStorage

If you need the sidebar state during SSR (to avoid the initial layout flash), store the preference in a cookie instead:

```tsx
// In SidebarContext.tsx, replace localStorage calls:

import { getCookie, setCookie } from 'cookies-next'  // npm i cookies-next

function toggle() {
  setCollapsed((c) => {
    const next = !c
    setCookie('sidebar-collapsed', String(next), { maxAge: 60 * 60 * 24 * 365 })
    return next
  })
}
```

Then in `Sidebar.tsx` (server component), read the cookie and pass it as `defaultCollapsed`:

```tsx
import { cookies } from 'next/headers'

export default async function Sidebar() {
  const cookieStore = await cookies()
  const defaultCollapsed = cookieStore.get('sidebar-collapsed')?.value === 'true'
  // ...
  return <SidebarClient ... defaultCollapsed={defaultCollapsed} />
}
```

And initialise the context state from the prop instead of a `useEffect`.

---

## Hiding the sidebar on specific routes

If a route should render full-screen without the sidebar (e.g. a kiosk learning view), conditionally render `Sidebar` in the layout:

```tsx
// In a nested layout.tsx (e.g. src/app/courses/[id]/learn/layout.tsx):
import { SidebarProvider } from '@/components/layout/SidebarContext'

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  // No <Sidebar> here — full-width learning shell
  return (
    <SidebarProvider>
      <div id="main-content">{children}</div>
    </SidebarProvider>
  )
}
```

Because `SidebarMain` is what applies the `md:pl-60` offset, simply not rendering it gives full-bleed content.

---

## Notification panel placement

`NotificationBell` accepts a `sidebar` prop. In sidebar mode the panel opens **upward** (`bottom-full mb-2`) so it is never clipped by the sidebar's stacking context. This is wired automatically from `SidebarClient` — no action needed unless you embed `NotificationBell` elsewhere.

---

## Mobile behaviour

The sidebar is `hidden md:flex`. On screens narrower than 768 px (`md` breakpoint):

- The sidebar does not render.
- `SidebarMain` applies no left padding (the `md:pl-*` classes are inactive).
- The existing `MobileBottomNav` handles navigation.
- The `pb-16` bottom padding in `SidebarMain` prevents content hiding behind the fixed bottom bar.
