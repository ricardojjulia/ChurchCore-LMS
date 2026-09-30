/**
 * OpenRouter AI Integration Client
 * Provides intelligent, cost-effective, and resilient model selection across LLMs
 * via OpenRouter's OpenAI-compatible API.
 */

export type AiTask = 'outline' | 'summary' | 'tutor' | 'hq' | 'gapAnalysis' | 'general'

export interface ModelCandidate {
  id: string
  name: string
  inputCostPer1M: number  // USD
  outputCostPer1M: number // USD
  usefulnessScore: number // 1 - 100 benchmark for instruction/accuracy
}

/**
 * Curated list of high-accuracy, cost-effective models available on OpenRouter.
 * Balances price-per-token with instruction adherence, JSON generation, and theological/academic nuance.
 */
export const MODEL_CATALOG: Record<string, ModelCandidate> = {
  'google/gemini-2.0-flash-001': {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    usefulnessScore: 92,
  },
  'openai/gpt-4o-mini': {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    usefulnessScore: 90,
  },
  'anthropic/claude-3.5-haiku': {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    inputCostPer1M: 0.80,
    outputCostPer1M: 4.00,
    usefulnessScore: 93,
  },
  'meta-llama/llama-3.3-70b-instruct': {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B Instruct',
    inputCostPer1M: 0.12,
    outputCostPer1M: 0.30,
    usefulnessScore: 88,
  },
  'anthropic/claude-3.5-sonnet': {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    usefulnessScore: 98,
  },
}

/**
 * Task-optimized model priority chains (primary cost-effective model -> fallback models).
 * OpenRouter automatically attempts fallback candidates if the primary is throttled or down.
 */
export const TASK_MODEL_CHAINS: Record<AiTask, string[]> = {
  // Course syllabus/curriculum requires high structured JSON fidelity & multilingual depth at low cost
  outline: [
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-sonnet',
  ],
  // Summaries are lightweight, frequent, and need quick empathetic responses
  summary: [
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-haiku',
  ],
  // Student tutor requires grounding over RAG documents & accurate theological discourse
  tutor: [
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-haiku',
    'anthropic/claude-3.5-sonnet',
  ],
  // Gap analysis over student queries
  gapAnalysis: [
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
    'meta-llama/llama-3.3-70b-instruct',
  ],
  // HQ staff operations
  hq: [
    'google/gemini-2.0-flash-001',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o-mini',
  ],
  general: [
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
  ],
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

export interface OpenRouterCompletionOptions {
  task?: AiTask
  model?: string
  fallbackModels?: string[]
  messages: OpenRouterMessage[]
  temperature?: number
  max_tokens?: number
  response_format?: { type: 'json_object' }
  stream?: boolean
}

export function getOpenRouterApiKey(): string | null {
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    null
  )
}

/**
 * Resolves the optimal model chain based on task, environment overrides, and cost-effectiveness.
 */
export function resolveModelChain(task: AiTask = 'general', explicitModel?: string, explicitFallbacks?: string[]): string[] {
  // Check task-specific environment overrides first
  const envKey = `OPENROUTER_MODEL_${task.toUpperCase()}`
  const envOverride = process.env[envKey] || process.env.OPENROUTER_MODEL

  if (explicitModel) {
    return [explicitModel, ...(explicitFallbacks ?? [])]
  }

  if (envOverride) {
    return [envOverride, ...(explicitFallbacks ?? TASK_MODEL_CHAINS[task])]
  }

  return TASK_MODEL_CHAINS[task] || TASK_MODEL_CHAINS.general
}

export const OPENROUTER_DEFAULT_MODELS = {
  outline: process.env.OPENROUTER_MODEL_OUTLINE || TASK_MODEL_CHAINS.outline[0],
  tutor: process.env.OPENROUTER_MODEL_TUTOR || TASK_MODEL_CHAINS.tutor[0],
  summary: process.env.OPENROUTER_MODEL_SUMMARY || TASK_MODEL_CHAINS.summary[0],
  hq: process.env.OPENROUTER_MODEL_HQ || TASK_MODEL_CHAINS.hq[0],
  gapAnalysis: process.env.OPENROUTER_MODEL_GAPANALYSIS || TASK_MODEL_CHAINS.gapAnalysis[0],
} as const

export async function callOpenRouter(options: OpenRouterCompletionOptions): Promise<{
  ok: boolean
  status: number
  text?: string
  json?: unknown
  error?: string
  modelUsed?: string
  rawResponse?: Response
}> {
  const apiKey = getOpenRouterApiKey()
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: 'AI service is not configured. Please set OPENROUTER_API_KEY in environment variables.',
    }
  }

  const modelChain = resolveModelChain(options.task, options.model, options.fallbackModels)
  const primaryModel = modelChain[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://churchcore.app'

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': appUrl,
        'X-Title': 'ChurchCore LMS',
      },
      body: JSON.stringify({
        model: primaryModel,
        models: modelChain, // OpenRouter fallback routing
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.max_tokens ?? 2000,
        ...(options.response_format ? { response_format: options.response_format } : {}),
        ...(options.stream ? { stream: true } : {}),
      }),
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      let parsedError = `AI provider error (${res.status})`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson?.error?.message) {
          parsedError = errorJson.error.message
        }
      } catch {
        if (errorText) parsedError = `${parsedError}: ${errorText.slice(0, 150)}`
      }
      return { ok: false, status: res.status, error: parsedError, rawResponse: res }
    }

    if (options.stream) {
      return { ok: true, status: 200, rawResponse: res }
    }

    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content ?? ''
    const modelUsed = data?.model ?? primaryModel
    return { ok: true, status: 200, text, json: data, modelUsed }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Connection to AI provider failed'
    return { ok: false, status: 502, error: message }
  }
}
