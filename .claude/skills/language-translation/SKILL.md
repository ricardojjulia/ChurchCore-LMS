---
name: language-translation
description: >
  Five-agent pipeline that fully translates any Node.js frontend app into a new language.
  Use this skill whenever the user says "create language translation <language>", asks to add
  a new language or locale to the app, wants to localize the UI, needs i18n support, or wants
  to translate the frontend into another language — even if they don't say "translation"
  explicitly. Auto-detects the framework (React, Next.js, Vue, Svelte), i18n library
  (react-i18next, next-intl, lingui, i18next, vue-i18n, or custom), TypeScript or JSX,
  Mantine/MUI/shadcn/Tailwind UI, and Supabase-stored translations. Maps all UI text,
  translates it, has a native speaker evaluate and correct it, generates implementation code,
  then QA-verifies the result — restarting the full pipeline if anything is missed.
---

# Language Translation Pipeline

Five agents work in sequence to add a complete new language to a Node.js application.
The pipeline auto-detects the tech stack and i18n approach before doing any work.

---

## 0 — Setup

Extract `TARGET_LANGUAGE` and `LOCALE_CODE` from the user's request.

Common codes (use ISO 639-1 for others):

| Language   | Code | | Language    | Code |
|------------|------|-|-------------|------|
| Spanish    | es   | | Portuguese  | pt   |
| French     | fr   | | Italian     | it   |
| German     | de   | | Dutch        | nl   |
| Chinese (Simplified) | zh | | Japanese | ja |
| Korean     | ko   | | Arabic      | ar   |

If no language is specified, ask: *"Which language would you like to add?"*

