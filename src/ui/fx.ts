// 画面全体に重ねる演出（パーティクル・飛び出す文字・画面フラッシュ）
// パーティクルは canvas に描き、文字は DOM（フォントをきれいに出すため）

/** パーティクルの色（style.css の配色に合わせる） */
export const PARTY_COLORS = ['#ff4f9a', '#ffd23f', '#3fa2ff', '#2ecf8f', '#8f63ff', '#ff8a1f']

type Shape = 'spark' | 'confetti' | 'star' | 'ring'

interface Particle {
  shape: Shape
  x: number
  y: number
  vx: number
  vy: number
  /** 重力（px/フレーム²相当。60fps 換算） */
  g: number
  size: number
  color: string
  rot: number
  vr: number
  /** 残り寿命と、最初の寿命（秒） */
  life: number
  maxLife: number
}

export interface BurstOptions {
  count?: number
  colors?: readonly string[]
  /** 飛び散る速さ（px/秒） */
  speed?: number
  shape?: Shape
  size?: number
  /** 寿命（秒） */
  life?: number
  gravity?: number
  /** 飛ぶ方向の中心（ラジアン。省略で全方向）と広がり */
  angle?: number
  spread?: number
}

/** 同時に出すパーティクルの上限（重くならないように） */
const MAX_PARTICLES = 900

export class Fx {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly layer: HTMLElement
  private readonly flashEl: HTMLElement
  private particles: Particle[] = []
  private rafId = 0
  private lastTime = 0
  /** OS でアニメーションを減らす設定のときは、動きの大きい演出を出さない */
  private readonly reduced: boolean

  constructor() {
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'fx-canvas'
    this.ctx = this.canvas.getContext('2d')!
    this.layer = document.createElement('div')
    this.layer.className = 'fx-layer'
    this.flashEl = document.createElement('div')
    this.flashEl.className = 'fx-flash'
    this.flashEl.addEventListener('animationend', () => this.flashEl.classList.remove('on'))
    document.body.append(this.canvas, this.layer, this.flashEl)
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  /** 要素の中心の画面座標 */
  static center(el: Element): { x: number; y: number } {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  /** (x, y) からパーティクルを飛び散らせる */
  burst(x: number, y: number, o: BurstOptions = {}): void {
    if (this.reduced) return
    const count = o.count ?? 12
    const colors = o.colors ?? PARTY_COLORS
    const speed = o.speed ?? 320
    const shape = o.shape ?? 'spark'
    const life = o.life ?? 0.7
    for (let i = 0; i < count; i++) {
      const angle = o.angle === undefined ? Math.random() * Math.PI * 2 : o.angle + (Math.random() - 0.5) * (o.spread ?? 1)
      const v = speed * (0.4 + Math.random() * 0.8)
      const l = life * (0.6 + Math.random() * 0.6)
      this.add({
        shape,
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        g: o.gravity ?? (shape === 'confetti' ? 600 : 300),
        size: (o.size ?? (shape === 'confetti' ? 9 : 5)) * (0.7 + Math.random() * 0.6),
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 14,
        life: l,
        maxLife: l,
      })
    }
    this.start()
  }

  /** (x, y) から広がる輪 */
  ring(x: number, y: number, color: string, size = 40): void {
    if (this.reduced) return
    this.add({ shape: 'ring', x, y, vx: 0, vy: 0, g: 0, size, color, rot: 0, vr: 0, life: 0.4, maxLife: 0.4 })
    this.start()
  }

  /** 画面の上から紙吹雪を降らせる */
  confettiRain(count = 120): void {
    if (this.reduced) return
    const w = window.innerWidth
    for (let i = 0; i < count; i++) {
      const l = 2 + Math.random() * 1.5
      this.add({
        shape: 'confetti',
        x: Math.random() * w,
        y: -20 - Math.random() * 300,
        vx: (Math.random() - 0.5) * 120,
        vy: 80 + Math.random() * 200,
        g: 120,
        size: 8 + Math.random() * 6,
        color: PARTY_COLORS[Math.floor(Math.random() * PARTY_COLORS.length)],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 12,
        life: l,
        maxLife: l,
      })
    }
    this.start()
  }

  /** 画面の左右下から紙吹雪を打ち上げる（クラッカー） */
  cannons(count = 70): void {
    const h = window.innerHeight
    const w = window.innerWidth
    this.burst(0, h, { count, shape: 'confetti', speed: 900, angle: -Math.PI / 3, spread: 0.7, life: 2, gravity: 700 })
    this.burst(w, h, { count, shape: 'confetti', speed: 900, angle: (-Math.PI * 2) / 3, spread: 0.7, life: 2, gravity: 700 })
  }

  /**
   * 文字を (x, y) に出して、CSS のアニメーションが終わったら消す。
   * className で見た目と動き（style.css の .pop-*）を決める
   */
  text(x: number, y: number, text: string, className: string, color?: string): HTMLElement {
    const el = document.createElement('div')
    el.className = `fx-text ${className}`
    el.textContent = text
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    if (color) el.style.setProperty('--fx-color', color)
    el.addEventListener('animationend', (e) => {
      if (e.target === el) el.remove()
    })
    this.layer.append(el)
    return el
  }

  /** 画面全体を一瞬光らせる（眩しすぎないよう薄く短く） */
  flash(color = '#ffffff'): void {
    if (this.reduced) return
    this.flashEl.style.setProperty('--flash', color)
    this.flashEl.classList.remove('on')
    void this.flashEl.offsetWidth
    this.flashEl.classList.add('on')
  }

  /** 演出をすべて消す（画面切り替え時） */
  clear(): void {
    this.particles = []
    this.layer.replaceChildren()
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private add(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
    this.particles.push(p)
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.round(window.innerWidth * dpr)
    this.canvas.height = Math.round(window.innerHeight * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private start(): void {
    if (this.rafId) return
    this.lastTime = performance.now()
    this.rafId = requestAnimationFrame(this.frame)
  }

  private frame = (now: number): void => {
    // タブが裏にあった後などに一気に進まないよう、1フレームの時間に上限をつける
    const dt = Math.min(0.05, (now - this.lastTime) / 1000)
    this.lastTime = now
    const ctx = this.ctx
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0)
    for (const p of this.particles) {
      p.vy += p.g * dt
      // 空気抵抗で少しずつ遅くなる
      p.vx *= 1 - 1.5 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
      this.draw(p)
    }
    ctx.globalAlpha = 1
    if (this.particles.length > 0) {
      this.rafId = requestAnimationFrame(this.frame)
    } else {
      this.rafId = 0
    }
  }

  private draw(p: Particle): void {
    const ctx = this.ctx
    const t = p.life / p.maxLife
    ctx.globalAlpha = Math.min(1, t * 2)
    ctx.fillStyle = p.color
    ctx.strokeStyle = p.color
    switch (p.shape) {
      case 'spark': {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * t + 1, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'confetti': {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        // ひらひら回って見えるよう、横幅を回転に合わせて伸び縮みさせる
        ctx.scale(Math.cos(p.rot * 1.7), 1)
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
        break
      }
      case 'star': {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        const r = p.size * (0.5 + t * 0.5)
        ctx.beginPath()
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 === 0 ? r : r * 0.45
          const a = (i * Math.PI) / 5 - Math.PI / 2
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
        }
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        break
      }
      case 'ring': {
        ctx.globalAlpha = t
        ctx.lineWidth = 5 * t + 1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1.6 - t), 0, Math.PI * 2)
        ctx.stroke()
        break
      }
    }
  }
}
