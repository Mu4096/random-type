// 1プレイの進行（DOM 非依存。時刻は呼び出し側から渡す）

import { pressKey, type KeyResult } from './judge'
import { defaultLayout, type Layout } from './keys'
import { SentenceInput, createMainTable, type MainTable } from './romaji'
import { addResult, emptyScore, type Score } from './score'
import { shuffleLayout, type Difficulty, type Rng } from './shuffle'

export interface Sentence {
  /** 画面に出す文（漢字かな交じり） */
  text: string
  /** 読み（ひらがな・カタカナ・ー） */
  reading: string
}

export interface GameOptions {
  difficulty: Difficulty
  sentences: readonly Sentence[]
  rng?: Rng
  /** 制限時間 */
  timeLimitMs?: number
  /** 開始前のカウントダウン */
  countdownMs?: number
}

/**
 * - countdown: カウントダウン中（入力は受け付けない）
 * - playing: プレイ中
 * - finished: 時間切れ
 */
export type Phase = 'countdown' | 'playing' | 'finished'

export const TIME_LIMIT_MS = 90_000
export const COUNTDOWN_MS = 3_000

export class Game {
  readonly difficulty: Difficulty
  private readonly sentences: readonly Sentence[]
  private readonly rng: Rng
  private readonly timeLimitMs: number
  /** プレイ開始（カウントダウン終了）の時刻 */
  readonly playStartAt: number
  private readonly main: MainTable = createMainTable()
  /** 未出題の文の添字（出し切ったら補充する） */
  private queue: number[] = []

  phase: Phase = 'countdown'
  layout: Layout = defaultLayout()
  /** 直前の入れ替えで動いたキー */
  changed: string[] = []
  sentence!: Sentence
  input!: SentenceInput
  score: Score = emptyScore()
  /** 打ち終えた文の数 */
  completedSentences = 0

  /** now にゲームを開始する（カウントダウン開始） */
  constructor(options: GameOptions, now: number) {
    if (options.sentences.length === 0) throw new Error('問題文がない')
    this.difficulty = options.difficulty
    this.sentences = options.sentences
    this.rng = options.rng ?? Math.random
    this.timeLimitMs = options.timeLimitMs ?? TIME_LIMIT_MS
    this.playStartAt = now + (options.countdownMs ?? COUNTDOWN_MS)
    // 最初の文を表示するときにも入れ替える（カウントダウン中に行う）
    this.nextSentence()
  }

  /** 時刻を進めてフェーズを更新する */
  update(now: number): Phase {
    if (this.phase === 'countdown' && now >= this.playStartAt) this.phase = 'playing'
    if (this.phase === 'playing' && now >= this.playStartAt + this.timeLimitMs) this.phase = 'finished'
    return this.phase
  }

  /** カウントダウンの残り（ミリ秒） */
  countdownLeftMs(now: number): number {
    return Math.max(0, this.playStartAt - now)
  }

  /** 制限時間の残り（ミリ秒） */
  timeLeftMs(now: number): number {
    if (this.phase === 'countdown') return this.timeLimitMs
    return Math.max(0, this.playStartAt + this.timeLimitMs - now)
  }

  /** プレイの経過時間（ミリ秒）。kpm の計算に使う */
  elapsedMs(now: number): number {
    return Math.min(this.timeLimitMs, Math.max(0, now - this.playStartAt))
  }

  /** キーが押された。プレイ中以外は ignored */
  press(code: string, now: number): KeyResult {
    if (this.update(now) !== 'playing') return 'ignored'
    const result = pressKey(this.layout, code, this.input)
    this.score = addResult(this.score, result)
    if (this.input.isComplete) {
      this.completedSentences++
      this.nextSentence()
    }
    return result
  }

  /** 次の文に進み、キーを入れ替える */
  private nextSentence(): void {
    if (this.queue.length === 0) this.queue = this.shuffledIndexes()
    this.sentence = this.sentences[this.queue.shift()!]
    this.input = new SentenceInput(this.sentence.reading, this.main)
    const { layout, changed } = shuffleLayout(this.layout, this.difficulty, this.rng)
    this.layout = layout
    this.changed = changed
  }

  /** 文の出題順（ランダム、一巡するまで重複なし） */
  private shuffledIndexes(): number[] {
    const idx = [...this.sentences.keys()]
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    // 補充した直後に、直前と同じ文が続かないようにする
    if (idx.length > 1 && this.sentence && this.sentences[idx[0]] === this.sentence) {
      ;[idx[0], idx[1]] = [idx[1], idx[0]]
    }
    return idx
  }
}
