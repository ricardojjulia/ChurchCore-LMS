'use client'

import { useState } from 'react'
import { Cable, Upload } from 'lucide-react'
import { OneRosterConnectionClient } from './OneRosterConnectionClient'
import { OneRosterImportClient } from './OneRosterImportClient'

type View = 'imports' | 'connection'

export function OneRosterWorkspace() {
  const [view, setView] = useState<View>('imports')

  return (
    <div className="space-y-5">
      <div className="inline-flex h-10 items-center rounded-lg border border-slate-800 bg-slate-900 p-1" role="tablist" aria-label="OneRoster views">
        <TabButton active={view === 'imports'} onClick={() => setView('imports')}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Imports
        </TabButton>
        <TabButton active={view === 'connection'} onClick={() => setView('connection')}>
          <Cable className="h-4 w-4" aria-hidden="true" />
          Connection
        </TabButton>
      </div>
      <div role="tabpanel">
        {view === 'imports' ? <OneRosterImportClient /> : <OneRosterConnectionClient />}
      </div>
    </div>
  )
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
    >
      {children}
    </button>
  )
}
