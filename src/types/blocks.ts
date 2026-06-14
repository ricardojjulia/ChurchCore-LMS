export type BlockCategory = 'content' | 'activity' | 'structure'

export type StructureBlockTypeId = 'module_header' | 'section' | 'certificate'
export type ContentBlockTypeId   = 'page' | 'video_stream' | 'resource_file' | 'external_url' | 'scorm' | 'live_session'
export type ActivityBlockTypeId  = 'assignment' | 'quiz' | 'discussion' | 'survey' | 'checklist' | 'flashcard_set'
export type BlockTypeId          = StructureBlockTypeId | ContentBlockTypeId | ActivityBlockTypeId

export interface BlockTypeMeta {
  label: string
  icon: string
  category: BlockCategory
  color: string
  description: string
  is_active: boolean
}

export const BLOCK_TYPE_META: Record<BlockTypeId, BlockTypeMeta> = {
  // Structure
  module_header: { label: 'Module',       icon: '📁', category: 'structure', color: 'slate',   description: 'Top-level course section',             is_active: true  },
  section:       { label: 'Section',      icon: '📂', category: 'structure', color: 'slate',   description: 'Sub-group within a module',            is_active: false },
  certificate:   { label: 'Certificate',  icon: '🏆', category: 'structure', color: 'amber',   description: 'Completion certificate block',         is_active: false },
  // Content
  page:          { label: 'Page',         icon: '📄', category: 'content',   color: 'blue',    description: 'Rich text or markdown content page',   is_active: true  },
  video_stream:  { label: 'Video',        icon: '🎬', category: 'content',   color: 'amber',   description: 'YouTube, Vimeo, or direct video link', is_active: true  },
  resource_file: { label: 'File',         icon: '📎', category: 'content',   color: 'teal',    description: 'PDF, slide deck, or downloadable file', is_active: true  },
  external_url:  { label: 'External URL', icon: '🔗', category: 'content',   color: 'slate',   description: 'Link to an external website',          is_active: true  },
  scorm:         { label: 'SCORM',        icon: '📦', category: 'content',   color: 'slate',   description: 'SCORM-compatible package',             is_active: false },
  live_session:  { label: 'Live Session', icon: '🎙️', category: 'content',   color: 'violet',  description: 'Zoom, Meet, or live class link',       is_active: false },
  // Activity
  assignment:    { label: 'Assignment',   icon: '📝', category: 'activity',  color: 'emerald', description: 'Written or file submission task',      is_active: true  },
  quiz:          { label: 'Quiz',         icon: '🧠', category: 'activity',  color: 'violet',  description: 'Auto-graded knowledge check',          is_active: true  },
  discussion:    { label: 'Discussion',   icon: '💬', category: 'activity',  color: 'rose',    description: 'Peer discussion prompt',               is_active: true  },
  survey:        { label: 'Survey',       icon: '📊', category: 'activity',  color: 'teal',    description: 'Anonymous feedback form',              is_active: false },
  checklist:     { label: 'Checklist',    icon: '✅', category: 'activity',  color: 'emerald', description: 'Student self-completion list',         is_active: false },
  flashcard_set: { label: 'Flashcards',   icon: '🗂️', category: 'activity',  color: 'amber',   description: 'Spaced-repetition study cards',        is_active: false },
}

export interface CourseBlock {
  id: string
  course_id: string
  parent_block_id: string | null
  block_type_id: BlockTypeId
  title: string
  sort_order: number
  content: Record<string, unknown>
  settings: Record<string, unknown>
  gamification: { base_xp_reward?: number; streak_bonus_eligible?: boolean }
  is_published: boolean
  created_at: string
  updated_at: string
}

// Returned by every node form component
export interface BlockFormData {
  title: string
  content: Record<string, unknown>
  settings?: Record<string, unknown>
  gamification?: { base_xp_reward?: number; streak_bonus_eligible?: boolean }
}

// Quiz question shape (stored inside QuizBlock content.questions[])
export interface QuizQuestion {
  id: string
  text: string
  type: 'multiple_choice' | 'true_false'
  options: string[]
  correct_index: number
  points: number
}
