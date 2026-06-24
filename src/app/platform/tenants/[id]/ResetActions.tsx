'use client'

import { useState, useTransition } from 'react'
import { resetTenantToEmpty, resetTenantToDemo } from '../../actions'

const DEMO_SCENARIO_OPTIONS = [
  { value: 'wed_bible_school',  label: 'Wednesday Bible School'        },
  { value: 'summer_kids',       label: 'Summer School for Kids'        },
  { value: 'college_semester',  label: 'College Semester (Default)'    },
  { value: 'diploma_yearly',    label: '1-Year Bible Diploma'          },
  { value: 'ministry_leaders',  label: 'Ministry Education for Leaders'},
  { value: 'all_scenarios',     label: 'All Scenarios (Full Demo)'     },
] as const

type ScenarioValue = typeof DEMO_SCENARIO_OPTIONS[number]['value']

export default function ResetActions({
  orgId,
  orgName,
}: {
  orgId:   string
  orgName: string
}) {
  const [pending, start]             = useTransition()
  const [scenario, setScenario]      = useState<ScenarioValue>('college_semester')

  function handleEmpty() {
    const typed = window.prompt(
      `This will DELETE all courses, cohorts, announcements, and learning data for "${orgName}".\nUser accounts will be preserved.\n\nType the organization name to confirm:`
    )
    if (typed === null) return
    if (typed.trim() !== orgName) {
      alert('Name did not match. Reset cancelled.')
      return
    }
    start(() => resetTenantToEmpty(orgId))
  }

  function handleDemo() {
    const selectedLabel = DEMO_SCENARIO_OPTIONS.find(o => o.value === scenario)?.label ?? scenario
    const typed = window.prompt(
      `This will WIPE all content for "${orgName}" and replace it with demo data.\nScenario: ${selectedLabel}\nUser accounts will be preserved.\n\nType the organization name to confirm:`
    )
    if (typed === null) return
    if (typed.trim() !== orgName) {
      alert('Name did not match. Reset cancelled.')
      return
    }
    start(() => resetTenantToDemo(orgId, scenario))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Both options preserve user accounts. Content deletions are permanent.
      </p>
      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400 font-medium" htmlFor="demo-scenario-select">
          Demo scenario
        </label>
        <select
          id="demo-scenario-select"
          value={scenario}
          onChange={e => setScenario(e.target.value as ScenarioValue)}
          disabled={pending}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-600 disabled:opacity-40 w-full max-w-xs"
        >
          {DEMO_SCENARIO_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-3">
        <button
          onClick={handleDemo}
          disabled={pending}
          className="rounded border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-900/30 disabled:opacity-40 transition-colors"
        >
          {pending ? 'Resetting…' : 'Reset to Demo'}
        </button>
        <button
          onClick={handleEmpty}
          disabled={pending}
          className="rounded border border-rose-800 px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-900/30 disabled:opacity-40 transition-colors"
        >
          {pending ? 'Resetting…' : 'Reset to Empty'}
        </button>
      </div>
    </div>
  )
}
