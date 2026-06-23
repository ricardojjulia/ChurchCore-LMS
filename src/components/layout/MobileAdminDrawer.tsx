'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Settings, X, Users, Layout, Layers, Clock, FileText, Activity, CreditCard } from 'lucide-react'

const ADMIN_LINKS = [
  { href: '/admin/users',      label: 'Users',          Icon: Users      },
  { href: '/admin/cohorts',    label: 'Cohorts',        Icon: Layout     },
  { href: '/admin/sections',   label: 'Sections',       Icon: Layers     },
  { href: '/admin/terms',      label: 'Terms',          Icon: Clock      },
  { href: '/admin/blueprints', label: 'Blueprints',     Icon: FileText   },
  { href: '/admin/billing',    label: 'Billing',        Icon: CreditCard },
  { href: '/admin/health',     label: 'System Health',  Icon: Activity   },
  { href: '/admin/settings',  label: 'Org Settings',   Icon: Settings   },
] as const

interface Props {
  isAdmin: boolean
}

export default function MobileAdminDrawer({ isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const router   = useRouter()
  const pathname = usePathname()

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!isAdmin) return null

  return (
    <>
      {/* Floating trigger button — above the 5-tab bottom nav (h-16 = 64px + safe area) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open admin navigation"
        className="fixed bottom-[72px] right-4 z-40 md:hidden flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-2 text-xs font-semibold text-white shadow-lg"
      >
        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
        Admin
      </button>

      {/* Drawer overlay + panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="relative rounded-t-2xl bg-white dark:bg-gray-900 p-6 pb-8 shadow-xl max-h-[80vh] overflow-y-auto"
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Admin</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close admin navigation"
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <hr className="mb-4 border-gray-200 dark:border-gray-700" />

            {/* Nav links */}
            <nav aria-label="Admin navigation">
              <ul className="space-y-1">
                {ADMIN_LINKS.map(({ href, label, Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + '/')
                  return (
                    <li key={href}>
                      <button
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => { setOpen(false); router.push(href) }}
                        className={[
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
                            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800',
                        ].join(' ')}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
