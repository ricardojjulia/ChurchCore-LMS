/**
 * OpenRouter AI Integration Client
 * Provides unified, resilient access to LLMs via OpenRouter's OpenAI-compatible API.
 */

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

export interface OpenRouterCompletionOptions {
  model?: string
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

export const OPENROUTER_DEFAULT_MODELS = {
  outline: process.env.OPENROUTER_MODEL_OUTLINE || 'anthropic/claude-3.5-sonnet',
  tutor: process.env.OPENROUTER_MODEL_TUTOR || 'anthropic/claude-3.5-sonnet',
  summary: process.env.OPENROUTER_MODEL_SUMMARY || 'anthropic/claude-3.5-haiku',
  hq: process.env.OPENROUTER_MODEL_HQ || 'anthropic/claude-3.5-sonnet',
  gapAnalysis: process.env.OPENROUTER_MODEL_GAPANALYSIS || 'openai/gpt-4o',
} as const

export async function callOpenRouter(options: OpenRouterCompletionOptions): Promise<{
  ok: boolean
  status: number
  text?: string
  json?: unknown
  error?: string
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

  const model = options.model || OPENROUTER_DEFAULT_MODELS.outline
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
        model,
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
    return { ok: true, status: 200, text, json: data }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Connection to AI provider failed'
    return { ok: false, status: 502, error: message }
  }
}
