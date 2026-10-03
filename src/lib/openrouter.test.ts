import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  resolveModelChain,
  getOpenRouterApiKey,
  callOpenRouter,
  TASK_MODEL_CHAINS,
  MODEL_CATALOG,
} from './openrouter'

describe('OpenRouter Model Selection & Routing Logic', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('selects the cost-effective model chain for outline task', () => {
    const chain = resolveModelChain('outline')
    expect(chain[0]).toBe('google/gemini-2.0-flash-001')
    expect(chain).toContain('openai/gpt-4o-mini')
    expect(chain).toContain('anthropic/claude-3.5-sonnet')
  })

  it('selects the cost-effective model chain for summary task', () => {
    const chain = resolveModelChain('summary')
    expect(chain[0]).toBe('google/gemini-2.0-flash-001')
    expect(chain).toContain('openai/gpt-4o-mini')
  })

  it('allows task-specific environment overrides', () => {
    vi.stubEnv('OPENROUTER_MODEL_OUTLINE', 'openai/gpt-4o-mini')
    const chain = resolveModelChain('outline')
    expect(chain[0]).toBe('openai/gpt-4o-mini')
  })

  it('respects explicit model passed in options', () => {
    const chain = resolveModelChain('outline', 'anthropic/claude-3.5-haiku', ['openai/gpt-4o-mini'])
    expect(chain).toEqual(['anthropic/claude-3.5-haiku', 'openai/gpt-4o-mini'])
  })

  it('contains cost metrics and scores for all catalog models', () => {
    for (const [id, model] of Object.entries(MODEL_CATALOG)) {
      expect(model.id).toBe(id)
      expect(model.inputCostPer1M).toBeGreaterThan(0)
      expect(model.outputCostPer1M).toBeGreaterThan(0)
      expect(model.usefulnessScore).toBeGreaterThanOrEqual(80)
    }
  })

  it('passes fallback models list to OpenRouter payload', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        choices: [{ message: { content: 'Course outline content' } }],
        model: 'google/gemini-2.0-flash-001',
      })
    )

    const res = await callOpenRouter({
      task: 'outline',
      messages: [{ role: 'user', content: 'Generate syllabus' }],
    })

    expect(res.ok).toBe(true)
    expect(res.text).toBe('Course outline content')
    expect(res.modelUsed).toBe('google/gemini-2.0-flash-001')

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(requestBody.model).toBe('google/gemini-2.0-flash-001')
    expect(requestBody.models).toEqual(TASK_MODEL_CHAINS.outline)
  })

  it('selects the cost-effective model chain for tutor task', () => {
    const chain = resolveModelChain('tutor')
    expect(chain[0]).toBe('google/gemini-2.0-flash-001')
    expect(chain).toContain('openai/gpt-4o-mini')
    expect(chain).toContain('anthropic/claude-3.5-haiku')
  })

  it('selects the cost-effective model chain for gapAnalysis task', () => {
    const chain = resolveModelChain('gapAnalysis')
    expect(chain[0]).toBe('google/gemini-2.0-flash-001')
    expect(chain).toContain('deepseek/deepseek-chat')
  })

  it('generates vector embeddings via OpenRouter endpoint', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      })
    )

    const vectors = await (await import('./openrouter')).fetchOpenRouterEmbeddings('test query')
    expect(vectors).toEqual([[0.1, 0.2, 0.3]])

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('returns 503 when no key is set', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const res = await callOpenRouter({
      task: 'summary',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(res.ok).toBe(false)
    expect(res.status).toBe(503)
    expect(res.error).toContain('OPENROUTER_API_KEY')
  })
})

