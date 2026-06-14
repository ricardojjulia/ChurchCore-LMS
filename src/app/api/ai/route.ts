import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  const body = await request.json()

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  // When Anthropic returns an SSE stream, pipe it straight through.
  // This is what eliminates the token-limit cut-off: the client receives
  // each delta in real time instead of waiting for a buffered JSON blob.
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  const data = await res.json()
  return Response.json(data, { status: res.status })
}
