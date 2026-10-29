// スコア集計

import type { KeyResult } from './judge'

export interface Score {
  /** 正しく打てた打鍵数 */
  correct: number
  /** 通常のミス数 */
  miss: number
  /** QWERTY 配列の位置を打ってしまった回数 */
  qwertyMiss: number
}

export function emptyScore(): Score {
  return { correct: 0, miss: 0, qwertyMiss: 0 }
}

/** 判定結果をスコアに加えた新しいスコアを返す */
export function addResult(score: Score, result: KeyResult): Score {
  switch (result) {
    case 'correct':
      return { ...score, correct: score.correct + 1 }
    case 'miss':
      return { ...score, miss: score.miss + 1 }
    case 'qwerty-miss':
      return { ...score, qwertyMiss: score.qwertyMiss + 1 }
    case 'ignored':
      return score
  }
}

/** kpm（1分あたりの正しい打鍵数）。小数点以下は四捨五入 */
export function kpm(correct: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  return Math.round((correct * 60000) / elapsedMs)
}
