# ChurchCore Design System & UI/UX Specification

> **Target Audience:** AI Coding Assistants & Full-Stack Developers building sister software in the ChurchCore ecosystem.
> **Objective:** Ensure 100% visual, stylistic, architectural, and behavioral parity with ChurchCore LMS and Orthos design standards.

---

## 1. Visual DNA & Brand Identity

ChurchCore software embodies a sleek, dark-mode first, high-productivity aesthetic designed for churches, theological institutions, and educational networks.

- **Aesthetic Style:** Deep dark mode, layered slate surfaces, glassmorphism overlays, soft ambient glows, subtle micro-animations.
- **Tone:** Reverent, authoritative, modern, and accessible.
- **Default Theme:** Dark mode is the primary baseline (`slate-950` / `#020617`).

---

## 2. Color Palette & Design Tokens

### Tailwind CSS Configuration (`tailwind.config.ts`)

```typescript
import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        church: {
          navy: '#0B2545',
          cream: '#F9F7F1',
          accent: '#134074',
          muted: '#8DA9C4',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        xl: '0.75rem',
        lg: '0.5rem',
        md: '0.375rem',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
export default config
```

### CSS Variables (`globals.css`)

```css
@layer base {
  :root {
    --background: 222 47% 4%;     /* #020617 - slate-950 */
    --foreground: 210 40% 98%;    /* #f8fafc - slate-50 */

    --card: 222 47% 7%;           /* #0f172a - slate-900 */
    --card-foreground: 210 40% 98%;

    --popover: 222 47% 7%;
    --popover-foreground: 210 40% 98%;

    --primary: 234 89% 64%;       /* #6366f1 - indigo-500 */
    --primary-foreground: 0 0% 98%;

    --secondary: 217 33% 16%;     /* #1e293b - slate-800 */
    --secondary-foreground: 210 40% 98%;

    --muted: 217 33% 16%;
    --muted-foreground: 215 20% 65%; /* #94a3b8 - slate-400 */

    --border: 217 33% 20%;        /* #334155 - slate-700/50 */
    --input: 217 33% 20%;
    --ring: 234 89% 64%;
  }
}
```

### Color Usage Matrix

| Element | Tailwind Class | Hex / Equivalent | Purpose |
|---|---|---|---|
| **App Background** | `bg-slate-950` | `#020617` | Canvas / Base page background |
| **Card / Surface** | `bg-slate-900` | `#0f172a` | Containers, cards, tables, modals |
| **Surface Gradient** | `bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950` | Layered | Premium card surface elevation |
| **Borders** | `border-slate-800` / `border-slate-800/80` | `#1e293b` | Default crisp dividing line |
| **Primary CTA** | `bg-indigo-600 hover:bg-indigo-500` | `#4f46e5` | Primary buttons, active tabs |
| **Primary Shadow** | `shadow-lg shadow-indigo-600/30` | Indigo glow | Elevated primary action depth |
| **Pill Backgrounds**| `bg-indigo-500/10 border border-indigo-500/20` | Transparent | Categorical badges, headers |
| **Success State** | `bg-emerald-950 text-emerald-300 border-emerald-800` | Emerald | Completed, verified, paid |
| **Warning State** | `bg-amber-950 text-amber-300 border-amber-800` | Amber | Pending, trial, caution |
| **Error / Destructive** | `bg-rose-950 text-rose-400 border-rose-800` | Rose | Failed, suspended, delete |

---

## 3. Typography & Hierarchy

- **Font Family:** `Inter`, system fallback sans-serif.
- **Rules:**
  - Headings are tight-tracked (`tracking-tight`), crisp white (`text-white`).
  - Body text uses `text-slate-300` or `text-slate-200` with comfortable line height (`leading-relaxed`).
  - Supporting metadata is small (`text-xs` or `text-[11px]`), using `text-slate-400` or `text-slate-500`.

### Type Scale

```tsx
// Page Title
<h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
  <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
    📚
  </span>
  Page Title Here
</h1>

// Section Title
<h2 className="text-xl font-bold text-white tracking-tight">Section Heading</h2>

// Card Title
<h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
  Card Item Title
</h3>

// Body Text
<p className="text-sm text-slate-300 leading-relaxed">
  Standard paragraph body explaining the workflow or content.
</p>

// Subtitle / Caption
<p className="text-xs text-slate-400 mt-1">
  Help text or secondary description under a heading.
</p>

// Pill / Micro Label
<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
  Metadata Tag
</span>
```

---

## 4. Layout Architecture & Standard Page Scaffold

Every full-page view adheres to the standard ChurchCore scaffold:

```tsx
export default async function StandardPage() {
  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          {/* Breadcrumb / Category Pill */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Module Name
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400">Section Subtitle</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              ⚡
            </span>
            Feature Title
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Descriptive subtitle outlining what the user accomplishes on this page.
          </p>
        </div>

        {/* Action Header Button Row */}
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all flex items-center gap-2">
            <span>Secondary Action</span>
          </button>
          <button className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all flex items-center gap-2">
            <span>+ Primary Action</span>
          </button>
        </div>
      </div>

      {/* 2. Metrics / Stat Row (Optional) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs font-medium text-slate-400">Metric Label</span>
          <p className="text-2xl font-bold text-white">1,240</p>
        </div>
        {/* ... */}
      </div>

      {/* 3. Main Content / Interactive Grid / Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        {/* Table or Content */}
      </div>
    </div>
  )
}
```

