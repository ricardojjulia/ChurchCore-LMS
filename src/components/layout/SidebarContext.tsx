'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface SidebarCtx {
  collapsed: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarCtx>({ collapsed: false, toggle: () => {} })

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored !== null) setCollapsed(stored === 'true')
  }, [])

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
