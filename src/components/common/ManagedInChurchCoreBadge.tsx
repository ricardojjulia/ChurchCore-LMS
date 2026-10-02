'use client'

import React from 'react'

interface Props {
  className?: string
  tooltip?: string
}

export default function ManagedInChurchCoreBadge({ className = '', tooltip = 'Profile synchronized and managed from ChurchCore ChMS' }: Props) {
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 shadow-sm ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
      <span>Managed in ChurchCore</span>
    </span>
  )
}
