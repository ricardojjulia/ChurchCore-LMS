# ChurchCore LMS — UI Specification
**Version 1.0 · June 2026**

This document is the authoritative reference for all visual and interaction design in ChurchCore LMS. Every screen, component, and pattern must conform to these rules. When in doubt, match existing pages exactly rather than introducing new conventions.

---

## 1. Technology Foundation

| Concern | Choice |
|---|---|
| Framework | Next.js 15, App Router, React Server Components |
| Styling | Tailwind CSS v3 with `tailwindcss-animate` plugin |
| Component library | shadcn/ui (Radix UI primitives) |
| Icons | Inline emoji for semantic icons; no icon library |
| Animation | Tailwind `animate-*` utilities only; no Framer Motion |

---

## 2. Typography

### Typeface
**Inter** is the sole typeface across the entire application. Load via `next/font/google`. No fallback fonts are displayed in production.

```css
font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
```

### Scale

| Usage | Class | Size |
|---|---|---|
| Page title (hero) | `text-3xl font-extrabold` | 30px / 800 |
| Page title (admin list) | `text-2xl font-extrabold` | 24px / 800 |
| Section heading | `text-xl font-extrabold` or `text-base font-bold` | 20px or 16px / 700–800 |
| Card title / label | `text-sm font-bold` or `font-semibold` | 14px / 600–700 |
| Body text | `text-sm` | 14px / 400 |
| Caption / metadata | `text-xs` | 12px / 400 |
| Monospace (codes, IDs) | `font-mono text-xs` or `font-mono text-sm` | browser mono |

### Rules
- Tracking (`tracking-tight`) only on hero-size page titles.
- Never use `text-base` for body copy — use `text-sm` everywhere.
- `text-foreground` for primary readable text. `text-muted-foreground` for secondary/metadata text. Never use raw Tailwind gray values (`text-gray-*`, `text-slate-*`) for text — always use the semantic tokens.

---

## 3. Color System

### CSS Custom Properties (Light Mode)

```css
:root {
  --background:           210 40% 98%;   /* #f8fafc — page background */
  --foreground:           220 20% 10%;   /* near-black — primary text */

  --card:                 0 0% 100%;     /* white — card surfaces */
  --card-foreground:      220 20% 10%;

  --primary:              220 65% 32%;   /* deep ministry blue */
  --primary-foreground:   0 0% 98%;

  --muted:                220 14% 95%;   /* light gray — muted bg */
  --muted-foreground:     220 10% 46%;   /* medium gray — secondary text */

  --border:               220 13% 91%;   /* subtle border */
  --input:                220 13% 91%;   /* input border */
  --ring:                 220 65% 32%;   /* focus ring = primary */

  --destructive:          0 72% 51%;     /* red */
  --destructive-foreground: 0 0% 98%;

  --success:              142 72% 29%;   /* dark green */
  --success-foreground:   0 0% 98%;

  --warning:              38 92% 50%;    /* amber */
  --warning-foreground:   220 85% 10%;

  --radius:               0.5rem;        /* base border radius = 8px */
}
```

### Semantic Accent Palette (inline Tailwind, not tokens)

These are used directly as Tailwind classes for specific semantic meanings and must not be swapped:

| Meaning | Background | Text | Border |
|---|---|---|---|
| Published / Active / Success | `bg-emerald-50` | `text-emerald-700` | `border-emerald-200` |
| Draft / Pending / Warning | `bg-amber-50` | `text-amber-700` | `border-amber-200` |
| Error / Destructive | `bg-rose-50` | `text-rose-600` | `border-rose-200` |
| AI features | `bg-violet-50` | `text-violet-700` | `border-violet-200` |
| Inactive / Archived | `bg-slate-100` | `text-slate-500` | `border-slate-200` |
| Program track / Code badge | `bg-indigo-50` | `text-indigo-700` | `border-indigo-100` |
| Cross-section / Secondary | `bg-slate-200` | `text-slate-700` | — |

