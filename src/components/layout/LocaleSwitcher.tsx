'use client'

import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Languages } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  collapsed?: boolean
}

export default function LocaleSwitcher({ collapsed = false }: Props) {
  const locale  = useLocale()
  const router  = useRouter()

  function switchLocale(next: string) {
    document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;SameSite=Lax`
    router.refresh()
  }

  function toggleLocale() {
    const next = locale === 'en' ? 'es' : locale === 'es' ? 'pt' : 'en'
    switchLocale(next)
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleLocale}
        title={locale.toUpperCase()}
        className={cn(
          'w-full flex items-center justify-center p-2 rounded-lg transition-colors',
          'text-slate-400 hover:text-white hover:bg-slate-850',
        )}
      >
        <Languages className="w-5 h-5 shrink-0" aria-hidden="true" />
        <span className="sr-only">{locale.toUpperCase()}</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1">
      <button
        type="button"
        onClick={() => switchLocale('en')}
        aria-pressed={locale === 'en'}
        className={
          locale === 'en'
            ? 'text-xs font-bold text-amber-300 px-1 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/60'
            : 'text-xs text-slate-400 hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-slate-800/60'
        }
      >
        EN
      </button>
      <span className="text-slate-600 text-xs select-none">/</span>
      <button
        type="button"
        onClick={() => switchLocale('es')}
        aria-pressed={locale === 'es'}
        className={
          locale === 'es'
            ? 'text-xs font-bold text-amber-300 px-1 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/60'
            : 'text-xs text-slate-400 hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-slate-800/60'
        }
      >
        ES
      </button>
      <span className="text-slate-600 text-xs select-none">/</span>
      <button
        type="button"
        onClick={() => switchLocale('pt')}
        aria-pressed={locale === 'pt'}
        className={
          locale === 'pt'
            ? 'text-xs font-bold text-amber-300 px-1 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/60'
            : 'text-xs text-slate-400 hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-slate-800/60'
        }
      >
        PT
      </button>
    </div>
  )
}
