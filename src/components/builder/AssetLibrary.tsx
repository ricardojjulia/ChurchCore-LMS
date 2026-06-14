'use client'

import { BLOCK_TYPE_META, type BlockTypeId } from '@/types/blocks'

const COLOR_MAP: Record<string, string> = {
  blue:    'bg-blue-900/40 border-blue-700/50 hover:border-blue-500',
  amber:   'bg-amber-900/40 border-amber-700/50 hover:border-amber-500',
  slate:   'bg-slate-800/60 border-slate-600/50 hover:border-slate-400',
  teal:    'bg-teal-900/40 border-teal-700/50 hover:border-teal-500',
  emerald: 'bg-emerald-900/40 border-emerald-700/50 hover:border-emerald-500',
  violet:  'bg-violet-900/40 border-violet-700/50 hover:border-violet-500',
  rose:    'bg-rose-900/40 border-rose-700/50 hover:border-rose-500',
}

interface Props {
  onSelect: (typeId: BlockTypeId) => void
  onClose: () => void
}

const SECTIONS: { label: string; types: BlockTypeId[] }[] = [
  { label: 'Content',    types: ['page', 'video_stream', 'resource_file', 'external_url'] },
  { label: 'Activities', types: ['assignment', 'quiz', 'discussion'] },
]

export default function AssetLibrary({ onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-white font-bold text-lg">Add Content</h2>
            <p className="text-slate-400 text-xs mt-0.5">Choose a content type to add to this module.</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                {section.label}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {section.types.map((typeId) => {
                  const meta = BLOCK_TYPE_META[typeId]
                  return (
                    <button
                      key={typeId}
                      onClick={() => onSelect(typeId)}
                      className={`text-left p-4 rounded-xl border transition-all ${COLOR_MAP[meta.color]}`}
                    >
                      <div className="text-2xl mb-2">{meta.icon}</div>
                      <p className="text-white font-semibold text-sm">{meta.label}</p>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed">{meta.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
