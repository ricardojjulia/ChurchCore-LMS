'use client'

import { cn } from '@/lib/utils'
import { useSidebar } from './SidebarContext'

export default function SidebarPlaceholder() {
  const { collapsed } = useSidebar()

  return (
    <aside
      aria-label="ChurchCore LMS"
      className={cn(
        'hidden md:flex fixed left-0 top-0 bottom-0 z-40 flex-col items-center justify-center',
        'bg-slate-900 border-r border-slate-800 transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center overflow-hidden',
          collapsed ? 'px-1 py-8' : 'px-6 py-12',
        )}
      >
        <div className="absolute inset-x-5 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[#8DA9C4]/20 to-transparent" />
        <div className="absolute left-1/2 top-16 h-2 w-2 -translate-x-1/2 rounded-full bg-church-muted shadow-[0_0_24px_rgba(141,169,196,0.55)]" />
        <div className="absolute bottom-16 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#8DA9C4]/80 shadow-[0_0_24px_rgba(141,169,196,0.45)]" />

        <div className={cn('relative flex flex-col items-center text-center', collapsed ? 'gap-5' : 'gap-7')}>
          <img
            src="/assets/brand/icon-mark-dark.svg"
            alt=""
            aria-hidden="true"
            className={cn(
              'drop-shadow-[0_0_34px_rgba(249,247,241,0.22)]',
              collapsed ? 'w-10' : 'w-40',
            )}
          />
          {!collapsed && (
            <div aria-label="ChurchCore LMS">
              <p className="text-[1.72rem] font-black leading-none tracking-tight text-church-cream">
                ChurchCore
              </p>
              <p className="mt-2 text-sm font-black uppercase tracking-[0.38em] text-church-muted">
                LMS
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