### Rules
- Background pages are always `bg-slate-50` (not `bg-white`, not `bg-background`).
- Card surfaces are always `bg-white`.
- The navbar is `bg-slate-900`.
- Never use raw hex values. Always use token variables or named Tailwind palette values.

---

## 4. Border Radius

| Element | Class |
|---|---|
| Cards, panels, modals | `rounded-2xl` |
| Buttons (primary, outlined) | `rounded-xl` |
| Badges, pills, tags | `rounded-full` or `rounded` (small inline) |
| Form inputs, selects | `rounded-md` |
| Contextual small items | `rounded-lg` |

**Rule:** Cards are always `rounded-2xl`. Never use `rounded-lg` or `rounded-xl` on a card. Never mix radii within a single card.

---

## 5. Shadows & Elevation

| Usage | Class |
|---|---|
| Cards on page | `shadow-sm` |
| Floating / active card | `shadow-sm` (same — no elevation jump) |
| Navbar | none (`border-b border-slate-800` provides separation) |

**Rule:** Only `shadow-sm` is used anywhere. `shadow-md`, `shadow-lg`, `shadow-xl` are never used. Depth is communicated through background contrast and border, not shadow size.

---

## 6. Spacing System

All spacing is built from Tailwind's default scale (4px base unit).

### Page Layout

```
<main class="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
  <div class="max-w-5xl mx-auto">        ← list/table pages
  <div class="max-w-2xl mx-auto">        ← single-entity forms
  <div class="max-w-xl mx-auto">         ← narrow focused forms
  <div class="max-w-6xl mx-auto">        ← analytics / wide dashboards
  <div class="max-w-3xl mx-auto px-4">   ← content editor
```

### Internal Spacing

| Context | Class |
|---|---|
| Between major page sections | `space-y-8` |
| Between form fields | `space-y-5` or `space-y-6` |
| Between cards in a list | `space-y-4` |
| Card padding (default) | `p-6` or `px-6 py-4` |
| Card padding (hero/header) | `px-8 py-7` |
| Card padding (centered empty state) | `p-12` |
| Table cell padding | `px-6 py-4` (primary) / `px-4 py-3` (header) |

---

## 7. Component Patterns

### 7.1 Page Header

Every list/admin page opens with a header row containing the title + primary action:

```html
<div class="flex items-start justify-between gap-4 flex-wrap mb-8">
  <div>
    <h1 class="text-2xl font-extrabold text-foreground">Page Title</h1>
    <p class="text-sm text-muted-foreground mt-1">Subtitle or description.</p>
  </div>
  <a href="/..." class="inline-flex items-center gap-2 bg-primary text-primary-foreground
     font-bold px-4 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors">
    + New Item
  </a>
</div>
```

### 7.2 Buttons

**Primary**
```
bg-primary text-primary-foreground font-bold px-4 py-2 rounded-xl text-sm
hover:bg-primary/90 transition-colors disabled:opacity-50
```

**Outline / Secondary**
```
border border-border rounded-lg px-3 py-1.5 text-sm font-semibold
text-muted-foreground hover:bg-slate-50 transition-colors
```

**Destructive text (no background)**
```
text-sm font-semibold text-rose-600 hover:text-rose-800 transition-colors
```

**AI / Feature action (violet)**
```
bg-violet-600 text-white font-semibold px-3 py-1.5 rounded-xl text-sm
hover:bg-violet-700 disabled:opacity-50 transition-colors
```

**Text link**
```
text-sm text-primary hover:underline
```

### 7.3 Status Badges

All badges follow this structure — swap the color group per semantic meaning:

```html
<span class="text-xs font-bold px-2.5 py-0.5 rounded-full border
             bg-emerald-50 text-emerald-700 border-emerald-200">
  Published
</span>
```

| State | bg / text / border |
|---|---|
| Published / Active | `bg-emerald-50 text-emerald-700 border-emerald-200` |
| Draft / Pending | `bg-amber-50 text-amber-700 border-amber-200` |
| Archived / Inactive | `bg-slate-100 text-slate-500 border-slate-200` |
| Error / Failed | `bg-rose-50 text-rose-600 border-rose-200` |
| Processing / AI | `bg-violet-50 text-violet-700 border-violet-200` |

