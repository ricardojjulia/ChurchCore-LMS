// COUNCIL-2026-029: Learning Paths / Discipleship Tracks

export interface LearningPath {
  id: string
  org_id: string
  title: string
  description: string | null
  is_published: boolean
  cover_image_url: string | null
  created_at: string
  updated_at: string
}

export interface LearningPathCourse {
  id: string
  path_id: string
  course_id: string
  sort_order: number
  created_at: string
  course: {
    id: string
    title: string
    description: string | null
    status: string
  }
}

export interface LearningPathWithCourses extends LearningPath {
  learning_path_courses: LearningPathCourse[]
}

export interface LearningPathWithProgress extends LearningPathWithCourses {
  completedCount: number
  totalCount: number
}
