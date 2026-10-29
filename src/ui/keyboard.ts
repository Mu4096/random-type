// 画面のキーボード表示と、キーの演出

import { QWERTY_CHAR, isChanged, isSwapCode, type Layout } from '../logic/keys'

/** 表示するキー（物理位置）。数字の段・上段・中段・下段 */
const ROWS: string[][] = [
  [...'1234567890'].map((d) => `Digit${d}`).concat('Minus'),
  [...'QWERTYUIOP'].map((c) => `Key${c}`),
  [...'ASDFGHJKL'].map((c) => `Key${c}`),
  [...'ZXCVBNM'].map((c) => `Key${c}`),
]

/** ホームポジション（物理位置で固定） */
const HOME_CODES = ['KeyF', 'KeyJ']

/** 担当する指の範囲（物理位置で固定）。範囲ごとにキーをまとめて枠で囲む */
const FINGER_ZONES: { finger: string; chars: string }[] = [
  { finger: 'pinky', chars: '1QAZ' },
  { finger: 'ring', chars: '2WSX' },
  { finger: 'middle', chars: '3EDC' },
  { finger: 'index-left', chars: '45RTFGVB' },
  { finger: 'index-right', chars: '67YUHJNM' },
  { finger: 'middle', chars: '8IK' },
  { finger: 'ring', chars: '9OL' },
  { finger: 'pinky', chars: '0-P' },
]

function codeOfChar(c: string): string {
  if (c === '-') return 'Minus'
  return /\d/.test(c) ? `Digit${c}` : `Key${c}`
}

/** 範囲の枠とキーのすき間（px） */
const ZONE_PAD = 3.5

/** 範囲の枠の角の丸み（px） */
const ZONE_RADIUS = 10

/** キーの下の影の厚み（px）。枠の下側はこの分だけ広げる */
const KEY_SHADOW = 4

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 多角形の頂点を、角を丸めた SVG のパスにする */
function roundedPath(points: [number, number][], radius: number): string {
  const n = points.length
  let d = ''
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i - 1 + n) % n]
    const [cx, cy] = points[i]
    const [nx, ny] = points[(i + 1) % n]
    const lenPrev = Math.hypot(cx - px, cy - py)
    const lenNext = Math.hypot(nx - cx, ny - cy)
    const r = Math.min(radius, lenPrev / 2, lenNext / 2)
    const ax = cx + ((px - cx) / lenPrev) * r
    const ay = cy + ((py - cy) / lenPrev) * r
    const bx = cx + ((nx - cx) / lenNext) * r
    const by = cy + ((ny - cy) / lenNext) * r
    d += `${i === 0 ? 'M' : 'L'}${ax},${ay} Q${cx},${cy} ${bx},${by} `
  }
  return d + 'Z'
}

/** 入れ替え演出の1回の点滅の長さ（ミリ秒）。2回点滅するので全体はこの2倍 */
export const SWAP_BLINK_MS = 300

export type MissKind = 'miss' | 'qwerty-miss'

/** 1回だけ再生する演出のクラス */
const ONE_SHOT_CLASSES = ['swap-blink', 'miss', 'qwerty-miss']

export class KeyboardView {
  readonly element: HTMLElement
  private readonly keys = new Map<string, HTMLElement>()
  private readonly labels = new Map<string, HTMLElement>()
  private swapTimer = 0
  private hintCode: string | null = null
  private readonly zones: SVGSVGElement

  constructor() {
    this.element = document.createElement('div')
    this.element.className = 'keyboard'
    ROWS.forEach((codes, i) => {
      const row = document.createElement('div')
      row.className = `keyboard-row keyboard-row-${i}`
      for (const code of codes) {
        const key = document.createElement('div')
        key.className = 'key'
        key.dataset.code = code
        if (HOME_CODES.includes(code)) key.classList.add('home')
        if (!isSwapCode(code)) key.classList.add('fixed')
        const label = document.createElement('span')
        label.className = 'key-label'
        if (code.startsWith('Digit')) label.textContent = code.slice(5)
        key.append(label)
        // 演出が終わったらクラスを外す（残っていると次の演出が CSS の優先順で負けて出ない）
        key.addEventListener('animationend', (e) => {
          if (e.target === key) key.classList.remove(...ONE_SHOT_CLASSES)
        })
        row.append(key)
        this.keys.set(code, key)
        this.labels.set(code, label)
      }
      this.element.append(row)
    })
    // 指の担当範囲の枠（キーの背景色は入れ替わりの表示に使うので、範囲ごとに外側を囲む）
    this.zones = document.createElementNS(SVG_NS, 'svg')
    this.zones.classList.add('finger-zones')
    this.element.prepend(this.zones)
    // キーの大きさは画面の幅で変わるので、大きさが変わるたびに描き直す
    new ResizeObserver(() => this.drawZones()).observe(this.element)
  }