### 7.4 Cards

**Standard card**
```
bg-white border border-border rounded-2xl shadow-sm
```

**Card with internal header section**
```html
<div class="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
  <div class="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-50">
    <!-- header content -->
  </div>
  <div class="px-6 py-4">
    <!-- body content -->
  </div>
</div>
```

**Empty state card**
```html
<div class="bg-white border border-border rounded-2xl p-12 text-center shadow-sm">
  <p class="text-muted-foreground">Nothing here yet.</p>
  <a href="/..." class="mt-3 inline-block text-sm text-primary hover:underline">
    Create the first one →
  </a>
</div>
```

### 7.5 Tables

Always wrapped in a `rounded-2xl overflow-hidden` card — never a bare `<table>`.

```html
<div class="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
  <table class="w-full text-sm">
    <thead class="bg-slate-50 border-b border-border">
      <tr>
        <th class="text-left px-6 py-3 font-semibold text-muted-foreground">Column</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-6 py-4 font-semibold text-foreground">Value</td>
      </tr>
    </tbody>
  </table>
</div>
```

Table columns follow a consistent pattern:
- Primary label: `font-semibold text-foreground`
- Secondary metadata below it: `text-xs text-muted-foreground`
- Code / identifier: `text-xs text-muted-foreground font-mono`
- Actions column: right-aligned, `text-sm font-semibold text-primary hover:underline`

### 7.6 Form Inputs

```html
<!-- Text input -->
<input class="w-full border border-input rounded-md px-4 py-2.5 text-sm
              text-foreground bg-background placeholder:text-muted-foreground
              focus:outline-none focus:ring-2 focus:ring-ring transition" />

<!-- Textarea -->
<textarea class="w-full border border-input rounded-md px-4 py-2.5 text-sm
                 text-foreground bg-background resize-none
                 focus:outline-none focus:ring-2 focus:ring-ring transition" />

<!-- Select -->
<select class="w-full border border-input rounded-md px-4 py-2.5 text-sm
               text-foreground bg-background
               focus:outline-none focus:ring-2 focus:ring-ring transition" />
```

**Form labels**
```
block text-sm font-semibold text-foreground mb-1.5
```

Required marker: `<span class="text-rose-500">*</span>` after the label text.

**Field hint / helper text**
```
text-xs text-muted-foreground mt-1
```

**Inline error under a field**
```
text-xs text-rose-600 mt-1
```

**Form-level error banner**
```
bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-800 text-sm
```

**Form-level success banner**
```
bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-800 text-sm
```

**Form layout**

Forms are always inside a white card. Submit + Cancel are in a flex row at the bottom:

```html
<div class="flex gap-3 pt-2">
  <button type="submit" class="[primary button classes]">Save</button>
  <a href="/..." class="[outline button classes]">Cancel</a>
</div>
```

Destructive action (delete) is on the opposite end:
```html
<div class="flex items-center justify-between pt-2">
  <button class="[destructive text button]">Delete</button>
  <div class="flex gap-3">
    <a>[Cancel]</a>
    <button>[Save]</button>
  </div>
</div>
```

### 7.7 Breadcrumb Navigation

Used inside pages, not as a global component:

```html
<nav class="flex items-center gap-2 text-sm text-slate-400 mb-6">
  <a href="/admin/blueprints" class="hover:text-primary font-medium">Blueprints</a>
  <span>/</span>
  <span class="text-foreground font-semibold">New</span>
</nav>
```

Or as a compact top bar for edit pages:
```html
<div class="border-b border-border px-4 py-2 flex items-center gap-2
            text-xs text-muted-foreground bg-slate-50">
  <span>Parent</span>
  <span>/</span>
  <span class="font-medium text-foreground truncate">Current Page</span>
</div>
```

### 7.8 Loading / Streaming Indicator

Three pulsing dots — used for all async operations (AI streaming, report generation, search):

```html
<div class="flex items-center gap-3 text-sm text-muted-foreground py-3">
  <span class="flex gap-1">
    <span class="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
    <span class="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
    <span class="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
  </span>
  Loading message…
</div>
```

