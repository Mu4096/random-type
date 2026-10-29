// 画面の切り替えとキー入力（タイトル → プレイ → 結果 → ランキング）

import { SENTENCES } from '../data/sentences'
import { Game } from '../logic/game'
import {
  ComboCounter,
  GRADE_KPM,
  GRADE_ORDER,
  comboTier,
  grade,
  gradeKpm,
  gradeMeterLevel,
  isFound,
  type HypeEvent,
} from '../logic/hype'
import { SWAP_CODES, defaultLayout, isChanged, type Layout } from '../logic/keys'
import { NAME_MAX, RANKING_SIZE, addEntry, normalizeName, rankOf, type RankingEntry } from '../logic/ranking'
import { kpm } from '../logic/score'
import { shuffleLayout, type Difficulty } from '../logic/shuffle'
import { AttractVideo } from './attract'
import { Fx, PARTY_COLORS } from './fx'
import { KeyboardView } from './keyboard'
import { loadRanking, newEntryId, saveRanking } from './rankingStore'
import { Sound, comboPitch } from './sound'

const DIFFICULTIES: { id: Difficulty; name: string; danger: number; desc: string; tag: string }[] = [
  { id: 'easy', name: '簡単初心者モード', danger: 1, desc: '毎回3キーずつ入れ替わる', tag: 'まずはここから' },
  { id: 'normal', name: 'ちょっぴり難しめモード', danger: 2, desc: '毎回5キー<br>入れ替えは止まらない', tag: '慣れてきたら' },
  { id: 'chaos', name: '激ムズカオスモード', danger: 3, desc: '毎回ぜんぶ入れ替わる', tag: '腕に自信あり？' },
]

/** 難易度カードのミニキーボードの並び（伸ばし棒は数字の段にあるので出さない） */
const DEMO_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
/** やさしいモードのミニキーボードが全部入れ替わってから、元に戻すまでの回数 */
const DEMO_EASY_HOLD = 2
/** ミニキーボードの入れ替えを、カードごとにずらす時間 */
const DEMO_STAGGER_MS = 180

/** タイトル文字を入れ替える間隔と、元に戻すまでの時間 */
const TITLE_SCRAMBLE_MS = 1400
const TITLE_RESTORE_MS = 600

/** 結果表示の直後にキーを受け付けない時間（打ち間違い防止） */
const RESULT_LOCK_MS = 1000
/** この時間打鍵がないと、打つべきキーを点滅させる */
const HINT_DELAY_MS = 3000
/** 最初の入れ替え演出を、カウントダウンが始まってから少し遅らせる */
const FIRST_SWAP_DELAY_MS = 500
/** 残り時間がこれを切ったらタイマー表示を急がせる */
const HURRY_MS = 10_000
/** コンボ表示を出し始める数 */
const COMBO_SHOW = 2
/** これ以上のコンボが途切れたら、途切れた演出を出す */
const COMBO_BREAK_SHOW = 10
/** 入れ替わったキーを探し当てたときの言葉（ランダムに出す） */
const FOUND_WORDS = ['みっけ！', '発見！', 'そこか！', '見つけた！', 'ナイス発見！']
/** ランクのメーターが上がり始めるまでの時間（結果画面を出してから） */
const METER_DELAY_MS = 900
/** メーターがランク1つぶんの区間を上がる時間 */
const METER_BAND_MS = 420
/** メーターが止まってからハンコを押すまでの時間 */
const METER_STAMP_MS = 280
/** メーターがいちばん下で止まっても、少しは見えるようにする高さ（区間単位） */
const METER_MIN_LEVEL = 0.12
/** コンボの段階ごとの色（パーティクル・+1 の文字） */
const TIER_COLORS = ['#3fa2ff', '#2ecf8f', '#ff4f9a', '#8f63ff', '#ffb800']

type Screen = 'title' | 'game' | 'result' | 'ranking'

/** 結果画面から入ったランキング画面で見せる、まだ登録していない自分の記録 */
interface Draft {
  entry: RankingEntry
  /** 登録したら何位になるか。圏外なら null */
  rank: number | null
}

/** IME が ON のときの打鍵か */
function isImeKey(e: KeyboardEvent): boolean {
  return e.isComposing || e.key === 'Process'
}

