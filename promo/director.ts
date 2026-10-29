// 宣伝動画の台本：?clip= で指定した場面を組み立て、時刻ごとの動きを予約する
// 時間はすべて promo/vclock.js の仮想の時計で進む（capture.mjs が1コマずつ進めて撮る）
//
// 見せたいこと（このゲームの面白さ）
// 1. キーを目で探すこと自体がゲーム（見る人にも探させる）
// 2. 指が覚えた位置が罠になる（いつもの位置へ指が行ってガクッ）→ 経験は無意味！
// 3. 覚えたころにまた変わる
// 4. 得意な人ほどハマる（みんな初心者に戻る）

import '../src/style.css'
import './promo.css'
import { QUIZ_REVEAL, TRAP } from './clips.mjs'
import { SENTENCES } from '../src/data/sentences'
import { comboTier } from '../src/logic/hype'
import { QWERTY_CHAR, SWAP_CODES, defaultLayout, type Layout } from '../src/logic/keys'
import { SentenceInput, createMainTable } from '../src/logic/romaji'
import { shuffleLayout, type Difficulty } from '../src/logic/shuffle'
import { App } from '../src/ui/app'
import { Fx } from '../src/ui/fx'
import { KeyboardView } from '../src/ui/keyboard'
import { saveRanking } from '../src/ui/rankingStore'
import { Sound, comboPitch } from '../src/ui/sound'

declare global {
  interface Window {
    __promo: { loaded: boolean; ready: Promise<void>; startAt: number }
    __promoTick: () => void
  }
}

const params = new URLSearchParams(location.search)
const clipName = params.get('clip') ?? 'quiz'
document.body.classList.add(`clip-${clipName}`)

/** 仮想の時計で ms 待つ */
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/** 仮想の時刻 ms に fn を実行する（ms は今からの待ち時間ではなく、時刻） */
const at = (ms: number, fn: () => void) => setTimeout(fn, Math.max(0, ms - performance.now()))
/** 仮想の時刻 ms まで待つ */
const until = (ms: number) => wait(Math.max(0, ms - performance.now()))

/** キーを押して、少しして離す（本物のゲームに送る） */
function press(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }))
  setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), 70)
}

/** クラスを付け直して CSS アニメーションを最初から再生する */
function restart(el: Element, className: string): void {
  el.classList.remove(className)
  void (el as HTMLElement).offsetWidth
  el.classList.add(className)
}