Use `bg-violet-400` for AI features. Use `bg-primary/60` for generic loading.

---

## 8. Navigation

### Top Navbar

```
sticky top-0 z-40 w-full bg-slate-900 border-b border-slate-800 h-14
```

Internal layout: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4`

**Nav links (horizontal, scrollable on mobile)**

```
px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
text-slate-400 hover:text-white hover:bg-slate-800     ← default
bg-slate-800 text-white                                 ← active
```

Active state is determined by `pathname === href || pathname.startsWith(href + '/')`.

**Right side of navbar (left to right):** Global search → Notification bell → Avatar → Sign out.

### Visibility Rules

| Role | Sees |
|---|---|
| `student` | Dashboard, Courses, Grades, Certificates, Leaderboard, Messages, Announcements, Calendar, My Groups |
| `teacher` | All student links + HQ |
| `admin`, `manager` | All student links + HQ + Users, Cohorts, Sections, Terms, Blueprints, AI Analytics |
| `guardian` | Student links + Guardian Portal |

---

## 9. Accessibility

- Every page has `<main id="main-content">` as the direct content wrapper.
- A skip-nav link is rendered at the top of the layout, visible only on focus.
- Focus ring: `outline: 2px solid hsl(var(--ring)); outline-offset: 2px; border-radius: 4px;`
- All icon-only UI elements have `aria-label` or `<span class="sr-only">`.
- Color is never the sole differentiator — badges always pair color with a text label.
- Target: WCAG 2.1 AA.

---

## 10. Responsive Behaviour

The application is desktop-first. Mobile is supported via a fixed bottom nav bar, not a hamburger menu. The top navbar is horizontally scrollable on small screens (`overflow-x-auto` with scrollbar hidden).

| Breakpoint | Behaviour |
|---|---|
| `sm` (640px+) | Two-column grids, wider padding |
| `md` (768px+) | Bottom nav hides, top nav fully visible |
| `lg` (1024px+) | Three-column grids, full layout |

Form grids use `grid-cols-2 gap-4` on all screen sizes — no single-column collapse on mobile for forms.

A mobile warning is shown inside the editor:
```html
<div class="sm:hidden bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4
            text-sm text-amber-800">
  For the best editing experience, use a desktop or tablet.
</div>
```

---

## 11. Page-Type Templates

### List Page (Admin)
```
Page header (title + "New" button)
↓
[Optional filter/search row]
↓
Table card (rounded-2xl, shadow-sm)
  thead: bg-slate-50, border-b
  tbody: divide-y, hover:bg-slate-50
  Each row: primary label + secondary metadata + badge + action link
↓
[Empty state card if no rows]
```

### Detail / Edit Form Page
```
Breadcrumb nav
↓
White card (rounded-2xl, p-8, shadow-sm)
  Section title (text-xl font-extrabold, mb-6)
  ↓
  Form fields (space-y-5)
  ↓
  Error / success banner (if any)
  ↓
  Buttons row (submit + cancel, or destructive + cancel + save)
```

### Dashboard / Analytics Page
```
Page header
↓
Summary cards row (grid-cols-2 sm:grid-cols-4, gap-4)
  Each: white card, px-5 py-4, label text-xs text-muted-foreground, value text-2xl font-extrabold
↓
Charts / tables section (space-y-6 or grid gap-6)
↓
Detail panels or reports
```

---

## 12. Writing Style (UI Copy)

- **Labels:** Title case for headings. Sentence case for descriptions and helper text.
- **Empty states:** Friendly, never apologetic. "No blueprints yet." not "There are currently no blueprints."
- **Action links at end of empty states:** Always end with ` →` (space + arrow).
- **Descriptions under page titles:** One sentence, lowercase after first word, ends with a period.
- **Error messages:** Start with the problem, not "Error:". "A term with that code already exists." not "Error: Duplicate code."
- **Button labels:** Verb first. "Create Blueprint", "Save Changes", "Generate Analysis".
- **No exclamation marks** anywhere in the UI.
