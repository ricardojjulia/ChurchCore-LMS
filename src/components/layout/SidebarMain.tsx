'use client'

import { useSidebar } from './SidebarContext'
import { cn } from '@/lib/utils'

export default function SidebarMain({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  return (
    <div
      id="main-content"
      className={cn(
        'min-h-screen transition-[padding-left] duration-200',
        'pb-16 md:pb-0',
        collapsed ? 'md:pl-14' : 'md:pl-60',
      )}
    >
      {children}
    </div>
  )
}