  /** 指の担当範囲の枠を、今のキーの位置に合わせて描く */
  private drawZones(): void {
    this.zones.replaceChildren()
    for (const { finger, chars } of FINGER_ZONES) {
      // 段ごとの範囲の左右と上下（offset は演出の transform の影響を受けない）
      const rows = new Map<HTMLElement, { left: number; right: number; top: number; bottom: number }>()
      for (const c of chars) {
        const key = this.keys.get(codeOfChar(c))!
        const row = key.parentElement!
        const left = key.offsetLeft
        const right = left + key.offsetWidth
        const top = key.offsetTop
        const bottom = top + key.offsetHeight + KEY_SHADOW
        const r = rows.get(row)
        if (r) {
          r.left = Math.min(r.left, left)
          r.right = Math.max(r.right, right)
        } else {
          rows.set(row, { left, right, top, bottom })
        }
      }
      // 右側を上から下へ、左側を下から上へたどる（段の間は斜めにつなぐ）
      const spans = [...rows.values()].sort((a, b) => a.top - b.top)
      const points: [number, number][] = []
      for (const r of spans) {
        points.push([r.right + ZONE_PAD, r.top - ZONE_PAD], [r.right + ZONE_PAD, r.bottom + ZONE_PAD])
      }
      for (const r of spans.reverse()) {
        points.push([r.left - ZONE_PAD, r.bottom + ZONE_PAD], [r.left - ZONE_PAD, r.top - ZONE_PAD])
      }
      const path = document.createElementNS(SVG_NS, 'path')
      path.classList.add('finger-zone', `finger-${finger}`)
      path.setAttribute('d', roundedPath(points, ZONE_RADIUS))
      this.zones.append(path)
    }
  }

  /** 今の配列をそのまま表示する（演出なし） */
  setLayout(layout: Layout): void {
    clearTimeout(this.swapTimer)
    for (const code of this.keys.keys()) {
      if (isSwapCode(code)) this.showChar(code, layout)
    }
  }

  /**
   * 入れ替え演出：入れ替わるキーが2回点滅する。
   * 1回目は入れ替え前の文字、2回目は入れ替え後の文字を表示する。
   * （入力は呼び出し側で、最初から入れ替え後の配列として受け付ける）
   */
  animateSwap(before: Layout, after: Layout, changed: readonly string[]): void {
    this.setLayout(before)
    for (const code of changed) this.restartClass(code, 'swap-blink')
    this.swapTimer = window.setTimeout(() => {
      for (const code of changed) this.restartClass(code, 'swap-blink')
      this.setLayout(after)
    }, SWAP_BLINK_MS)
  }

  /** 押されているキーの表示 */
  setPressed(code: string, pressed: boolean): void {
    this.keys.get(code)?.classList.toggle('pressed', pressed)
  }

  /** すべての押下表示を消す（画面切り替え時など） */
  clearPressed(): void {
    for (const key of this.keys.values()) key.classList.remove('pressed')
  }

  /**
   * ミスの演出。
   * - miss: 赤く点滅して揺れる
   * - qwerty-miss: オレンジ色でガクッと沈み込み、本来の QWERTY の文字が半透明で浮かぶ
   */
  showMiss(code: string, kind: MissKind): void {
    const key = this.keys.get(code)
    if (!key) return
    this.restartClass(code, kind)
    if (kind === 'qwerty-miss') {
      const ghost = document.createElement('span')
      ghost.className = 'key-ghost'
      ghost.textContent = displayChar(QWERTY_CHAR[code])
      ghost.addEventListener('animationend', () => ghost.remove())
      key.append(ghost)
    }
  }

  /**
   * 正解の演出：キーの上にピカッと光る板を重ねる。
   * （キー自体のクラスにすると、入れ替えの点滅を打ち消してしまうので重ねる）
   */
  showHit(code: string, fever: boolean): void {
    const key = this.keys.get(code)
    if (!key) return
    key.querySelector('.key-hit')?.remove()
    const hit = document.createElement('span')
    hit.className = fever ? 'key-hit fever' : 'key-hit'
    hit.addEventListener('animationend', () => hit.remove())
    key.append(hit)
  }

  /** キーの要素（演出の位置合わせに使う） */
  keyElement(code: string): HTMLElement | undefined {
    return this.keys.get(code)
  }

  /** ヒント：打つべきキーを点滅させる（null で消す） */
  setHint(code: string | null): void {
    if (code === this.hintCode) return
    if (this.hintCode) this.keys.get(this.hintCode)?.classList.remove('hint')
    if (code) this.keys.get(code)?.classList.add('hint')
    this.hintCode = code
  }

  private showChar(code: string, layout: Layout): void {
    this.labels.get(code)!.textContent = displayChar(layout[code])
    this.keys.get(code)!.classList.toggle('changed', isChanged(layout, code))
  }

  /** クラスを付け直して CSS アニメーションを最初から再生する */
  private restartClass(code: string, className: string): void {
    const key = this.keys.get(code)
    if (!key) return
    key.classList.remove(...ONE_SHOT_CLASSES)
    void key.offsetWidth
    key.classList.add(className)
  }
}

/** キーに表示する文字（伸ばし棒は「ー」） */
function displayChar(c: string): string {
  return c === '-' ? 'ー' : c.toUpperCase()
}
