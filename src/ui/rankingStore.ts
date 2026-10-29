// ランキングの保存（ブラウザの localStorage。難易度ごとに別のキー）

import { sanitizeEntries, type RankingEntry } from '../logic/ranking'
import type { Difficulty } from '../logic/shuffle'

const keyOf = (difficulty: Difficulty) => `random-type:ranking:${difficulty}`

/** 保存されているランキングを読む。読めない・壊れているときは空 */
export function loadRanking(difficulty: Difficulty): RankingEntry[] {
  try {
    const raw = localStorage.getItem(keyOf(difficulty))
    return raw ? sanitizeEntries(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

/** ランキングを保存する。保存できなかったら false */
export function saveRanking(difficulty: Difficulty, list: readonly RankingEntry[]): boolean {
  try {
    localStorage.setItem(keyOf(difficulty), JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** 記録ごとの一意な ID */
export function newEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