---

## 5. Reusable Component Patterns

### Buttons

```tsx
// Primary CTA
<button className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50">
  Save Changes
</button>

// Secondary / Neutral Button
<button className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all">
  Cancel
</button>

// Destructive Button
<button className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-all">
  Delete Item
</button>
```

### Form Inputs

```tsx
<div className="space-y-1.5">
  <label className="text-xs font-semibold text-slate-300">Email Address</label>
  <input
    type="email"
    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
    placeholder="pastor@church.org"
  />
</div>
```

### Cards & Grid Items

```tsx
<div className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-6 flex flex-col justify-between shadow-lg hover:border-slate-700 transition-all group">
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <span className="p-2.5 rounded-xl bg-slate-800/80 text-xl border border-slate-700/50">
        📖
      </span>
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
        Active
      </span>
    </div>
    <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
      Card Title
    </h3>
    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
      Card description providing concise context.
    </p>
  </div>
</div>
```

### Modals & Dialogs

```tsx
<div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
  <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
    <div className="flex items-start justify-between">
      <div>
        <h3 className="text-lg font-bold text-white">Modal Header</h3>
        <p className="text-xs text-slate-400 mt-1">Brief instructions for the action.</p>
      </div>
      <button className="text-slate-400 hover:text-white text-lg p-1">✕</button>
    </div>

    <div className="space-y-4">
      {/* Modal form / content */}
    </div>

    <div className="flex items-center justify-end gap-3 pt-2">
      <button className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300">
        Cancel
      </button>
      <button className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
        Confirm Action
      </button>
    </div>
  </div>
</div>
```

### Data Tables

```tsx
<div className="overflow-x-auto">
  <table className="w-full text-left text-xs">
    <thead className="text-slate-400 uppercase tracking-wider border-b border-slate-800">
      <tr>
        <th className="py-3 px-3">Name</th>
        <th className="py-3 px-3">Role</th>
        <th className="py-3 px-3">Status</th>
        <th className="py-3 px-3 text-right">Actions</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-800/60 text-slate-300">
      <tr className="hover:bg-slate-800/40 transition-colors">
        <td className="py-3 px-3 font-medium text-white">John Doe</td>
        <td className="py-3 px-3 text-slate-400">Teacher</td>
        <td className="py-3 px-3">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
            Active
          </span>
        </td>
        <td className="py-3 px-3 text-right">
          <button className="text-xs text-indigo-400 hover:underline">Edit</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 6. Internationalization & Multi-Language Standards (i18n)

All ChurchCore software must support multi-lingual operations out of the box.

- **Stack:** `next-intl`
- **Supported Locales:**
  - `en` (English - default)
  - `es` (Spanish)
  - `pt` (Portuguese)

### Structure (`messages/*.json`)

```json
{
  "common": {
    "save": "Save Changes",
    "cancel": "Cancel",
    "delete": "Delete",
    "loading": "Loading…",
    "error": "An error occurred. Please try again."
  },
  "nav": {
    "dashboard": "Dashboard",
    "courses": "Courses",
    "settings": "Settings"
  }
}
```

### Client Usage

```tsx
import { useTranslations } from 'next-intl'

export default function MyComponent() {
  const t = useTranslations('common')
  return <button>{t('save')}</button>
}
```

---

## 7. Multi-Tenant Organization & Security Architecture

1. **Strict Data Isolation:** Every query and table must filter by `org_id` and enforce Row Level Security (RLS).
2. **Role Hierarchy:**
   - `student` / `learner` (Read-only enrolled content)
   - `teacher` / `instructor` (Course creation, grading, attendance)
   - `manager` (Program tracks, sections, reporting)
   - `admin` (Billing, settings, SSO, memberships)
   - `platform_admin` (Cross-tenant maintenance)
3. **Synthetic Tenant Guard:** QA synthetic tenants are marked `is_synthetic = true` and must never trigger real billing or external webhook deliveries.

---

## 8. Summary Checklist for AI Coders

When generating UI for any new screen or sister software:
- [ ] **Background:** Is it `bg-slate-950` with `bg-slate-900` cards?
- [ ] **Borders:** Are borders subtle `border-slate-800`?
- [ ] **Typography:** Are titles `text-white font-bold tracking-tight` with `text-slate-400` subtitles?
- [ ] **Rounded Corners:** Are containers `rounded-2xl` and buttons/inputs `rounded-xl`?
- [ ] **Primary Colors:** Is primary CTA `bg-indigo-600 hover:bg-indigo-500` with `shadow-indigo-600/30`?
- [ ] **Pills & Badges:** Are badges subtle semi-transparent pills with matching border colors?
- [ ] **i18n:** Are text strings translated using `next-intl`?
- [ ] **Responsive:** Does layout support mobile drawers and flex/grid column adaptation?
