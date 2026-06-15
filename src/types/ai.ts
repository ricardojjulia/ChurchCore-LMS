// AI Tutor type contracts — ADR-2025-003
// TutorQueryContextInternal is server-side only. Never serialize it to any HTTP response.
// TutorPromptContext is the safe, serializable subset used for logging and prompt assembly.

export interface ContentChunk {
  chunkId:      string
  sourceType:   'content_page' | 'discussion' | 'assignment_description'
  sourceId:     string
  sourceTitle:  string
  chunkIndex:   number
  chunkText:    string
  similarity:   number   // cosine similarity 0–1
  sectionId:    string
  sectionCode?: string   // present when chunk comes from a non-primary section (multi-section search)
  publishedAt:  string   // ISO 8601 UTC
}

// Internal: includes userId and raw query — never sent to client
export interface TutorQueryContextInternal {
  userId:           string
  sectionId:        string
  sectionCode:      string
  blueprintTitle:   string
  termName:         string
  deliveryFormat:   'synchronous' | 'asynchronous' | 'hybrid' | 'self_paced'
  cohortName:       string | null
  cohortCode:       string | null
  programTrackName: string | null
  programTrackCode: string | null
  enrollmentStatus: 'active' | 'suspended' | 'completed'
  accessWindowOpen: boolean
  accessWindowEnd:  string   // ISO 8601 UTC
  contentChunks:    ContentChunk[]
  queryText:        string   // plaintext — never persisted; use hash for logging
  retrievedAt:      string   // ISO 8601 UTC
  contextVersion:   string   // 'v1' — bump on breaking prompt changes (see ADR-2025-003)
}

// External: safe to log or pass to non-sensitive consumers
// queryText and userId are deliberately absent
export interface TutorPromptContext {
  sectionId:        string
  blueprintTitle:   string
  termName:         string
  deliveryFormat:   string
  cohortName:       string | null
  programTrackName: string | null
  contentChunks:    ContentChunk[]
  contextVersion:   string
}

export type EmbeddingStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'stale'
