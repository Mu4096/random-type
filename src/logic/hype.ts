// 演出のための判定（コンボ・フィーバー・節目・発見・ランク評価）
// スコアやランキングには影響しない。見た目と音のためだけに使う

import type { KeyResult } from './judge'
import type { Difficulty } from './shuffle'

/** このコンボ数に達したらフィーバー（ミスするまで続く） */
export const FEVER_COMBO = 15

/** コンボの節目と、そのとき出す言葉。最後の節目のあとは FEVER_STEP ごとに最後の言葉を出す */
export const COMBO_MILESTONES: readonly { combo: number; label: string }[] = [
  { combo: 10, label: 'NICE!' },
  { combo: 20, label: 'GREAT!' },
  { combo: 30, label: 'EXCELLENT!' },
  { combo: 40, label: 'AMAZING!!' },
  { combo: 50, label: 'FANTASTIC!!' },
  { combo: 75, label: 'UNSTOPPABLE!!' },
  { combo: 100, label: 'GODLIKE!!!' },
]
const MILESTONE_STEP = 50

/** コンボの段階（見た目の色を変える）。0〜4 */
export function comboTier(combo: number): number {
  if (combo >= 50) return 4
  if (combo >= 30) return 3
  if (combo >= FEVER_COMBO) return 2
  if (combo >= 5) return 1
  return 0
}

/** combo に達したときに出す節目の言葉（節目でなければ null） */
export function milestoneLabel(combo: number): string | null {
  const hit = COMBO_MILESTONES.find((m) => m.combo === combo)
  if (hit) return hit.label
  const last = COMBO_MILESTONES[COMBO_MILESTONES.length - 1]
  if (combo > last.combo && (combo - last.combo) % MILESTONE_STEP === 0) return last.label
  return null
}

export interface HypeEvent {
  /** この打鍵の後のコンボ数 */
  combo: number
  /** 節目に達したときの言葉 */
  milestone: string | null
  /** この打鍵でフィーバーに入った */
  feverStart: boolean
  /** この打鍵でフィーバーが終わった */
  feverEnd: boolean
  /** ミスで途切れたコンボ数（途切れていなければ 0） */
  broken: number
}

/** 1プレイ中のコンボを数える */
export class ComboCounter {
  combo = 0
  maxCombo = 0

  get fever(): boolean {
    return this.combo >= FEVER_COMBO
  }

  /** 判定結果を受け取ってコンボを進める */
  add(result: KeyResult): HypeEvent {
    const wasFever = this.fever
    if (result === 'ignored') {
      return { combo: this.combo, milestone: null, feverStart: false, feverEnd: false, broken: 0 }
    }
    if (result === 'correct') {
      this.combo++
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      return {
        combo: this.combo,
        milestone: milestoneLabel(this.combo),
        feverStart: !wasFever && this.fever,
        feverEnd: false,
        broken: 0,
      }
    }
    const broken = this.combo
    this.combo = 0
    return { combo: 0, milestone: null, feverStart: false, feverEnd: wasFever, broken }
  }
}

/** この時間以上迷ってから入れ替わったキーを正しく打てたら「見つけた」演出を出す */
export const FOUND_GAP_MS = 1200

/** 入れ替わったキーを、しばらく探してから見つけて打てたか */
export function isFound(result: KeyResult, keyChanged: boolean, gapMs: number): boolean {
  return result === 'correct' && keyChanged && gapMs >= FOUND_GAP_MS
}

export type Grade = 'GOD' | 'S' | 'A' | 'B' | 'C' | 'D'

/** ランク評価の kpm の基準（GOD・S・A・B・C の下限）。難しいモードほど低い */
export const GRADE_KPM: Readonly<Record<Difficulty, readonly [number, number, number, number, number]>> = {
  easy: [100, 80, 60, 40, 20],
  normal: [90, 60, 50, 30, 10],
  chaos: [70, 55, 40, 25, 10],
}

/** ミス1回（通常のミス・QWERTY 配列の位置のミス）で差し引く正しい打鍵数。5回のミスで1打鍵ぶん */
export const GRADE_MISS_PENALTY = 0.2

/**
 * ランク評価に使う kpm。正しい打鍵数からミスの分を少しだけ引いて計算する
 * （ふつうのミスならほとんど変わらず、ガチャガチャ押してミスが極端に多いと大きく下がる）
 */
export function gradeKpm(correct: number, misses: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  const effective = Math.max(0, correct - misses * GRADE_MISS_PENALTY)
  return Math.round((effective * 60000) / elapsedMs)
}

/** 結果画面のランク評価 */
export function grade(difficulty: Difficulty, kpm: number): Grade {
  const [god, s, a, b, c] = GRADE_KPM[difficulty]
  if (kpm >= god) return 'GOD'
  if (kpm >= s) return 'S'
  if (kpm >= a) return 'A'
  if (kpm >= b) return 'B'
  if (kpm >= c) return 'C'
  return 'D'
}

/** 結果画面のメーターに下から並べるランク */
export const GRADE_ORDER: readonly Grade[] = ['D', 'C', 'B', 'A', 'S', 'GOD']

/** メーターの GOD の区間の上端（GOD の下限の何倍か） */
export const GRADE_METER_TOP = 1.25

/**
 * 結果画面のメーターの高さ（0〜6。ランク1つぶんの区間を1とする）。
 * 区間はランクごとに同じ高さにし、区間の中は kpm に比例させる。整数部分が GRADE_ORDER の位置になる
 */
export function gradeMeterLevel(difficulty: Difficulty, kpm: number): number {
  const [god, s, a, b, c] = GRADE_KPM[difficulty]
  const edges = [0, c, b, a, s, god, god * GRADE_METER_TOP]
  for (let i = 0; i < GRADE_ORDER.length; i++) {
    if (kpm < edges[i + 1]) return i + Math.max(0, kpm - edges[i]) / (edges[i + 1] - edges[i])
  }
  return GRADE_ORDER.length
}