Create a shared state file in the session scratchpad directory (never `/tmp` directly —
use whatever this environment's actual scratchpad path is): `translation-<LOCALE_CODE>.json`
(empty object `{}`). Every agent reads from and writes to this file — it is the handoff
mechanism between agents.

For a Next.js App Router project with no existing i18n library detected, prefer `next-intl`
over `react-i18next` — it has first-class Server Component / App Router support, which
`react-i18next` does not. Flag this as a new-dependency decision per the host repo's own
dependency rules (e.g. CLAUDE.md "Do not add new dependencies without mentioning it") rather
than silently installing it.

---

## Agent 1 — Stack Detector & UI Text Mapper  *(Explore subagent)*

**What it must do:** Detect the full stack, then build a complete inventory of every
user-facing string in the codebase.

Spawn an **Explore** subagent with the following task:

```
You are scanning a Node.js project to inventory the tech stack and every user-facing string.

## PART A — Stack Detection

Read these files (if they exist):
  - package.json (root and any workspace packages)
  - Any tsconfig.json
  - Any vite.config.*, next.config.*, nuxt.config.*, svelte.config.*
  - .env or .env.example (look for SUPABASE_URL or similar)

Determine and record as "stack_info":
{
  "framework": "react|next|vue|nuxt|svelte|other",
  "typescript": true|false,
  "ui_library": "mantine|mui|shadcn|antd|chakra|tailwind|other|none",
  "package_manager": "pnpm|npm|yarn|bun",
  "monorepo": true|false,
  "source_extensions": [".jsx",".tsx"] or [".vue"] etc — what to scan,
  "i18n_library": {
    "name": "react-i18next|next-intl|lingui|i18next|vue-i18n|custom|none",
    "package": "the npm package name if found",
    "locale_dir": "path to existing locale/translation files if found",
    "existing_locales": ["en", "es", ...],
    "hook_or_function": "t()|useTranslation()|useTranslations()|$t() etc",
    "key_format": "flat|nested|dot-notation",
    "file_format": "json|yaml|po|ts"
  },
  "supabase": {
    "detected": true|false,
    "translations_table": "name of translations table if one exists, else null"
  },
  "app_context": "2–3 sentence description of what the app does, inferred from package.json name/description and any README"
}

To detect a Supabase translations table: look for migrations, SQL files, or Supabase client
calls that reference a table named translations, i18n, locales, or strings. If found, note
its schema (columns).

If no i18n library is detected, record name as "none" — Agent 4 will set one up.

## PART B — UI Text Scan

Scan all source files matching stack_info.source_extensions under:
  - src/, app/, pages/, components/, features/, views/ (and monorepo equivalents)
  - Skip: node_modules/, dist/, .next/, .nuxt/, build/, .git/, .cache/, coverage/

For each HARDCODED user-facing string, record:
{
  "type": "hardcoded",
  "text": "the literal string",
  "file": "relative path from repo root",
  "line": <line number>,
  "context": "component name or surrounding JSX/template element",
  "category": "label|error|placeholder|notification|navigation|button|heading|tooltip|other"
}

Capture: text content between JSX/template tags, string props (placeholder, label, title,
aria-label, alt, tooltip, description, helperText, errorMessage), Mantine component text props,
template literals rendered in the UI.

Skip: console.log/warn/error, code comments, import paths, variable/function names, CSS
classnames, URLs, UUIDs, env var names, SQL strings, API route paths.

For each EXISTING i18n key (if i18n_library.name != "none"), record:
{
  "type": "i18n_key",
  "key": "the.translation.key",
  "existing_value": "default/English value",
  "file": "locale file path",
  "line": <line number>
}

If supabase.translations_table is set, also scan for rows in that table that have
hardcoded strings (look for .insert(), .upsert(), or seed files referencing the table).

## Output

Write to the shared state file:
{
  "stack_info": { ...from Part A... },
  "text_map": [ ...all entries from Part B... ],
  "existing_locales": [...],
  "i18n_package_structure": "brief description of how locale files are organized"
}

End with a summary: framework detected, i18n library detected, hardcoded strings found,
existing i18n keys found, files scanned.
```

After the subagent completes, read the state file:
- Confirm `stack_info` and `text_map` are populated.
- If `i18n_library.name` is `"none"`, note this — Agent 4 will install and configure one.
- If `text_map` is empty, re-run with a broader scan path.
- If `text_map` is very large (hundreds+ of entries across many files), consider whether the
  host wants the full app translated in one pass or a scoped subset first — this changes the
  cost/time of every downstream stage. Say so rather than silently committing to the largest
  interpretation.

---

## Agent 2 — Translator  *(claude subagent)*

**What it must do:** Produce accurate, context-aware first-draft translations.

Spawn a **claude** subagent with the following task:

```
You are a professional software UI translator.

Read the shared state file. Use "text_map" for strings to translate
and "stack_info.app_context" to understand what the app does.

Translate every entry in text_map into <TARGET_LANGUAGE>.

App context (use this to choose the right register, vocabulary, and domain terms):
→ Read stack_info.app_context from the file. Let it guide your word choices.
  If the app is healthcare-related, use appropriate clinical vocabulary.
  If it is e-commerce, use shopping vocabulary. If B2B SaaS, use professional/formal register.
  When in doubt, lean professional and accessible over casual.

For each string produce:
{
  "original": "original text",
  "translation": "<TARGET_LANGUAGE> translation",
  "key": "suggested.i18n.key.in.dot.notation",
  "category": "same category as input",
  "notes": "flag ambiguity, multiple valid options, domain-specific terms needing review"
}

Group output by category: labels, buttons, errors, placeholders, notifications, navigation.

Write the full array to the shared state file under key "translations_draft".
Do not remove other keys — only append.
```

---

## Agent 3 — Native Speaker Evaluator  *(claude subagent)*

**What it must do:** Ensure every translation sounds natural to a native speaker and
uses correct domain vocabulary.

Spawn a **claude** subagent with the following task:

```
You are a native <TARGET_LANGUAGE> speaker reviewing a software UI translation for quality.

Read the shared state file — focus on "translations_draft" and "stack_info.app_context".

Evaluate every entry against five criteria:
1. Naturalness — would a native speaker actually say this in a software UI?
2. Register — correct formality for this app's audience (infer from app_context)?
3. Domain terminology — correct vocabulary for the app's domain in <TARGET_LANGUAGE>?
4. Idioms — any phrase that is technically correct but sounds foreign or unnatural?
5. Consistency — are recurring concepts translated uniformly throughout?

For each entry needing correction:
{
  "original": "source text",
  "draft_translation": "Agent 2's version",
  "approved_translation": "your corrected version",
  "reason": "brief explanation"
}

For entries that are already good, copy them with "approved_translation" = "draft_translation".

Write the final array to the shared state file under "translations_approved".
Also add:
{
  "qa_summary": {
    "total_reviewed": <number>,
    "total_corrected": <number>,
    "common_correction_patterns": ["..."],
    "terminology_decisions": { "english_term": "chosen_<TARGET_LANGUAGE>_term" }
  }
}

Do not remove other keys — only append.
```

---

## Agent 4 — Code Generator  *(a repo-aware builder subagent if the host project has one, e.g. "frontend-builder"; otherwise "claude")*

**What it must do:** Write all code — locale files, key registrations, component updates,
language switcher, and Supabase rows if applicable.

Spawn the subagent with the following task:

```
You are implementing a new locale in a Node.js application.

Read the shared state file — use "translations_approved", "text_map",
"stack_info", and "i18n_package_structure".

## Step 1 — Understand the i18n setup

Check stack_info.i18n_library.name:

### If "react-i18next" or "i18next":
- Locale files live in public/locales/<lang>/translation.json (or wherever existing locales are)
- Components use useTranslation() hook and t('key') calls
- Register the new locale in the i18next init config

### If "next-intl":
- Messages files live in messages/<lang>.json (or wherever existing locales are)
- Components use useTranslations() and t('key')
- Register in next.config or i18n config

### If "lingui":
- Locale files are .po or .json in src/locales/<lang>/
- Components use useLingui() or t`` tagged templates
- Update lingui.config.js

### If "vue-i18n":
- Locale files in src/locales/<lang>.json
- Components use $t('key') or useI18n()

### If "custom" or a monorepo-internal package:
- Read the existing package source carefully. Follow every existing pattern exactly.
- Match file naming, key nesting style, resolver registration, and component API.

### If "none" (no i18n library detected):
- For a Next.js App Router project, install next-intl (first-class Server Component
  support) rather than react-i18next. For other React apps, react-i18next + i18next
  is fine. For Vue/Nuxt, vue-i18n.
- Set up the provider at the app root
- Create the base English locale file from the text_map before adding <LOCALE_CODE>
- Use the chosen library's idiomatic hook/function pattern

## Step 2 — Create the new locale file

Add the new locale file at the correct path for the detected library.
Key every entry from translations_approved using its "key" field.
Apply the correct nesting format (stack_info.i18n_library.key_format).

## Step 3 — Register the locale

Update the i18n config/resolver/init file to include <LOCALE_CODE>/<TARGET_LANGUAGE>.
Follow the exact existing registration pattern — do not invent new patterns.

## Step 4 — Replace hardcoded strings

For each "hardcoded" entry in text_map, replace the raw string in the source file
with the correct i18n call for the detected library.
Add the minimum import/hook needed if the component doesn't already have one.
Do not refactor anything else in those files.

## Step 5 — Update or create the language switcher

Search for an existing language/locale selector component (look for: LanguageSwitcher,
LocaleSelect, locale dropdown, language menu, i18n switcher).
- If found: add <TARGET_LANGUAGE> with value "<LOCALE_CODE>" to its options.
- If not found: create a LanguageSwitcher component appropriate for the detected
  UI library (Mantine Select, MUI Select, shadcn Select, or plain HTML select/Tailwind).
  Place it in the app's top navigation bar or settings page.

## Step 6 — Supabase translations (if applicable)

If stack_info.supabase.translations_table is set:
- Insert rows for <LOCALE_CODE> into that table for every approved translation.
- Use the table's existing schema. Match the pattern of existing locale rows.
- Write the INSERT SQL or use the Supabase client — whichever pattern exists in the codebase.

## Constraints
- Only modify what is in text_map. Do not refactor unrelated code.
- Do not use shell redirection to write source files — use file-write tools.
- TypeScript projects: maintain type safety; update any locale type unions to include the new code.

After all edits, append to the shared state file under "implementation_summary":
{
  "files_modified": ["list of every file changed"],
  "new_locale_file": "path to the new locale file",
  "keys_added": <count>,
  "hardcoded_replaced": <count>,
  "switcher_location": "file path and component name",
  "supabase_rows_inserted": <count or 0>,
  "i18n_library_installed": true|false
}
```

---

## Agent 5 — QA Verifier  *(claude subagent)*

**What it must do:** Verify the full implementation. Restart the pipeline on any failure.
Maximum 3 restart cycles.

Spawn a **claude** subagent with the following task:

```
You are a QA engineer verifying a language translation was fully and correctly implemented.

Read the shared state file — use "text_map", "stack_info", and "implementation_summary".

## Check 1 — Modified source files
For every file in implementation_summary.files_modified:
  - Open it and confirm every hardcoded string from text_map now uses an i18n call
  - Confirm no raw (untranslated or translated) string remains in a UI-rendering position

## Check 2 — Locale file completeness
Open implementation_summary.new_locale_file:
  - Every key from translations_approved must be present
  - No value may be empty or still in the source/English language

## Check 3 — i18n config registration
Open the i18n config/init file — confirm <LOCALE_CODE> is registered.
For TypeScript projects: confirm the locale type union includes "<LOCALE_CODE>".

## Check 4 — Language switcher
Open the switcher at implementation_summary.switcher_location:
  - Confirm <TARGET_LANGUAGE> / <LOCALE_CODE> is a selectable option.

## Check 5 — Spot check unmodified files
Pick 5 random source files NOT in implementation_summary.files_modified.
Scan for hardcoded user-facing strings that Agent 1 may have missed.

## Check 6 — Supabase (if applicable)
If stack_info.supabase.translations_table is set and
implementation_summary.supabase_rows_inserted > 0:
  - Confirm the INSERT/upsert logic targets the correct table and uses the correct schema.

## Check 7 — Build health
Run the host project's real typecheck/lint/test commands (read them from package.json —
do not assume npm run names). Report exact pass/fail.

For each issue found, record:
{
  "file": "path",
  "line": <line number or null>,
  "issue": "what is wrong",
  "severity": "hardcoded_remains|missing_key|wrong_key|switcher_missing|config_not_registered|type_not_updated|supabase_row_missing|build_broken"
}

Write to the shared state file under "qa_results":
{
  "passed": true|false,
  "issues": [...],
  "checked_at": "<ISO 8601 timestamp>"
}
```

**After Agent 5 — decide and act:**

Read `qa_results.passed` from the state file.

**If `passed: true` — report success to the user:**
> ✓ Translation complete! **<TARGET_LANGUAGE>** (`<LOCALE_CODE>`) has been added.
> - i18n library: `<stack_info.i18n_library.name>`
> - Locale file: `<new_locale_file>` — `<keys_added>` keys
> - `<hardcoded_replaced>` hardcoded strings replaced across `<N>` files
> - Language switcher: `<switcher_location>`
> - Supabase rows inserted: `<supabase_rows_inserted>` *(if applicable)*
>
> Start your dev server and switch to <TARGET_LANGUAGE> in the UI to verify.

**If `passed: false` and fewer than 3 restarts have been attempted:**
- Report the issues list to the user
- Archive state to a sibling file in the scratchpad directory (e.g. `translation-<LOCALE_CODE>-attempt-<N>.json`)
- Reset the shared state file to `{}`
- Restart from **Agent 1** with this prefix added to its prompt:
  > RESTART CONTEXT (attempt <N+1>/3): Prior run found these unresolved issues:
  > <paste qa_results.issues>
  > Prioritize these locations. Prior run archived at translation-<LOCALE_CODE>-attempt-<N>.json.

**If 3 restarts exhausted and issues remain:**
> Translation is mostly complete, but the following could not be resolved automatically
> after 3 attempts. Please review manually:
> <list each issue with file + line>

---

## Quick Reference

| # | Agent | Type | Reads | Writes to state |
|---|-------|------|-------|----------------|
| 1 | Stack Detector & Text Mapper | Explore | codebase | `stack_info`, `text_map`, `existing_locales` |
| 2 | Translator | claude | `text_map`, `stack_info.app_context` | `translations_draft` |
| 3 | Native Speaker Evaluator | claude | `translations_draft` | `translations_approved`, `qa_summary` |
| 4 | Code Generator | repo-aware builder or claude | `translations_approved`, `text_map`, `stack_info` | `implementation_summary` |
| 5 | QA Verifier | claude | `text_map`, `implementation_summary`, `stack_info` | `qa_results` |

## Host-repo governance note

If the host repo has its own council/ADR-style governance (check for a root instructions
file such as CLAUDE.md/AGENTS.md), a full-app language translation is a "new feature that
affects multiple files" plus a new-dependency decision — follow that repo's own rule for
when that requires a ratified decision document before implementation, rather than skipping
it because this skill is otherwise self-contained.
