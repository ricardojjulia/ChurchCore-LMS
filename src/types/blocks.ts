export type BlockCategory = 'content' | 'activity' | 'structure'

export type StructureBlockTypeId = 'module_header'
export type ContentBlockTypeId   = 'page' | 'video_stream' | 'resource_file' | 'external_url' | 'scorm' | 'live_session' | 'teacher_plug'
export type ActivityBlockTypeId  = 'assignment' | 'quiz' | 'discussion' | 'survey' | 'checklist' | 'flashcard_set' | 'attendance' | 'h5p'
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
  // Content
  page:          { label: 'Page',         icon: '📄', category: 'content',   color: 'blue',    description: 'Rich text or markdown content page',   is_active: true  },
  video_stream:  { label: 'Video',        icon: '🎬', category: 'content',   color: 'amber',   description: 'YouTube, Vimeo, or direct video link', is_active: true  },
  resource_file: { label: 'File',         icon: '📎', category: 'content',   color: 'teal',    description: 'PDF, slide deck, or downloadable file', is_active: true  },
  external_url:  { label: 'External URL', icon: '🔗', category: 'content',   color: 'slate',   description: 'Link to an external website',          is_active: true  },
  scorm:         { label: 'SCORM Package', icon: '📦', category: 'content', color: 'indigo',   description: 'SCORM 1.2 / 2004 interactive module', is_active: true },
  live_session:  { label: 'Live Session', icon: '🎙️', category: 'content',   color: 'violet',  description: 'Zoom, Meet, or live class link',       is_active: true  },
  teacher_plug:  { label: 'Teacher Card', icon: '👤', category: 'content',   color: 'indigo',  description: 'Instructor bio and introduction card', is_active: true  },
  // Activity
  assignment:    { label: 'Assignment',   icon: '📝', category: 'activity',  color: 'emerald', description: 'Written or file submission task',      is_active: true  },
  quiz:          { label: 'Quiz',         icon: '🧠', category: 'activity',  color: 'violet',  description: 'Auto-graded knowledge check',          is_active: true  },
  discussion:    { label: 'Discussion',   icon: '💬', category: 'activity',  color: 'rose',    description: 'Peer discussion prompt',               is_active: true  },
  survey:        { label: 'Survey',       icon: '📊', category: 'activity',  color: 'teal',    description: 'Feedback questions, anonymous by default', is_active: true  },
  checklist:     { label: 'Checklist',    icon: '✅', category: 'activity',  color: 'emerald', description: 'Steps a learner ticks off',            is_active: true  },
  flashcard_set: { label: 'Flashcards',   icon: '🗂️', category: 'activity',  color: 'amber',   description: 'Front-and-back study cards',           is_active: true  },
  attendance:    { label: 'Attendance',   icon: '🗓️', category: 'activity',  color: 'cyan',    description: 'Track student presence and engagement', is_active: true  },
  h5p:           { label: 'H5P Interactive', icon: '✨', category: 'activity', color: 'fuchsia', description: 'Interactive video, branching scenario, quiz, or embedded H5P', is_active: true },
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
  id:            string
  text:          string
  type:          'multiple_choice' | 'true_false' | 'matching' | 'fill_blank'
  options:       string[]
  correct_index: number
  points:        number
  // Matching question
  pairs?:        Array<{ id: string; left: string; right: string }>
  // Fill-in-the-blank question
  template?:     string
  blanks?:       Array<{ id: string; acceptable_answers: string[] }>
}

// Survey, checklist and flashcard content (COUNCIL-2026-044). The builder
// forms write these keys and the players read the same keys.
export interface SurveyQuestion {
  id:       string
  text:     string
  type:     'scale' | 'choice' | 'text'
  options?: string[]
}
export interface SurveyContent { questions: SurveyQuestion[]; anonymous: boolean }

export interface ChecklistItem { id: string; text: string; required: boolean }
export interface ChecklistContent { items: ChecklistItem[] }

export interface Flashcard { id: string; front: string; back: string }
export interface FlashcardContent { cards: Flashcard[] }

export interface H5PContent {
  embed_type: 'url' | 'package' | 'embed_code'
  url?: string
  embed_code?: string
  package_url?: string
  package_path?: string
  package_filename?: string
  package_title?: string
  package_main_library?: string
  passing_score_pct?: number
  require_passing?: boolean
  aspect_ratio?: '16:9' | '4:3' | '1:1' | 'auto'
}
