/**
 * Multi-Document Course Synthesis Engine (COUNCIL-2026-043)
 * Synthesizes disparate Word Docs (.docx), PowerPoints (.pptx), PDFs, and Text files
 * into a coherent, high-impact Christian leadership & theological course.
 */

export interface SourceDocumentMeta {
  fileName: string
  title: string
  charCount?: number
}

export interface MultiDocumentSynthesizerInput {
  combinedSourceText: string
  sourceFiles: SourceDocumentMeta[]
  courseTitleHint?: string
  targetAudience?: string
  theologicalTradition?: string
  pacingWeeks?: number
}

export interface SynthesizedBlock {
  type: 'page' | 'quiz' | 'discussion' | 'assignment'
  title: string
  objective: string
  content: {
    body?: string
    prompt?: string
    instructions?: string
    max_score?: number
    max_points?: number
    submission_type?: 'both' | 'file' | 'text'
    questions?: Array<{
      id: string
      text: string
      type: 'multiple_choice'
      options: [string, string, string, string]
      correct_index: number
      points: number
      explanation: string
    }>
  }
}

export interface SynthesizedLesson {
  lesson_number: number
  title: string
  estimated_minutes: number
  scripture_references: string[]
  blocks: SynthesizedBlock[]
}

export interface SynthesizedModule {
  module_number: number
  title: string
  description: string
  lessons: SynthesizedLesson[]
}

export interface MultiDocumentSynthesizedCourse {
  course_title: string
  course_description: string
  theological_framework: string
  learning_outcomes: string[]
  target_audience: string
  source_attribution: string[]
  modules: SynthesizedModule[]
}

export const SYNTHESIS_SYSTEM_PROMPT = `You are a master curriculum architect and Christian instructional designer for church leadership, theological education, and discipleship.
Your mission is to synthesize MULTIPLE source documents (Word documents, PowerPoint presentations, lecture notes, sermon transcripts, and syllabi) into a unified, rich, highly structured, and engaging course.

RULES & DIRECTIVES:
1. SYNTHESIS OVER CONCATENATION:
   - Do NOT simply list the files one by one.
   - De-duplicate overlapping slide bullet points and narrative text notes.
   - Weave slide key concepts and word doc depth together into cohesive, structured modules.
2. PEDAGOGICAL COMPLETENESS:
   - Provide complete, in-depth lesson bodies (3-5 substantive paragraphs with rich HTML formatting: <h3>, <p>, <blockquote> with scripture citation, <strong>, <ul>/<li> for practical ministry applications).
   - Never output placeholders like "Add content here" or "[Insert explanation]".
3. THEOLOGICAL INTEGRITY:
   - Detect and honor cited scripture passages (e.g. "Romans 12:1-2", "Ephesians 4:11-16").
   - Include multi-tradition cross-references where appropriate while honoring the user's tradition hint.
4. FORMATIVE LEARNING BLOCKS:
   - Each lesson must contain at least one rich content page, plus interactive elements (Socratic discussions with reflection prompts, auto-graded multiple-choice quizzes with explanations, or actionable ministry assignments).
5. MATCH LANGUAGE:
   - Match the primary language of the source documents (e.g., Spanish if sources are Spanish, English if English).

OUTPUT FORMAT:
Respond with ONLY valid JSON matching this schema:
{
  "course_title": string,
  "course_description": string,
  "theological_framework": string,
  "learning_outcomes": string[],
  "target_audience": string,
  "source_attribution": string[],
  "modules": [
    {
      "module_number": number,
      "title": string,
      "description": string,
      "lessons": [
        {
          "lesson_number": number,
          "title": string,
          "estimated_minutes": number,
          "scripture_references": string[],
          "blocks": [
            {
              "type": "page" | "quiz" | "discussion" | "assignment",
              "title": string,
              "objective": string,
              "content": {
                "body": string,
                "prompt": string,
                "instructions": string,
                "max_score": number,
                "max_points": number,
                "submission_type": "both",
                "questions": [
                  {
                    "id": string,
                    "text": string,
                    "type": "multiple_choice",
                    "options": [string, string, string, string],
                    "correct_index": number,
                    "points": number,
                    "explanation": string
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}`

export function buildSynthesisUserPrompt(input: MultiDocumentSynthesizerInput): string {
  const fileNames = input.sourceFiles.map((f) => f.fileName).join(', ')
  const titleHint = input.courseTitleHint ? `Suggested Course Title: ${input.courseTitleHint}\n` : ''
  const audience = input.targetAudience ? `Target Audience: ${input.targetAudience}\n` : ''
  const tradition = input.theologicalTradition ? `Theological Tradition: ${input.theologicalTradition}\n` : ''
  const pacing = input.pacingWeeks ? `Target Pacing: ${input.pacingWeeks} modules / weeks\n` : ''

  return `Synthesize the following ${input.sourceFiles.length} source documents (${fileNames}) into a comprehensive, published course curriculum:\n\n${titleHint}${audience}${tradition}${pacing}\n=== SOURCE MATERIALS ===\n\n${input.combinedSourceText}`
}
