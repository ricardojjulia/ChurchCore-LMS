export type NodeType =
  | 'page'
  | 'video_stream'
  | 'resource_file'
  | 'external_url'
  | 'assignment'
  | 'quiz'
  | 'discussion'

export interface NodeRequirements {
  must_view?: boolean
  minimum_grade_pct?: number
}

export interface NodeGamification {
  base_xp_reward?: number
  streak_bonus_eligible?: boolean
  badge_unlock_key?: string
}

interface BaseNode {
  id: string
  type: NodeType
  title: string
  position: number
  requirements?: NodeRequirements
  gamification?: NodeGamification
}

export interface PageNode extends BaseNode {
  type: 'page'
  content: string
}

export interface VideoNode extends BaseNode {
  type: 'video_stream'
  url: string
  duration_minutes?: number
}

export interface FileNode extends BaseNode {
  type: 'resource_file'
  file_url: string
  file_type?: string
}

export interface UrlNode extends BaseNode {
  type: 'external_url'
  url: string
}

export interface AssignmentNode extends BaseNode {
  type: 'assignment'
  instructions: string
  submission_type: 'text' | 'file' | 'both'
  max_points: number
  due_date?: string | null
}

export type QuestionType = 'multiple_choice' | 'true_false'

export interface QuizQuestion {
  id: string
  text: string
  type: QuestionType
  options: string[]
  correct_index: number
  points: number
}

export interface QuizNode extends BaseNode {
  type: 'quiz'
  instructions: string
  questions: QuizQuestion[]
  time_limit_minutes?: number | null
  attempts_allowed: number
}

export interface DiscussionNode extends BaseNode {
  type: 'discussion'
  prompt: string
}

export type LearningNode =
  | PageNode
  | VideoNode
  | FileNode
  | UrlNode
  | AssignmentNode
  | QuizNode
  | DiscussionNode

export interface BuilderModule {
  id: string
  title: string
  position: number
  items: LearningNode[]
}

export const NODE_META: Record<NodeType, { label: string; icon: string; description: string; color: string }> = {
  page: {
    label: 'Page',
    icon: '📄',
    description: 'Rich text content — lecture notes, readings, instructions.',
    color: 'blue',
  },
  video_stream: {
    label: 'Video',
    icon: '🎥',
    description: 'Embed a YouTube, Vimeo, or direct video URL.',
    color: 'amber',
  },
  resource_file: {
    label: 'File',
    icon: '📁',
    description: 'Link to a PDF, document, or downloadable resource.',
    color: 'slate',
  },
  external_url: {
    label: 'External URL',
    icon: '🔗',
    description: 'Link students to an external website or article.',
    color: 'teal',
  },
  assignment: {
    label: 'Assignment',
    icon: '✅',
    description: 'Text or file submission task with points and due date.',
    color: 'emerald',
  },
  quiz: {
    label: 'Quiz',
    icon: '🧠',
    description: 'Auto-graded multiple choice and true/false questions.',
    color: 'violet',
  },
  discussion: {
    label: 'Discussion',
    icon: '💬',
    description: 'A prompt for students to respond and interact.',
    color: 'rose',
  },
}