/** Enter キー（テンキー含む）か。押しっぱなしの自動リピートは数えない */
function isEnterKey(e: KeyboardEvent): boolean {
  return (e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat
}

/** 開始キー（Space・Enter）か。押しっぱなしの自動リピートは数えない */
function isStartKey(e: KeyboardEvent): boolean {
  return (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat
}

/** ユーザーが入力した文字を HTML に埋め込めるようにする */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** 登録日時の表示（YYYY/MM/DD） */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/** 文字列を1文字ずつ span で包む（文字ごとに時間差で動かす演出用）。本来の文字を data-char に持たせる */
function spanEach(text: string): string {
  return [...text].map((c, i) => `<span style="--i:${i}" data-char="${c}">${c}</span>`).join('')
}

export class App {
  private readonly root: HTMLElement
  private readonly keyboard = new KeyboardView()
  private readonly sound = new Sound()
  private readonly fx = new Fx()
  private combo = new ComboCounter()
  /** 今の文でミスした回数（パーフェクト判定用） */
  private sentenceMisses = 0
  /** 最後に秒読みの音を鳴らした残り秒数 */
  private lastTick = 0
  private gradeTimer = 0
  /** 今動いているメーターの演出（画面が変わったら古いものを止める） */
  private meterRun = 0
  private readonly muteButton: HTMLButtonElement
  private readonly attract: AttractVideo
  private readonly attractButton: HTMLButtonElement
  private screen: Screen = 'title'
  private difficultyIndex = 0
  private game: Game | null = null
  private resultShownAt = 0
  private rafId = 0
  private firstSwapTimer = 0
  private titleTimer = 0
  /** 難易度カードのミニキーボードの配列（難易度の並び順） */
  private demoLayouts: Layout[] = []
  /** やさしいモードのミニキーボードが全部入れ替わってから経った回数 */
  private demoEasyHold = 0
  /** 最後に判定された打鍵（ミス含む）の時刻。ヒントの判定に使う */
  private lastPressAt = 0
  /** 直前に表示したカウントダウンの数字（音を鳴らすタイミングの判定用） */
  private lastCount = 0
  /** 直前のプレイの記録（まだ登録していない）。結果画面からランキング画面に持っていく */
  private draft: Draft | null = null
  /** ランキング画面でニックネームを入力中か */
  private naming = false
  /** ランキング画面で表示中の難易度 */
  private rankingIndex = 0
  /** ランキング画面で光らせる記録（登録した直後） */
  private highlightId: string | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.muteButton = this.createMuteButton()
    this.attract = new AttractVideo(() => this.sound.muted)
    this.attractButton = this.createAttractButton()
    window.addEventListener('keydown', (e) => this.onKeyDown(e))
    window.addEventListener('keyup', (e) => this.keyboard.setPressed(e.code, false))
    window.addEventListener('blur', () => this.keyboard.clearPressed())
    this.showTitle()
  }

  private createMuteButton(): HTMLButtonElement {
    const button = document.createElement('button')
    button.className = 'mute'
    button.addEventListener('click', () => {
      this.sound.muted = !this.sound.muted
      this.renderMute()
      // フォーカスが残ると Space などで押されてしまうので外す
      button.blur()
    })
    document.body.append(button)
    return button
  }

  /** 放置したときに宣伝動画を流すかを切り替えるボタン（ミュートボタンの隣） */
  private createAttractButton(): HTMLButtonElement {
    const button = document.createElement('button')
    button.className = 'attract-toggle'
    button.addEventListener('click', () => {
      this.attract.enabled = !this.attract.enabled
      this.renderAttract()
      button.blur()
    })
    document.body.append(button)
    return button
  }

  private renderAttract(): void {
    const on = this.attract.enabled
    this.attractButton.textContent = '📺'
    this.attractButton.title = on ? '放置したときの動画：オン（クリックでオフ）' : '放置したときの動画：オフ（クリックでオン）'
    this.attractButton.classList.toggle('off', !on)
  }

  private renderMute(): void {
    this.muteButton.textContent = this.sound.muted ? '🔇' : '🔊'
    this.muteButton.title = this.sound.muted ? '音を出す' : '音を消す'
    this.muteButton.classList.toggle('muted', this.sound.muted)
  }

  // ---- タイトル ----

  private showTitle(): void {
    this.screen = 'title'
    this.game = null
    cancelAnimationFrame(this.rafId)
    clearTimeout(this.firstSwapTimer)
    clearInterval(this.titleTimer)
    this.resetHype()
    this.renderMute()
    this.renderAttract()
    this.attract.arm()
    this.root.innerHTML = `
      <div class="screen title-screen">
        <h1 class="title">${spanEach('RANDOM_TYPE')}</h1>
        <div class="rules">
          <p class="rules-main">1文打つたびに<em>キーが入れ替わる！</em></p>
          <p class="rules-sub">制限時間 <strong>90秒</strong> で何打鍵いける？</p>
        </div>
        <div class="difficulties">
          ${DIFFICULTIES.map(
            (d, i) => `
            <button class="difficulty difficulty-${d.id}" data-index="${i}">
              <span class="difficulty-tag">${d.tag}</span>
              <span class="difficulty-name">${d.name}</span>
              <span class="difficulty-meter">${'<span class="fire">🔥</span>'.repeat(d.danger)}<span class="off">${'🔥'.repeat(3 - d.danger)}</span></span>
              <span class="mini-keys" aria-hidden="true">${DEMO_ROWS.map(
                (row) =>
                  `<span class="mini-row">${[...row].map((c) => `<span class="mini-key" data-code="Key${c.toUpperCase()}">${c.toUpperCase()}</span>`).join('')}</span>`,
              ).join('')}</span>
              <span class="difficulty-desc">${d.desc}</span>
            </button>`,
          ).join('')}
        </div>
        <p class="guide">← → で難易度を選んで <kbd>Space</kbd> か <kbd>Enter</kbd> でスタート</p>
        <p class="ime-notice">日本語入力モードをオフにしてください</p>
        <button class="ranking-button">🏆 ランキング <kbd>R</kbd></button>
      </div>`
    this.root.querySelectorAll<HTMLButtonElement>('.difficulty').forEach((button) => {
      button.addEventListener('click', () => {
        this.difficultyIndex = Number(button.dataset.index)
        this.renderDifficulty(true)
        button.blur()
      })
    })
    this.root.querySelector('.ranking-button')!.addEventListener('click', () => this.showRanking(this.difficultyIndex))
    this.renderDifficulty()
    this.demoLayouts = DIFFICULTIES.map(() => defaultLayout())
    this.demoEasyHold = 0
    this.titleTimer = window.setInterval(() => {
      this.scrambleTitle()
      this.shuffleDemo()
    }, TITLE_SCRAMBLE_MS)
  }

  /** タイトル文字の一部をランダムに入れ替え、少しして元に戻す（ゲーム内容の予告） */
  private scrambleTitle(): void {
    // 裏のタブではタイマーが遅れてまとめて動くので、見えていないあいだは入れ替えない
    if (document.hidden) return
    // 入れ替え中の文字は選ばない（戻る前に重ねて入れ替えると、入れ替わったまま残るため）
    const spans = [...this.root.querySelectorAll<HTMLElement>('.title span:not(.scrambled)')]
    if (spans.length < 2) return
    const picked = spans
      .map((span) => ({ span, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .slice(0, 3)
      .map((p) => p.span)
    const texts = picked.map((s) => s.dataset.char ?? '')
    // 選んだ文字を1つずつずらす（全部が元と違う文字になる）
    picked.forEach((span, i) => {
      span.textContent = texts[(i + 1) % texts.length]
      span.classList.add('scrambled')
    })
    window.setTimeout(() => {
      // 直前の表示ではなく、本来の文字に戻す
      for (const span of picked) {
        span.textContent = span.dataset.char ?? ''
        span.classList.remove('scrambled')
      }
    }, TITLE_RESTORE_MS)
  }

  /** 難易度カードのミニキーボードを、その難易度と同じルールで入れ替える（どのモードか見てわかるように） */
  private shuffleDemo(): void {
    DIFFICULTIES.forEach((d, i) => {
      window.setTimeout(() => {
        const card = this.root.querySelector<HTMLElement>(`.difficulty[data-index="${i}"]`)
        if (this.screen !== 'title' || !card) return
        let { layout, changed } = shuffleLayout(this.demoLayouts[i], d.id)
        if (d.id === 'easy' && changed.length === 0) {
          // 全部入れ替わって止まったら、少し見せてから最初に戻す
          if (++this.demoEasyHold <= DEMO_EASY_HOLD) return
          this.demoEasyHold = 0
          layout = defaultLayout()
          changed = SWAP_CODES.filter((code) => isChanged(this.demoLayouts[i], code))
        }
        this.demoLayouts[i] = layout
        card.querySelectorAll<HTMLElement>('.mini-key').forEach((key) => {
          const code = key.dataset.code!
          key.textContent = (layout[code] ?? '').toUpperCase()
          key.classList.toggle('changed', isChanged(layout, code))
          if (changed.includes(code)) {
            // アニメーションをやり直すため、一度外して描画させてから付け直す
            key.classList.remove('swap')
            void key.offsetWidth
            key.classList.add('swap')
          }
        })
      }, i * DEMO_STAGGER_MS)
    })
  }

  /** 選んでいる難易度を表示する。changed なら選んだカードから火花を出す（難しいほど派手） */
  private renderDifficulty(changed = false): void {
    this.root.querySelectorAll<HTMLButtonElement>('.difficulty').forEach((button, i) => {
      button.classList.toggle('selected', i === this.difficultyIndex)
      if (changed && i === this.difficultyIndex) {
        const { x, y } = Fx.center(button)
        this.fx.burst(x, y, { count: 6 + i * 8, speed: 260 + i * 120, shape: 'star', size: 7 })
        this.sound.play('count', 1 + i * 0.25)
      }
    })
  }

  private onTitleKey(e: KeyboardEvent): void {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const n = DIFFICULTIES.length
      this.difficultyIndex = (this.difficultyIndex + (e.code === 'ArrowLeft' ? n - 1 : 1)) % n
      this.renderDifficulty(true)
      e.preventDefault()
    } else if (isStartKey(e)) {
      // Space のスクロールや、フォーカスの残ったボタンの Enter を止める
      e.preventDefault()
      this.startGame()
      this.fx.cannons(40)
    } else if (e.code === 'KeyR') {
      this.showRanking(this.difficultyIndex)
    }
  }

  /** プレイ中の IME の警告を出す（出ているときはもう一度揺らす） */
  private showWarning(): void {
    const warning = this.root.querySelector<HTMLElement>('.warning')!
    warning.hidden = false
    warning.classList.remove('shake')
    void warning.offsetWidth
    warning.classList.add('shake')
  }

  // ---- プレイ ----

  private startGame(): void {
    this.screen = 'game'
    this.attract.disarm()
    clearInterval(this.titleTimer)
    this.resetHype()
    const difficulty = DIFFICULTIES[this.difficultyIndex]
    const now = performance.now()
    const game = new Game({ difficulty: difficulty.id, sentences: SENTENCES }, now)
    this.game = game
    this.lastPressAt = 0
    this.lastCount = 0
    this.root.innerHTML = `
      <div class="screen game-screen">
        <div class="status">
          <span class="status-difficulty difficulty-${difficulty.id}">${difficulty.name}</span>
          <span class="status-time"></span>
          <span class="status-score">
            <span class="stat stat-correct">打鍵 <b></b></span>
            <span class="stat stat-miss">ミス <b></b></span>
            <span class="stat stat-qwerty">QWERTY <b></b></span>
          </span>
        </div>
        <div class="sentence">
          <div class="combo" hidden><b></b><span>COMBO</span></div>
          <div class="sentence-text"></div>
          <div class="sentence-reading"></div>
          <div class="sentence-romaji"><span class="typed"></span><span class="rest"></span></div>
        </div>
        <p class="warning" hidden>IME（日本語入力）をオフにしてね</p>
        <div class="keyboard-area"></div>
        <div class="countdown"></div>
        <p class="guide"><kbd>Esc</kbd> で中断</p>
      </div>`
    this.root.querySelector('.keyboard-area')!.append(this.keyboard.element)
    this.keyboard.setHint(null)
    this.keyboard.setLayout(defaultLayout())
    this.renderSentence(true)
    // 最初の入れ替えはカウントダウン中に見せる（配列はすでに入れ替え後）
    this.firstSwapTimer = window.setTimeout(() => {
      this.keyboard.animateSwap(defaultLayout(), game.layout, game.changed)
      this.sparkleSwap(game.changed)
      this.sound.play('swap')
    }, FIRST_SWAP_DELAY_MS)
    this.loop()
  }

  /** 毎フレーム：カウントダウン・タイマー・ヒントの表示、時間切れの判定 */
  private loop = (): void => {
    const game = this.game
    if (!game || this.screen !== 'game') return
    const now = performance.now()
    if (game.update(now) === 'finished') {
      this.showResult(now)
      return
    }

    const countdown = this.root.querySelector<HTMLElement>('.countdown')!
    const count = Math.ceil(game.countdownLeftMs(now) / 1000)
    if (count !== this.lastCount) {
      this.lastCount = count
      countdown.textContent = count > 0 ? String(count) : 'スタート！'
      countdown.classList.remove('pop', 'go')
      void countdown.offsetWidth
      countdown.classList.add(count > 0 ? 'pop' : 'go')
      this.sound.play(count > 0 ? 'count' : 'start')
      if (count === 0) {
        const { x, y } = Fx.center(countdown)
        this.fx.burst(x, y, { count: 50, shape: 'confetti', speed: 700, life: 1.2 })
        this.fx.ring(x, y, '#ff4f9a', 120)
      }
    }

    const left = game.timeLeftMs(now)
    const time = this.root.querySelector<HTMLElement>('.status-time')!
    time.textContent = `残り ${Math.ceil(left / 1000)} 秒`
    const hurry = game.phase === 'playing' && left <= HURRY_MS
    time.classList.toggle('hurry', hurry)
    document.body.classList.toggle('hurry', hurry)
    // 残り10秒からは1秒ごとに秒読みの音（残り3秒からは高い音）
    const sec = Math.ceil(left / 1000)
    if (hurry && sec !== this.lastTick) {
      this.lastTick = sec
      this.sound.play('tick', sec <= 3 ? 1.5 : 1)
    }

    // ヒント：プレイ開始か最後の打鍵から一定時間たったら、打つべきキーを点滅
    const idle = now - Math.max(game.playStartAt, this.lastPressAt)
    const hint = game.phase === 'playing' && idle >= HINT_DELAY_MS ? game.input.hint() : null
    this.keyboard.setHint(hint === null ? null : (SWAP_CODES.find((code) => game.layout[code] === hint) ?? null))

    this.rafId = requestAnimationFrame(this.loop)
  }

  /** 問題文とスコアを表示する。newSentence なら文が出てくる演出をする */
  private renderSentence(newSentence = false): void {
    const game = this.game!
    this.root.querySelector('.sentence-text')!.textContent = game.sentence.text
    this.root.querySelector('.sentence-reading')!.textContent = game.sentence.reading
    this.renderTyped(game.input.typedRomaji, newSentence)
    this.root.querySelector('.rest')!.textContent = game.input.remainingRomaji()
    const { correct, miss, qwertyMiss } = game.score
    this.setStat('.stat-correct', correct)
    this.setStat('.stat-miss', miss)
    this.setStat('.stat-qwerty', qwertyMiss)
    if (newSentence) {
      const sentence = this.root.querySelector<HTMLElement>('.sentence')!
      sentence.classList.remove('pop')
      void sentence.offsetWidth
      sentence.classList.add('pop')
    }
  }

  /** 打ったローマ字を表示する。最後に打った1文字は弾ませる */
  private renderTyped(typed: string, newSentence: boolean): void {
    const el = this.root.querySelector<HTMLElement>('.typed')!
    if (newSentence || typed === '') {
      el.textContent = typed
      return
    }
    const last = document.createElement('span')
    last.className = 'typed-last'
    last.textContent = typed.slice(-1)
    el.replaceChildren(typed.slice(0, -1), last)
  }

  /** スコアの数字を更新し、増えたらぴょこっと弾ませる */
  private setStat(selector: string, value: number): void {
    const stat = this.root.querySelector<HTMLElement>(selector)!
    const b = stat.querySelector('b')!
    if (b.textContent === String(value)) return
    const bump = b.textContent !== ''
    b.textContent = String(value)
    if (bump) {
      stat.classList.remove('bump')
      void stat.offsetWidth
      stat.classList.add('bump')
    }
  }

  private onGameKey(e: KeyboardEvent): void {
    const game = this.game!
    e.preventDefault()
    if (e.code === 'Escape') {
      this.showTitle()
      return
    }
    const warning = this.root.querySelector<HTMLElement>('.warning')!
    if (isImeKey(e)) {
      this.showWarning()
      return
    }
    warning.hidden = true
    this.keyboard.setPressed(e.code, true)
    if (e.repeat) return

    const now = performance.now()
    const before = game.layout
    const completedBefore = game.completedSentences
    // 探していた時間（プレイ開始か前の打鍵から）
    const gap = now - Math.max(game.playStartAt, this.lastPressAt)
    const result = game.press(e.code, now)
    if (result === 'ignored') return
    this.lastPressAt = now
    this.keyboard.setHint(null)
    const hype = this.combo.add(result)

    if (result === 'correct') {
      this.onCorrect(e.code, hype, isFound(result, isChanged(before, e.code), gap))
    } else {
      this.sentenceMisses++
      this.keyboard.showMiss(e.code, result)
      this.sound.play(result)
      // 画面ごと揺らす（通常ミスは横揺れ、QWERTY 位置ミスはガクッと落ちる）
      const screen = this.root.querySelector<HTMLElement>('.game-screen')!
      screen.classList.remove('jolt', 'drop')
      void screen.offsetWidth
      screen.classList.add(result === 'miss' ? 'jolt' : 'drop')
      this.onComboBreak(hype)
    }
    const completed = game.completedSentences > completedBefore
    if (completed) {
      this.onSentenceClear(game.completedSentences)
      this.keyboard.animateSwap(before, game.layout, game.changed)
      this.sparkleSwap(game.changed)
      if (game.changed.length > 0) this.sound.play('swap')
    }
    this.renderSentence(completed)
    this.renderCombo()
  }

  // ---- 演出（スコアには影響しない） ----

  /** コンボ・フィーバーなどの演出の状態を最初に戻す */
  private resetHype(): void {
    this.combo = new ComboCounter()
    this.sentenceMisses = 0
    this.lastTick = 0
    clearTimeout(this.gradeTimer)
    document.body.classList.remove('fever', 'hurry')
    this.fx.clear()
  }

  /** 正解の打鍵：キーが光って火花と +1、コンボで音程が上がる。節目・フィーバー・発見の演出 */
  private onCorrect(code: string, hype: HypeEvent, found: boolean): void {
    const fever = this.combo.fever
    const tier = comboTier(hype.combo)
    const color = TIER_COLORS[tier]
    this.sound.play('correct', comboPitch(hype.combo))
    this.keyboard.showHit(code, fever)
    const key = this.keyboard.keyElement(code)
    if (key) {
      const { x, y } = Fx.center(key)
      this.fx.burst(x, y, {
        count: 8 + tier * 4,
        speed: 260 + tier * 60,
        shape: fever ? 'star' : 'spark',
        colors: fever ? PARTY_COLORS : [color, '#ffffff', '#ffd23f'],
        life: 0.5,
      })
      this.fx.ring(x, y, color, 30)
      this.fx.text(x, y - 24, '+1', 'pop-plus', color)
      if (found) {
        this.fx.text(x, y - 56, FOUND_WORDS[Math.floor(Math.random() * FOUND_WORDS.length)], 'pop-found')
        this.fx.burst(x, y, { count: 24, shape: 'star', speed: 420, size: 8, colors: ['#ffd23f', '#ffffff', '#ff4f9a'] })
        this.sound.play('found')
      }
    }
    // 大きな文字は問題文やキーボードを隠さないよう、キーボードの下の空きに出す
    const bigY = this.bigTextY()
    if (hype.feverStart) {
      document.body.classList.add('fever')
      this.fx.text(window.innerWidth / 2, bigY + 20, 'FEVER!!', 'pop-fever')
      this.fx.cannons(50)
      this.fx.flash('#ffd23f')
      this.sound.play('fever')
    }
    if (hype.milestone) {
      const y = bigY
      this.fx.text(window.innerWidth / 2, y, hype.milestone, 'pop-milestone', color)
      this.fx.text(window.innerWidth / 2, y + 56, `${hype.combo} COMBO`, 'pop-milestone-sub')
      this.fx.confettiRain(60 + tier * 20)
      this.sound.play('milestone')
    }
  }

  /** 大きな文字を出す高さ：キーボードの下。画面が低くて入らなければ画面の下の方 */
  private bigTextY(): number {
    const keyboard = this.keyboard.element.getBoundingClientRect()
    return Math.min(keyboard.bottom + 70, window.innerHeight - 90)
  }

  /** ミスでコンボが途切れたときの演出（フィーバーも終わる） */
  private onComboBreak(hype: HypeEvent): void {
    if (hype.feverEnd) document.body.classList.remove('fever')
    if (hype.broken < COMBO_BREAK_SHOW) return
    const comboEl = this.root.querySelector<HTMLElement>('.combo')
    if (comboEl) {
      const { x, y } = Fx.center(comboEl)
      this.fx.text(x, y, `${hype.broken} COMBO`, 'pop-break')
      this.fx.burst(x, y, { count: 16, shape: 'confetti', speed: 260, colors: ['#5b6c98', '#1c2a5e', '#b2c1dc'], life: 0.9 })
    }
    this.sound.play('combo-break')
  }

  /** 1文クリア：両側から紙吹雪とハンコ。ミスなしならパーフェクト */
  private onSentenceClear(count: number): void {
    const perfect = this.sentenceMisses === 0
    this.sentenceMisses = 0
    const sentence = this.root.querySelector<HTMLElement>('.sentence')!
    const { x, y } = Fx.center(sentence)
    const r = sentence.getBoundingClientRect()
    this.fx.burst(r.left, y, { count: 30, shape: 'confetti', speed: 650, angle: Math.PI, spread: 1.4, life: 1.2 })
    this.fx.burst(r.right, y, { count: 30, shape: 'confetti', speed: 650, angle: 0, spread: 1.4, life: 1.2 })
    this.fx.text(x, y, perfect ? 'PERFECT!!' : 'CLEAR!', perfect ? 'pop-perfect' : 'pop-clear')
    this.fx.text(x, r.bottom + 6, `${count}文目クリア`, 'pop-count')
    if (perfect) {
      this.fx.flash('#fff6c2')
      this.fx.confettiRain(70)
    }
    this.sound.play(perfect ? 'perfect' : 'complete')
  }

  /** 入れ替わるキーからきらきらを出す */
  private sparkleSwap(changed: readonly string[]): void {
    for (const code of changed) {
      const key = this.keyboard.keyElement(code)
      if (!key) continue
      const { x, y } = Fx.center(key)
      this.fx.burst(x, y, { count: 4, shape: 'star', speed: 140, size: 6, colors: ['#ffd23f', '#ffffff'], life: 0.6, gravity: 0 })
    }
  }

  /** コンボ数の表示（段階で色が変わり、増えるたびに弾む） */
  private renderCombo(): void {
    const el = this.root.querySelector<HTMLElement>('.combo')
    if (!el) return
    const combo = this.combo.combo
    el.hidden = combo < COMBO_SHOW
    if (el.hidden) return
    el.querySelector('b')!.textContent = String(combo)
    el.dataset.tier = String(comboTier(combo))
    el.classList.remove('bump')
    void el.offsetWidth
    el.classList.add('bump')
  }

  // ---- 結果 ----

  private showResult(now: number): void {
    const game = this.game!
    this.screen = 'result'
    this.resultShownAt = now
    this.keyboard.clearPressed()
    this.keyboard.setHint(null)
    clearTimeout(this.firstSwapTimer)
    const maxCombo = this.combo.maxCombo
    this.resetHype()
    this.sound.play('timeup')
    const { correct, miss, qwertyMiss } = game.score
    const difficulty = DIFFICULTIES[this.difficultyIndex]
    const kpmValue = kpm(correct, game.elapsedMs(now))
    const rows: [string, number][] = [
      ['正しく打てた打鍵数', correct],
      ['kpm', kpmValue],
      ['ミス数', miss],
      ['QWERTY の位置を打った回数', qwertyMiss],
      ['最大コンボ', maxCombo],
    ]
    const rankKpm = gradeKpm(correct, miss + qwertyMiss, game.elapsedMs(now))
    const gradeValue = grade(difficulty.id, rankKpm)
    const level = Math.max(METER_MIN_LEVEL, gradeMeterLevel(difficulty.id, rankKpm))
    const rank = rankOf(loadRanking(difficulty.id), game.score)
    this.draft = {
      entry: { id: newEntryId(), name: '', correct, miss, qwertyMiss, kpm: kpmValue, date: new Date().toISOString() },
      rank,
    }
    this.root.innerHTML = `
      <div class="screen result-screen">
        <h2 class="result-title">タイムアップ！</h2>
        <p class="result-difficulty difficulty-${difficulty.id}">${difficulty.name}</p>
        <div class="result-body">
          <dl class="result-score">
            ${rows.map(([label, value], i) => `<div class="result-row" style="--i:${i}"><dt>${label}</dt><dd data-value="${value}">0</dd></div>`).join('')}
          </dl>
          ${this.meterHtml(difficulty.id, gradeValue)}
        </div>
        ${rank === null ? `<p class="rank-out">ランク外… 次こそトップ${RANKING_SIZE}入りを目指そう！</p>` : ''}
        <div class="choices${rank === null ? '' : ' has-rank-bubble'}">
          <button class="choice choice-title"><kbd>Esc</kbd> タイトルへ</button>
          <button class="choice choice-retry"><kbd>Space</kbd> もう一度</button>
          <span class="choice-ranking-wrap">
            <button class="choice choice-ranking"><kbd>Enter</kbd> 🏆 ランキング</button>
            ${rank === null ? '' : `<span class="rank-bubble">🎉 ${rank}位に入れます！</span>`}
          </span>
        </div>
      </div>`
    this.root.querySelector('.choice-title')!.addEventListener('click', () => this.showTitle())
    this.root.querySelector('.choice-retry')!.addEventListener('click', () => this.startGame())
    this.root.querySelector('.choice-ranking')!.addEventListener('click', () => this.showDraftRanking())
    this.countUp()
    const run = ++this.meterRun
    this.gradeTimer = window.setTimeout(() => this.raiseMeter(run, level, rank), METER_DELAY_MS)
  }

  /** ランクの基準の目盛りがついたメーター（下から D・C・B・A・S・GOD）。ハンコはメーターの横に押す */
  private meterHtml(difficulty: Difficulty, gradeValue: string): string {
    const [god, s, a, b, c] = GRADE_KPM[difficulty]
    const lines = [c, b, a, s, god]
    return `
      <div class="meter" style="--bands:${GRADE_ORDER.length}">
        <div class="meter-labels">
          ${GRADE_ORDER.map((g, i) => `<span class="meter-letter g-${g}" style="--b:${i}">${g}</span>`).join('')}
        </div>
        <div class="meter-track">
          ${GRADE_ORDER.map((g, i) => `<span class="meter-band g-${g}" style="--b:${i}"></span>`).join('')}
          <div class="meter-fill"></div>
          ${lines.map((v, i) => `<span class="meter-line" style="--b:${i + 1}"><span>${v}</span></span>`).join('')}
          <div class="meter-needle"></div>
        </div>
        <div class="meter-unit">kpm</div>
        <div class="grade grade-${gradeValue}" hidden><span class="grade-label">RANK</span><span class="grade-letter">${gradeValue}</span></div>
      </div>`
  }

  /**
   * メーターを下からグググと上げる。ランクの境目ごとに少し溜めてから越え、
   * 自分の位置で止まったらハンコを押す
   */
  private raiseMeter(run: number, level: number, rank: number | null): void {
    const meter = this.root.querySelector<HTMLElement>('.meter')
    if (!meter) return
    const letters = [...meter.querySelectorAll<HTMLElement>('.meter-letter')]
    const lines = [...meter.querySelectorAll<HTMLElement>('.meter-line')]
    const setLevel = (pos: number): void => meter.style.setProperty('--level', String(pos))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const whole = Math.floor(level)
    // 最後の区間は、残りの長さに合わせた時間でゆっくり止める
    const lastMs = METER_BAND_MS * Math.max(0.6, (level - whole) * 1.6)
    const totalMs = whole * METER_BAND_MS + (level > whole ? lastMs : 0)
    const start = performance.now()
    let passed = 0
    let clicks = 0
    meter.classList.add('rising')
    const finish = (): void => {
      setLevel(level)
      meter.classList.remove('rising')
      meter.classList.add('stopped')
      const reached = Math.min(whole, GRADE_ORDER.length - 1)
      letters[reached]?.classList.add('reached')
      this.gradeTimer = window.setTimeout(() => this.stampGrade(rank), reduced ? 0 : METER_STAMP_MS)
    }
    if (reduced) {
      finish()
      return
    }
    const step = (): void => {
      if (this.screen !== 'result' || this.meterRun !== run) return
      const t = performance.now() - start
      if (t >= totalMs) {
        finish()
        return
      }
      let pos: number
      if (t < whole * METER_BAND_MS) {
        // 1区間ずつ、境目の手前で減速して溜め、越えたら加速する
        const band = Math.floor(t / METER_BAND_MS)
        const f = (t - band * METER_BAND_MS) / METER_BAND_MS
        pos = band + f * f * (3 - 2 * f)
      } else {
        const f = (t - whole * METER_BAND_MS) / lastMs
        pos = whole + (level - whole) * (1 - (1 - f) ** 3)
      }
      setLevel(pos)
      // 境目を越えたら、そのランクの文字を光らせてカンと鳴らす
      while (passed < lines.length && pos >= passed + 1) {
        lines[passed].classList.add('passed')
        letters[passed + 1]?.classList.add('lit')
        this.sound.play('meter-line', 1 + passed * 0.15)
        passed++
      }
      // 上がっている間はギギギと小さく鳴らす（だんだん音程が上がる）
      if (Math.floor(pos * 8) > clicks) {
        clicks = Math.floor(pos * 8)
        this.sound.play('meter', 1 + pos * 0.12)
      }
      requestAnimationFrame(step)
    }
    letters[0]?.classList.add('lit')
    requestAnimationFrame(step)
  }

  /** ランク評価のハンコを押す。GOD・S・A とランクインは紙吹雪で祝う（GOD はいちばん派手） */
  private stampGrade(rank: number | null): void {
    if (this.screen !== 'result') return
    const el = this.root.querySelector<HTMLElement>('.grade')!
    el.hidden = false
    const god = el.classList.contains('grade-GOD')
    const top = god || el.classList.contains('grade-S') || el.classList.contains('grade-A')
    this.sound.play(top ? 'grade-top' : 'grade')
    const screen = this.root.querySelector<HTMLElement>('.result-screen')!
    screen.classList.remove('grade-quake')
    void screen.offsetWidth
    screen.classList.add('grade-quake')
    const { x, y } = Fx.center(el)
    this.fx.ring(x, y, '#1c2a5e', 90)
    if (god) this.fx.ring(x, y, '#ffd23f', 160)
    this.fx.burst(x, y, { count: god ? 120 : top ? 60 : 20, shape: top ? 'star' : 'spark', speed: god ? 900 : top ? 700 : 350, size: 8 })
    if (top || rank !== null) {
      this.fx.cannons(god ? 120 : top ? 80 : 50)
      this.fx.confettiRain(god || rank === 1 ? 200 : 100)
    }
  }

  /** ランキングに登録して、通常のランキング画面に切り替える（自分の行を光らせる） */
  private register(rawName: string): void {
    const difficulty = DIFFICULTIES[this.difficultyIndex]
    if (!this.draft || this.draft.rank === null) return
    const entry = { ...this.draft.entry, name: normalizeName(rawName) }
    this.draft = null
    const { list } = addEntry(loadRanking(difficulty.id), entry)
    const saved = saveRanking(difficulty.id, list)
    this.sound.play('complete')
    this.showRanking(this.difficultyIndex, entry.id, saved ? undefined : list)
  }

  /** 結果の数字を 0 から数え上げる */
  private countUp(): void {
    const cells = [...this.root.querySelectorAll<HTMLElement>('.result-score dd')]
    const start = performance.now()
    const duration = 800
    let ticks = 0
    const step = (): void => {
      if (this.screen !== 'result') return
      const t = Math.min(1, (performance.now() - start) / duration)
      const eased = 1 - (1 - t) ** 3
      for (const cell of cells) cell.textContent = String(Math.round(Number(cell.dataset.value) * eased))
      // 数え上げ中はカタカタ音（0.05秒ごと。だんだん音程が上がる）
      if (t < 1 && Math.floor(t * 16) > ticks) {
        ticks = Math.floor(t * 16)
        this.sound.play('tick', 1 + t)
      }
      if (t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  private onResultKey(e: KeyboardEvent): void {
    if (performance.now() - this.resultShownAt < RESULT_LOCK_MS) return
    if (e.code === 'Escape') {
      this.showTitle()
    } else if (e.code === 'Space' && !e.repeat) {
      e.preventDefault()
      this.startGame()
    } else if (isEnterKey(e)) {
      e.preventDefault()
      this.showDraftRanking()
    }
  }

  // ---- ランキング ----

  /** 結果画面から、遊んだ難易度のランキングに自分の記録（未登録）を並べて表示する */
  private showDraftRanking(): void {
    if (!this.draft) return
    this.showRanking(this.difficultyIndex, null, undefined, true)
  }

  /**
   * ランキング画面を表示する。
   * @param highlightId 光らせる記録（登録した直後）
   * @param unsavedList 保存に失敗したときに表示するランキング
   * @param withDraft 未登録の自分の記録を並べて、登録できるようにする（結果画面から来たとき）
   */
  private showRanking(
    index: number,
    highlightId: string | null = null,
    unsavedList?: RankingEntry[],
    withDraft = false,
  ): void {
    this.screen = 'ranking'
    this.attract.disarm()
    clearInterval(this.titleTimer)
    clearTimeout(this.gradeTimer)
    if (highlightId) this.fx.confettiRain(120)
    if (!withDraft) this.draft = null
    this.naming = false
    this.rankingIndex = index
    this.highlightId = highlightId
    const draft = this.draft
    this.root.innerHTML = `
      <div class="screen ranking-screen">
        <h2 class="ranking-title">🏆 ランキング</h2>
        <div class="ranking-tabs">
          ${DIFFICULTIES.map((d, i) => `<button class="ranking-tab difficulty-${d.id}" data-index="${i}"${draft && i !== index ? ' disabled' : ''}>${d.name}</button>`).join('')}
        </div>
        <div class="ranking-body"></div>
        <p class="warning ranking-unsaved" hidden>ブラウザに保存できなかったので、この記録はページを閉じると消えます</p>
        ${draft === null ? this.rankingGuideHtml() : this.draftRegisterHtml(draft)}
      </div>`
    this.root.querySelectorAll<HTMLButtonElement>('.ranking-tab').forEach((button) => {
      button.addEventListener('click', () => {
        if (this.draft) return
        this.rankingIndex = Number(button.dataset.index)
        this.renderRanking()
        button.blur()
      })
    })
    if (draft && draft.rank !== null) this.bindNameInput()
    this.renderRanking(unsavedList)
  }

  /** 通常のランキング画面の操作案内 */
  private rankingGuideHtml(): string {
    return `<p class="guide">← → で難易度を切り替え　<kbd>Space</kbd> か <kbd>Enter</kbd> でこの難易度をプレイ　<kbd>Esc</kbd> でタイトルへ</p>`
  }

  /** 結果画面から来たときの、登録ボタン・ニックネーム入力欄・操作案内 */
  private draftRegisterHtml(draft: Draft): string {
    const register =
      draft.rank === null
        ? `<p class="rank-out">ランク外… トップ${RANKING_SIZE}に入ると登録できます</p>`
        : `<div class="register-buttons">
            <button class="register-button"><kbd>Enter</kbd> ランキングに登録する</button>
            <button class="decline-button"><kbd>Backspace</kbd> 登録しない</button>
          </div>
          <div class="register-input" hidden>
            <label>ニックネーム（${NAME_MAX}文字まで）<input class="name-input" type="text" autocomplete="off" spellcheck="false" placeholder="名無しさん" /></label>
            <p class="guide"><kbd>Enter</kbd> で登録　<kbd>Esc</kbd> でやめる</p>
          </div>`
    return `
      <div class="ranking-register">${register}</div>
      <p class="guide draft-guide"><kbd>Space</kbd> でもう一度　<kbd>Esc</kbd> でタイトルへ</p>`
  }

  /** 登録ボタンとニックネームの入力欄を動くようにする */
  private bindNameInput(): void {
    this.root.querySelector('.register-button')!.addEventListener('click', () => this.setNaming(true))
    this.root.querySelector('.decline-button')!.addEventListener('click', () => this.declineRegister())
    const input = this.root.querySelector<HTMLInputElement>('.name-input')!
    input.addEventListener('input', () => {
      // 上限を超えた分は切る（maxlength は絵文字などを2文字と数えるので使わない）
      const chars = [...input.value]
      if (chars.length > NAME_MAX) input.value = chars.slice(0, NAME_MAX).join('')
    })
    input.addEventListener('keydown', (e) => {
      // 入力欄のキーは画面全体のキー操作（Space でもう一度など）に渡さない
      e.stopPropagation()
      // 変換中の Enter・Esc は IME のためのものなので触らない
      if (e.isComposing) return
      if (e.key === 'Enter') {
        e.preventDefault()
        this.register(input.value)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.setNaming(false)
      }
    })
  }

  /** 登録せずに、自分の行を消した通常のランキング画面にする */
  private declineRegister(): void {
    this.showRanking(this.rankingIndex)
  }

  /** ニックネームの入力欄を開く・閉じる */
  private setNaming(on: boolean): void {
    this.naming = on
    this.root.querySelector<HTMLElement>('.register-buttons')!.hidden = on
    this.root.querySelector<HTMLElement>('.register-input')!.hidden = !on
    this.root.querySelector<HTMLElement>('.draft-guide')!.hidden = on
    const input = this.root.querySelector<HTMLInputElement>('.name-input')!
    if (on) input.focus()
    else input.blur()
  }

  private renderRanking(unsavedList?: RankingEntry[]): void {
    const difficulty = DIFFICULTIES[this.rankingIndex]
    this.root.querySelectorAll<HTMLButtonElement>('.ranking-tab').forEach((button, i) => {
      button.classList.toggle('selected', i === this.rankingIndex)
    })
    // 保存に失敗したときの注意書きは、その記録を表示している間だけ出す
    this.root.querySelector<HTMLElement>('.ranking-unsaved')!.hidden = !unsavedList
    const list = unsavedList ?? loadRanking(difficulty.id)
    const body = this.root.querySelector<HTMLElement>('.ranking-body')!
    // 未登録の自分の記録は、入る順位の位置に差し込む（押し出された記録は表示しない）。圏外なら表の最後に足す
    const rows: { entry: RankingEntry; mine: boolean }[] = list.map((entry) => ({ entry, mine: false }))
    const draft = this.draft
    if (draft) {
      const at = draft.rank === null ? rows.length : draft.rank - 1
      rows.splice(at, 0, { entry: draft.entry, mine: true })
      if (draft.rank !== null) rows.length = Math.min(rows.length, RANKING_SIZE)
    }
    if (rows.length === 0) {
      body.innerHTML = `<p class="ranking-empty">まだ記録がありません。最初の挑戦者になろう！</p>`
      return
    }
    body.innerHTML = `
      <table class="ranking-table">
        <thead>
          <tr><th>順位</th><th>名前</th><th>打鍵数</th><th>kpm</th><th>ミス</th><th>QWERTY</th><th>日付</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(({ entry: e, mine }, i) => {
              const out = mine && draft?.rank === null
              const name = mine ? `あなた<span class="draft-tag">未登録</span>` : escapeHtml(e.name)
              return `
            <tr class="${mine || e.id === this.highlightId ? 'mine' : ''}${out ? ' out' : ''}" style="--i:${i}">
              <td class="rank rank-${i + 1}">${out ? '圏外' : i + 1}</td>
              <td class="name">${name}</td>
              <td class="num">${e.correct}</td>
              <td class="num">${e.kpm}</td>
              <td class="num miss">${e.miss}</td>
              <td class="num qwerty">${e.qwertyMiss}</td>
              <td class="date">${formatDate(e.date)}</td>
            </tr>`
            })
            .join('')}
        </tbody>
      </table>`
  }

  private onRankingKey(e: KeyboardEvent): void {
    if (this.draft) {
      this.onDraftRankingKey(e)
      return
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const n = DIFFICULTIES.length
      this.rankingIndex = (this.rankingIndex + (e.code === 'ArrowLeft' ? n - 1 : 1)) % n
      this.renderRanking()
      e.preventDefault()
    } else if (e.code === 'Escape') {
      this.showTitle()
    } else if (isStartKey(e)) {
      e.preventDefault()
      this.difficultyIndex = this.rankingIndex
      this.startGame()
    }
  }

  /** 結果画面から来たランキング画面（未登録）のキー操作。難易度は切り替えない */
  private onDraftRankingKey(e: KeyboardEvent): void {
    // ニックネーム入力中のキーは入力欄で扱う
    if (this.naming) return
    if (e.code === 'Escape') {
      this.showTitle()
    } else if (e.code === 'Space' && !e.repeat) {
      e.preventDefault()
      this.startGame()
    } else if (isEnterKey(e) && this.draft?.rank !== null) {
      // この Enter が入力欄に入らないようにする
      e.preventDefault()
      this.setNaming(true)
    } else if (e.code === 'Backspace' && !e.repeat && this.draft?.rank !== null) {
      e.preventDefault()
      this.declineRegister()
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    // 宣伝動画が流れているときは、そのキーで止めるだけにする
    if (this.attract.handleKey(e)) return
    switch (this.screen) {
      case 'title':
        this.onTitleKey(e)
        break
      case 'game':
        this.onGameKey(e)
        break
      case 'result':
        this.onResultKey(e)
        break
      case 'ranking':
        this.onRankingKey(e)
        break
    }
  }
}
