import { FileText, Link, CheckSquare, PlayCircle } from 'lucide-react'

interface LearningNode {
  id: string
  type: 'resource_file' | 'assignment_link' | 'video_stream' | 'external_url'
  title: string
  storage_path?: string
  target_id?: string
  requirements?: {
    must_view?: boolean
    minimum_grade_pct?: number
  }
  gamification?: {
    base_xp_reward?: number
    streak_bonus_eligible?: boolean
    badge_unlock_key?: string
  }
}

export default function ModuleItemRenderer({ node }: { node: LearningNode }) {
  const renderIcon = () => {
    switch (node.type) {
      case 'resource_file':
        return <FileText className="w-5 h-5 text-blue-500" />
      case 'assignment_link':
        return <CheckSquare className="w-5 h-5 text-emerald-500" />
      case 'video_stream':
        return <PlayCircle className="w-5 h-5 text-amber-500" />
      default:
        return <Link className="w-5 h-5 text-slate-500" />
    }
  }

  return (
    <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-lg shadow-sm hover:border-slate-300 transition-colors duration-150">
      <div className="flex items-center gap-3">
        {renderIcon()}
        <div>
          <h4 className="text-sm font-semibold text-slate-800">{node.title}</h4>
          <span className="text-xs uppercase tracking-wider font-bold text-slate-400">
            {node.type.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {node.gamification?.base_xp_reward && (
          <span className="text-xs text-indigo-500 font-bold bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
            +{node.gamification.base_xp_reward} XP
          </span>
        )}
        {node.requirements && (
          <div className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            {node.requirements.must_view && 'View Required'}
            {node.requirements.minimum_grade_pct &&
              ` Min Grade: ${node.requirements.minimum_grade_pct}%`}
          </div>
        )}
      </div>
    </div>
  )
}
