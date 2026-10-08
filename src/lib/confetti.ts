/**
 * Lightweight canvas-based confetti particle generator (zero external dependencies).
 */
export function triggerCelebrationConfetti(durationMs = 3000) {
  if (typeof window === 'undefined') return

  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '99999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    document.body.removeChild(canvas)
    return
  }

  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  const colors = ['#6366f1', '#a855f7', '#ec4899', '#10b981', '#f59e0b', '#3b82f6']
  const particleCount = 120

  const particles = Array.from({ length: particleCount }).map(() => ({
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: (Math.random() - 0.5) * 16,
    vy: (Math.random() - 0.8) * 16,
    size: Math.random() * 6 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 10,
    opacity: 1,
  }))

  const startTime = Date.now()

  function render() {
    if (!ctx) return
    const elapsed = Date.now() - startTime
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.3 // gravity
      p.rotation += p.rotationSpeed
      p.opacity = Math.max(0, 1 - elapsed / durationMs)

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.fillStyle = p.color
      ctx.globalAlpha = p.opacity
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }

    if (elapsed < durationMs) {
      requestAnimationFrame(render)
    } else {
      if (document.body.contains(canvas)) {
        document.body.removeChild(canvas)
      }
    }
  }

  requestAnimationFrame(render)
}
