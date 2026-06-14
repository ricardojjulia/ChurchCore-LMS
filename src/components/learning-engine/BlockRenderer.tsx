import type { CourseBlock } from '@/types/blocks'
import { BLOCK_TYPE_META } from '@/types/blocks'

export default function BlockRenderer({ block }: { block: CourseBlock }) {
  const meta = BLOCK_TYPE_META[block.block_type_id]

  return (
    <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-lg shadow-sm hover:border-slate-300 transition-colors duration-150">
      <div className="flex items-center gap-3">
        <span className="text-xl">{meta?.icon ?? '📦'}</span>
        <div>
          <h4 className="text-sm font-semibold text-slate-800">{block.title}</h4>
          <span className="text-xs uppercase tracking-wider font-bold text-slate-400">
            {meta?.label ?? block.block_type_id}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {block.gamification?.base_xp_reward ? (
          <span className="text-xs text-indigo-500 font-bold bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
            +{block.gamification.base_xp_reward} XP
          </span>
        ) : null}
      </div>
    </div>
  )
}
