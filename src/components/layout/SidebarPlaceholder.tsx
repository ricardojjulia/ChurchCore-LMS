'use client'

import { cn } from '@/lib/utils'
import { useSidebar } from './SidebarContext'

const WORDMARK = ['ChurchCore', 'LMS']
const LETTER_BLEED = {
  textShadow: [
    '0 0 8px rgba(255,255,255,0.55)',
    '0 0 18px rgba(129,140,248,0.75)',
    '0 0 34px rgba(99,102,241,0.55)',
    '0 0 56px rgba(79,70,229,0.35)',
  ].join(', '),
}

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
          collapsed ? 'px-1 py-8' : 'px-8 py-12',
        )}
      >
        <div className="absolute inset-y-10 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-indigo-400/60 to-transparent" />
        <div className="absolute left-1/2 top-8 h-2 w-2 -translate-x-1/2 rounded-full bg-indigo-300 shadow-[0_0_24px_rgba(129,140,248,0.7)]" />
        <div className="absolute bottom-8 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-indigo-300/80 shadow-[0_0_24px_rgba(129,140,248,0.55)]" />

        <div className={cn('relative flex flex-col items-center', collapsed ? 'gap-5' : 'gap-10')}>
          {WORDMARK.map((word) => (
            <div key={word} className={cn('flex flex-col items-center', collapsed ? 'gap-1' : 'gap-2')}>
              {word.split('').map((letter, index) => (
                <span
                  key={`${word}-${letter}-${index}`}
                  className={cn(
                    'font-black uppercase leading-none tracking-normal text-white',
                    collapsed ? 'text-[0.82rem]' : word === 'LMS' ? 'text-4xl' : 'text-3xl',
                  )}
                  style={LETTER_BLEED}
                >
                  {letter}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