function center(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

// ---- 動画用の音（ゲームの Sound と同じしくみ。vclock.js が記録する） ----

interface Tone {
  type: OscillatorType
  from: number
  to?: number
  at?: number
  dur: number
  vol: number
}

let audio: AudioContext | null = null
function tones(list: Tone[]): void {
  audio ??= new AudioContext()
  const now = audio.currentTime
  for (const t of list) {
    const start = now + (t.at ?? 0)
    const end = start + t.dur
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = t.type
    osc.frequency.setValueAtTime(t.from, start)
    if (t.to !== undefined) osc.frequency.exponentialRampToValueAtTime(t.to, end)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(t.vol, start + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    osc.connect(gain).connect(audio.destination)
    osc.start(start)
    osc.stop(end + 0.02)
  }
}

/** 大きな文字が叩きつけられる音：ドーン */
const SLAM: Tone[] = [
  { type: 'sine', from: 150, to: 38, dur: 0.7, vol: 0.55 },
  { type: 'square', from: 90, to: 45, dur: 0.25, vol: 0.12 },
  { type: 'triangle', from: 1200, to: 300, dur: 0.18, vol: 0.12 },
]
/** テロップが出る音：ポン */
const POP: Tone[] = [
  { type: 'triangle', from: 660, to: 990, dur: 0.09, vol: 0.16 },
  { type: 'sine', from: 1320, at: 0.03, dur: 0.08, vol: 0.06 },
]
/** 文字が並ぶ音：ポコッ */
const tick = (f: number): Tone[] => [{ type: 'square', from: f, to: f * 1.5, dur: 0.06, vol: 0.06 }]
/** 制限時間の秒読み：チッ */
const CLOCK: Tone[] = [{ type: 'square', from: 1800, dur: 0.03, vol: 0.07 }]
/** 指がキーの上を動く音：シュッ */
const WHOOSH: Tone[] = [{ type: 'sine', from: 500, to: 1100, dur: 0.08, vol: 0.05 }]
/** 目が探し回る音：ピッ */
const BLIP = (f: number): Tone[] => [{ type: 'sine', from: f, dur: 0.04, vol: 0.05 }]
/** 答えの発表：ジャーン */
const REVEAL: Tone[] = [
  { type: 'triangle', from: 784, dur: 0.12, vol: 0.2 },
  { type: 'triangle', from: 1047, at: 0.08, dur: 0.12, vol: 0.2 },
  { type: 'triangle', from: 1568, at: 0.16, dur: 0.4, vol: 0.22 },
  { type: 'sine', from: 2093, at: 0.16, dur: 0.4, vol: 0.08 },
]

// ---- 重ねるもの（テロップ・指・矢印・目線） ----

const layer = document.createElement('div')
layer.className = 'promo-layer'
/** パーティクルより下に置くもの（紙吹雪が上に乗るように） */
const under = document.createElement('div')
under.className = 'promo-layer promo-under'
document.body.append(layer, under)

/** テロップを出す。hideAt（仮想の時刻）で消える演出をして消す */
function telop(html: string, className: string, hideAt?: number, parent = layer): HTMLElement {
  const el = document.createElement('div')
  el.className = `telop ${className}`
  el.innerHTML = html
  parent.append(el)
  if (hideAt !== undefined) at(hideAt, () => hide(el))
  return el
}

function hide(el: HTMLElement): void {
  el.classList.add('out')
  at(performance.now() + 500, () => el.remove())
}

/** 字幕（画面の上か下）。em は色を変えて強調する */
function caption(html: string, where: 'top' | 'bottom', hideAt?: number): HTMLElement {
  tones(POP)
  return telop(`<span class="caption-box">${html}</span>`, `caption caption-${where}`, hideAt)
}

/** (x, y) を指す吹き出し（下向きの札） */
function bubble(x: number, y: number, html: string, className = '', hideAt?: number): HTMLElement {
  const el = telop(`<span class="bubble-box">${html}</span>`, `bubble ${className}`, hideAt)
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  return el
}

/** 人差し指のアイコン。指先がキーの中心に来るように動かす */
class Finger {
  readonly el: HTMLElement
  constructor() {
    this.el = telop('<span class="finger-icon">👆</span>', 'finger')
  }
  /** key の中心へ ms かけて動かす */
  moveTo(key: Element, ms = 220): void {
    const { x, y } = center(key)
    this.el.style.transitionDuration = `${ms}ms`
    this.el.style.left = `${x}px`
    this.el.style.top = `${y}px`
    tones(WHOOSH)
  }
  place(x: number, y: number): void {
    this.el.style.transitionDuration = '0ms'
    this.el.style.left = `${x}px`
    this.el.style.top = `${y}px`
  }
  tap(): void {
    restart(this.el.firstElementChild!, 'tap')
  }
}

/** from から to へ伸びる矢印（弧を描いて、線が伸びていく） */
function arrow(from: Element, to: Element, color: string, hideAt?: number): HTMLElement {
  const a = center(from)
  const b = center(to)
  const mx = (a.x + b.x) / 2
  const my = Math.min(a.y, b.y) - 70 - Math.abs(a.x - b.x) * 0.12
  const id = `ah${Math.round(performance.now())}`
  const d = `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`
  return telop(
    `<svg width="100%" height="100%"><defs><marker id="${id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}" stroke="#1c2a5e" stroke-width="1.5"/></marker></defs>` +
      `<path class="arrow-shadow" d="${d}" pathLength="100"/>` +
      `<path class="arrow-line" d="${d}" pathLength="100" stroke="${color}" marker-end="url(#${id})"/></svg>`,
    'arrow',
    hideAt,
  )
}

/** 目線（探しているところ）を表す光の輪 */
class Eye {
  readonly el: HTMLElement
  constructor() {
    this.el = telop('<span class="eye-ring"></span>', 'eye')
    this.el.style.opacity = '0'
  }
  moveTo(key: Element, ms: number): void {
    const { x, y } = center(key)
    this.el.style.opacity = '1'
    this.el.style.transitionDuration = `${ms}ms, ${ms}ms, 150ms`
    this.el.style.left = `${x}px`
    this.el.style.top = `${y}px`
  }
}

/** キー風の「RANDOM_TYPE」（タイトル画面と同じ見た目） */
function logoHtml(): string {
  return `<h1 class="title promo-logo">${[...'RANDOM_TYPE'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</h1>`
}

/** 配列を入れ替える（a の位置の文字と b の位置の文字を交換） */
function swapped(layout: Layout, pairs: [string, string][]): Layout {
  const next: Record<string, string> = { ...layout }
  for (const [a, b] of pairs) [next[a], next[b]] = [next[b], next[a]]
  return next
}

// ---- 自作のプレイ画面（罠の場面用。ゲームと同じ部品で組む） ----

class FakePlay {
  readonly keyboard = new KeyboardView()
  readonly fx = new Fx()
  readonly sound = new Sound()
  layout: Layout
  input: SentenceInput
  combo = 0
  correct = 0
  miss = 0
  qwerty = 0
  private readonly root: HTMLElement

  constructor(root: HTMLElement, sentence: { text: string; reading: string }, layout: Layout, label: string, difficulty: Difficulty) {
    this.root = root
    this.layout = layout
    this.input = new SentenceInput(sentence.reading, createMainTable())
    root.innerHTML = `
      <div class="screen game-screen">
        <div class="status">
          <span class="status-difficulty difficulty-${difficulty}">${label}</span>
          <span class="status-time">残り 90 秒</span>
          <span class="status-score">
            <span class="stat stat-correct">打鍵 <b>0</b></span>
            <span class="stat stat-miss">ミス <b>0</b></span>
            <span class="stat stat-qwerty">QWERTY <b>0</b></span>
          </span>
        </div>
        <div class="sentence">
          <div class="combo" hidden><b></b><span>COMBO</span></div>
          <div class="sentence-text"></div>
          <div class="sentence-reading"></div>
          <div class="sentence-romaji"><span class="typed"></span><span class="rest"></span></div>
        </div>
        <div class="keyboard-area"></div>
      </div>`
    root.querySelector('.keyboard-area')!.append(this.keyboard.element)
    this.keyboard.setLayout(this.layout)
    root.querySelector('.sentence-text')!.textContent = sentence.text
    root.querySelector('.sentence-reading')!.textContent = sentence.reading
    this.render()
  }

  /** 次に打つ文字 */
  get next(): string {
    return this.input.hint() ?? ''
  }

  /** 文字 c が今あるキー */
  keyOfChar(c: string): HTMLElement {
    return this.keyboard.keyElement(SWAP_CODES.find((k) => this.layout[k] === c)!)!
  }

  /** 文字 c の本来の QWERTY の位置のキー */
  qwertyKeyOf(c: string): HTMLElement {
    return this.keyboard.keyElement(SWAP_CODES.find((k) => QWERTY_CHAR[k] === c)!)!
  }

  private render(): void {
    const typed = this.input.typedRomaji
    const el = this.root.querySelector<HTMLElement>('.typed')!
    if (typed) {
      const last = document.createElement('span')
      last.className = 'typed-last'
      last.textContent = typed.slice(-1)
      el.replaceChildren(typed.slice(0, -1), last)
    }
    this.root.querySelector('.rest')!.textContent = this.input.remainingRomaji()
    this.setStat('.stat-correct', this.correct)
    this.setStat('.stat-miss', this.miss)
    this.setStat('.stat-qwerty', this.qwerty)
    const combo = this.root.querySelector<HTMLElement>('.combo')!
    combo.hidden = this.combo < 2
    if (!combo.hidden) {
      combo.querySelector('b')!.textContent = String(this.combo)
      combo.dataset.tier = String(comboTier(this.combo))
      restart(combo, 'bump')
    }
  }

  private setStat(selector: string, value: number): void {
    const stat = this.root.querySelector<HTMLElement>(selector)!
    const b = stat.querySelector('b')!
    if (b.textContent === String(value)) return
    b.textContent = String(value)
    restart(stat, 'bump')
  }

  /** 物理キー code を押す（app.ts と同じ判定・演出） */
  pressKey(code: string, found = false): 'correct' | 'miss' | 'qwerty-miss' {
    const c = this.next
    this.keyboard.setPressed(code, true)
    at(performance.now() + 90, () => this.keyboard.setPressed(code, false))
    if (this.layout[code] === c) {
      this.input.type(c)
      this.combo++
      this.correct++
      const tier = comboTier(this.combo)
      const color = ['#3fa2ff', '#2ecf8f', '#ff4f9a', '#8f63ff', '#ffb800'][tier]
      this.sound.play('correct', comboPitch(this.combo))
      this.keyboard.showHit(code, false)
      const { x, y } = Fx.center(this.keyboard.keyElement(code)!)
      this.fx.burst(x, y, { count: 8 + tier * 4, speed: 260 + tier * 60, colors: [color, '#ffffff', '#ffd23f'], life: 0.5 })
      this.fx.ring(x, y, color, 30)
      this.fx.text(x, y - 24, '+1', 'pop-plus', color)
      if (found) {
        this.fx.text(x, y - 56, 'みっけ！', 'pop-found')
        this.fx.burst(x, y, { count: 24, shape: 'star', speed: 420, size: 8, colors: ['#ffd23f', '#ffffff', '#ff4f9a'] })
        this.sound.play('found')
      }
      this.render()
      return 'correct'
    }
    const kind = QWERTY_CHAR[code] === c ? 'qwerty-miss' : 'miss'
    if (kind === 'miss') this.miss++
    else this.qwerty++
    this.keyboard.showMiss(code, kind)
    this.sound.play(kind)
    restart(this.root.querySelector('.game-screen')!, kind === 'miss' ? 'jolt' : 'drop')
    this.combo = 0
    this.render()
    return kind
  }

  /** キーを入れ替える（入れ替わるキーが2回点滅してきらきら） */
  swap(difficulty: Difficulty): void {
    const before = this.layout
    const { layout, changed } = shuffleLayout(before, difficulty)
    this.layout = layout
    this.keyboard.animateSwap(before, layout, changed)
    sparkle(this.fx, this.keyboard, changed)
    this.sound.play('swap')
  }
}

/** キーボードだけを大きく見せる舞台 */
function stageKeyboard(layout: Layout): { keyboard: KeyboardView; fx: Fx; sound: Sound } {
  const keyboard = new KeyboardView()
  const fx = new Fx()
  const sound = new Sound()
  app().innerHTML = `<div class="stage"><div class="stage-keyboard"></div></div>`
  app().querySelector('.stage-keyboard')!.append(keyboard.element)
  keyboard.setLayout(layout)
  return { keyboard, fx, sound }
}

/** 入れ替わるキーからきらきら */
function sparkle(fx: Fx, keyboard: KeyboardView, changed: readonly string[]): void {
  for (const code of changed) {
    const { x, y } = Fx.center(keyboard.keyElement(code)!)
    fx.burst(x, y, { count: 5, shape: 'star', speed: 170, size: 7, colors: ['#ffd23f', '#ffffff'], life: 0.6, gravity: 0 })
  }
}

// ---- 本物のゲームを自動で打つ（hunt・chaos・lose） ----

/** 次に打つローマ字（画面のローマ字表示の残りの先頭） */
function nextChar(): string {
  return document.querySelector('.sentence-romaji .rest')?.textContent?.[0] ?? ''
}

function gameKeys(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.keyboard .key:not(.fixed)')]
}

/** 文字 c が今どのキーにあるか（画面のキーボードの表示から探す） */
function keyOf(c: string): HTMLElement | undefined {
  const label = c === '-' ? 'ー' : c.toUpperCase()
  return gameKeys().find((k) => k.querySelector('.key-label')?.textContent === label)
}

const qwertyCode = (c: string) => (c === '-' ? 'Minus' : `Key${c.toUpperCase()}`)

/** 目線を何か所かさまよわせてから、正しいキーで止める */
async function search(eye: Eye, target: HTMLElement, hops: number): Promise<void> {
  const keys = gameKeys().filter((k) => k !== target)
  for (let i = 0; i < hops; i++) {
    eye.moveTo(keys[Math.floor(Math.random() * keys.length)], 170)
    tones(BLIP(700 + i * 90))
    await wait(210)
  }
  eye.moveTo(target, 200)
  await wait(260)
}

/** 本物のゲームを、難易度 index（0 やさしい・1 ちょっぴり・2 カオス）で始める */
function startApp(index: number): void {
  new App(app())
  for (let i = 0; i < index; i++) at(10 + i * 10, () => press('ArrowRight'))
  at(60, () => press('Space'))
}

/** 本物のゲームのプレイが始まる時刻（Space から3秒のカウントダウン） */
const PLAY_START = 3060
/** hunt の場面を撮り始める時刻（1文クリアの少し前） */
const HUNT_START = Number(params.get('huntStart') ?? 7500)

// ---- 場面 ----

type Clip = { startAt: number; setup: () => void }
const app = () => document.querySelector<HTMLElement>('#app')!

const CLIPS: Record<string, Clip> = {
  // 見る人への問題：ぐちゃぐちゃのキーボードで「“A” はどこ？」。2秒たったら答えが光る
  quiz: {
    startAt: 0,
    setup() {
      const { layout } = shuffleLayout(defaultLayout(), 'chaos')
      const { keyboard, fx, sound } = stageKeyboard(layout)
      at(250, () => {
        telop(`<span class="quiz-box"><span class="quiz-q">“<b>A</b>” はどこ？</span><span class="quiz-timer"><i></i></span></span>`, 'quiz')
        tones(POP)
      })
      for (const t of [700, 1200, 1700, 2200]) at(t, () => tones(CLOCK))
      at(QUIZ_REVEAL, () => {
        const code = SWAP_CODES.find((c) => layout[c] === 'a')!
        const key = keyboard.keyElement(code)!
        document.body.classList.add('quiz-answer')
        key.classList.add('quiz-hit')
        keyboard.showHit(code, true)
        const { x, y } = Fx.center(key)
        fx.ring(x, y, '#ff4f9a', 80)
        fx.burst(x, y, { count: 40, shape: 'star', speed: 520, size: 9, colors: ['#ffd23f', '#ffffff', '#ff4f9a'] })
        bubble(x, y - 52, 'ここ！', 'bubble-pink')
        tones(REVEAL)
        sound.play('found')
      })
    },
  },

  // ルール：いつもの QWERTY が、点滅して入れ替わる（2回）
  rule: {
    startAt: 0,
    setup() {
      const { keyboard, fx, sound } = stageKeyboard(defaultLayout())
      at(150, () => caption('1文打つたびに<em>キーが入れ替わる！</em>', 'top'))
      let layout = defaultLayout()
      const doSwap = (difficulty: Difficulty) => {
        const r = shuffleLayout(layout, difficulty)
        keyboard.animateSwap(layout, r.layout, r.changed)
        sparkle(fx, keyboard, r.changed)
        sound.play('swap')
        layout = r.layout
      }
      at(700, () => doSwap('normal'))
      at(2000, () => doSwap('normal'))
    },
  },

  // 罠：打つのは「ねこ」。指がいつもの K の位置へ行ってガクッ → 本当の K へ → また O でガクッ → 経験は無意味！
  trap: {
    startAt: 0,
    setup() {
      const sentence = SENTENCES.find((s) => s.text === '猫がこたつで丸くなる')!
      // K は W の位置へ、O は Z の位置へ（ほかにも少し入れ替える）
      const layout = swapped(defaultLayout(), [
        ['KeyK', 'KeyW'],
        ['KeyO', 'KeyZ'],
        ['KeyT', 'KeyH'],
      ])
      const play = new FakePlay(app(), sentence, layout, 'ちょっぴり難しめモード', 'normal')
      const finger = new Finger()
      const h = center(play.keyboard.keyElement('KeyJ')!)
      finger.place(h.x + 40, h.y + 120)
      void (async () => {
        const typeWith = async (code: string, moveMs: number, found = false) => {
          finger.moveTo(play.keyboard.keyElement(code)!, moveMs)
          await wait(moveMs + 30)
          finger.tap()
          return play.pressKey(code, found)
        }
        await until(300)
        await typeWith('KeyN', 200)
        await until(650)
        await typeWith('KeyE', 200)
        // k：指はいつもの K の位置へ
        await until(TRAP.firstMiss - 230)
        const qk = play.qwertyKeyOf('k')
        await typeWith('KeyK', 200)
        bubble(center(qk).x, center(qk).y - 58, 'いつもの場所…', 'bubble-orange', 2400)
        await until(1550)
        const realK = play.keyOfChar('k')
        arrow(qk, realK, '#ff4f9a', 3300)
        await wait(300)
        bubble(center(realK).x, center(realK).y - 58, 'K は今ここ！', 'bubble-pink', 3300)
        await until(1950)
        await typeWith(realK.dataset.code!, 380, true)
        // o：また指がいつもの位置へ
        await until(2450)
        const qo = play.qwertyKeyOf('o')
        await typeWith('KeyO', 260)
        bubble(center(qo).x, center(qo).y - 58, 'また！', 'bubble-orange', 3500)
        await until(2950)
        const realO = play.keyOfChar('o')
        arrow(qo, realO, '#ff4f9a', 3500)
        await until(3150)
        await typeWith(realO.dataset.code!, 320, true)
        // 経験は無意味！
        await until(TRAP.slam)
        finger.el.classList.add('out')
        document.body.classList.add('promo-dim')
        const big = telop(`<div class="burst"></div><div class="big-copy">経験は無意味！</div>`, 'slam')
        tones(SLAM)
        play.fx.flash('#ffffff')
        restart(app(), 'promo-quake')
        await until(TRAP.build + 300)
        big.classList.add('shrink')
        play.swap('chaos')
        await until(TRAP.build + 450)
        telop(`<span class="copy-line copy-line-1">1文ごとに<em>配列が変わる</em>、</span>`, 'copy copy-1')
        tones(POP)
        await until(TRAP.drop)
        telop(`<span class="copy-line copy-line-2">前代未聞のタイピング！</span>`, 'copy copy-2')
        tones(SLAM.slice(0, 1).map((t) => ({ ...t, vol: 0.3 })))
        play.fx.cannons(50)
      })()
    },
  },

  // 目で探して見つける → 1文クリア → 覚えたころにまた変わる（本物のゲーム・ちょっぴり難しめ）
  hunt: {
    startAt: HUNT_START,
    setup() {
      startApp(1)
      const eye = new Eye()
      at(HUNT_START + 100, () => caption('目で探して、<em>見つけて打つ！</em>', 'top', HUNT_START + 3150))
      // 1文クリアの文字が出たら、字幕を変える
      let cleared = false
      new MutationObserver(() => {
        if (cleared || !document.querySelector('.pop-clear, .pop-perfect')) return
        cleared = true
        console.warn(`promo: 1文クリア ${Math.round(performance.now())}`)
        if (performance.now() > HUNT_START) at(performance.now() + 450, () => caption('覚えたころに、<em>また変わる！</em>', 'top'))
      }).observe(document.body, { childList: true, subtree: true })
      void (async () => {
        await until(PLAY_START + 100)
        for (let i = 0; i < 300; i++) {
          const target = keyOf(nextChar())
          if (!target) {
            await wait(50)
            continue
          }
          if (target.classList.contains('changed')) {
            await search(eye, target, 2 + (i % 2))
          } else {
            eye.moveTo(target, 120)
            await wait(150)
          }
          press(target.dataset.code!)
          await wait(110)
        }
      })()
    },
  },

  // カオスモード：カウントダウン中に全部のキーが入れ替わる
  chaos: {
    startAt: 350,
    setup() {
      startApp(2)
      at(350 + 100, () => caption('カオスモードは<em>毎回ぜんぶ！</em>', 'top'))
    },
  },

  // 得意な人ほどハマる：いつもの位置を何度も押して、苦戦した結果（本物のゲーム・ちょっぴり難しめ）
  lose: {
    startAt: 93_250,
    setup() {
      // ランキングを上手な記録で埋めておく（空だと1位扱いになり、苦戦したのに紙吹雪で祝われてしまう）
      const top = Array.from({ length: 10 }, (_, i) => ({ id: `promo-${i}`, name: 'プロ', correct: 200 - i, miss: 0, qwertyMiss: 0, kpm: 133, date: '2026-10-01T00:00:00.000Z' }))
      saveRanking('normal', top)
      startApp(1)
      at(93_250 + 250, () => caption('タイピングが得意な人ほど<em class="orange">ハマる！</em>', 'top'))
      void (async () => {
        await until(PLAY_START + 100)
        for (let i = 0; performance.now() < 93_000; i++) {
          const c = nextChar()
          const target = keyOf(c)
          if (!target) {
            await wait(50)
            continue
          }
          if (target.classList.contains('changed')) {
            // 入れ替わったキーは、まずいつもの位置を押してしまう。たまに関係ないキーも
            if (i % 3 !== 2) {
              press(qwertyCode(c))
              await wait(500)
            }
            if (i % 5 === 0) {
              press(i % 2 === 0 ? 'KeyQ' : 'KeyM')
              await wait(400)
            }
            await wait(1100)
          } else {
            await wait(560)
          }
          press(target.dataset.code!)
          await wait(380)
        }
      })()
    },
  },

  // 締め：ロゴ・無料で今すぐプレイ・「あなたは “A” を見つけられる？」
  ending: {
    startAt: 0,
    setup() {
      const fx = new Fx()
      app().innerHTML = `
        <div class="ending">
          ${logoHtml()}
          <div class="ending-card"><em>無料</em>で今すぐプレイ！</div>
          <div class="ending-q">あなたは “<b>A</b>” を見つけられる？</div>
          <div class="ending-keys">${[...'QWERTYUIOP'].map((c) => `<span class="mini-key" data-c="${c}">${c}</span>`).join('')}</div>
        </div>`
      const spans = [...app().querySelectorAll<HTMLElement>('.promo-logo span')]
      spans.forEach((_, i) => at(60 + i * 40, () => tones(tick(523 * 2 ** ((i % 8) / 12)))))
      at(150, () => fx.cannons(50))
      at(650, () => tones(POP))
      at(1100, () => tones(POP))
      // ミニキーボードが入れ替わり続ける
      const keys = [...app().querySelectorAll<HTMLElement>('.ending-keys .mini-key')]
      for (let n = 0; n < 4; n++) {
        at(1300 + n * 550, () => {
          const order = keys.map((k) => k.textContent!).sort(() => Math.random() - 0.5)
          keys.forEach((k, i) => {
            k.textContent = order[i]
            k.classList.toggle('changed', order[i] !== k.dataset.c)
            restart(k, 'swap')
          })
        })
      }
      at(1500, () => fx.confettiRain(80))
    },
  },
}

// テロップで使う文字を先に描いて、フォントを読み込ませておく（Google Fonts は使う文字の分だけ後から読み込むので）
const WARM_TEXT =
  '“A”はどこ？ここ！1文打つたびにキーが入れ替わる！いつもの場所…Kは今ここ！また！経験は無意味！1文ごとに配列が変わる、前代未聞のタイピング！' +
  '目で探して、見つけて打つ！覚えたころに、また変わる！カオスモードは毎回ぜんぶ！タイピングが得意な人ほどハマる！' +
  '無料で今すぐプレイ！あなたは“A”を見つけられる？RANDOM_TYPE'
const warm = document.createElement('div')
warm.className = 'font-warm'
warm.innerHTML = `${WARM_TEXT}<span>${WARM_TEXT}</span>`
document.body.append(warm)

// 撮影のたびに描き直させるための1点（capture.mjs が毎コマ呼ぶ）
const dot = document.createElement('div')
dot.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:99;pointer-events:none'
document.body.append(dot)
let tickN = 0
window.__promoTick = () => {
  dot.style.background = `rgba(128,128,128,${(tickN++ % 2) * 0.01 + 0.01})`
}

const clip = CLIPS[clipName]
clip.setup()
window.__promo = { loaded: true, ready: Promise.resolve(), startAt: clip.startAt }
