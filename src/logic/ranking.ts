// 難易度別のローカルランキング（並び順・件数制限・ニックネームの整形）

import type { Score } from './score'

/** 難易度ごとに残す件数 */
export const RANKING_SIZE = 10
/** ニックネームの最大文字数（日本語も英字も1文字） */
export const NAME_MAX = 10
/** ニックネームが空欄のときの名前 */
export const DEFAULT_NAME = '名無しさん'

export interface RankingEntry extends Score {
  /** 登録ごとに一意な ID（登録直後に自分の行を光らせるのに使う） */
  id: string
  name: string
  kpm: number
  /** 登録日時（ISO 8601） */
  date: string
}

/**
 * 並び順：正しく打てた打鍵数（多い順）→ ミス数（少ない順）→ QWERTY 位置ミス数（少ない順）。
 * 3つとも同じなら 0（並べ替えで順番を保つので、先に登録した方が上に残る）
 */
export function compareScore(a: Score, b: Score): number {
  return b.correct - a.correct || a.miss - b.miss || a.qwertyMiss - b.qwertyMiss
}

/**
 * このスコアを登録したら何位になるか（1始まり）。圏外なら null。
 * 同点の既存の記録より下に入る。
 */
export function rankOf(list: readonly Score[], score: Score): number | null {
  const above = list.filter((e) => compareScore(e, score) <= 0).length
  const rank = above + 1
  return rank <= RANKING_SIZE ? rank : null
}

/** 記録を加えた新しいランキングを返す（並べ替え・件数制限済み）。圏外なら rank は null */
export function addEntry(
  list: readonly RankingEntry[],
  entry: RankingEntry,
): { list: RankingEntry[]; rank: number | null } {
  const rank = rankOf(list, entry)
  // Array.prototype.sort は安定ソートなので、同点なら先に登録した方が上に残る
  const next = [...list, entry].sort(compareScore).slice(0, RANKING_SIZE)
  return { list: next, rank }
}

/** 入力されたニックネームを整える：前後の空白を除き、最大文字数で切り、空なら既定の名前 */
export function normalizeName(input: string): string {
  const chars = [...input.trim()]
  const name = chars.slice(0, NAME_MAX).join('').trim()
  return name === '' ? DEFAULT_NAME : name
}

/** 保存データを読み込むとき、壊れた記録を取り除く */
export function sanitizeEntries(data: unknown): RankingEntry[] {
  if (!Array.isArray(data)) return []
  const valid = data.filter(
    (e): e is RankingEntry =>
      typeof e === 'object' &&
      e !== null &&
      typeof e.id === 'string' &&
      typeof e.name === 'string' &&
      typeof e.date === 'string' &&
      [e.correct, e.miss, e.qwertyMiss, e.kpm].every((n) => Number.isFinite(n)),
  )
  return valid.sort(compareScore).slice(0, RANKING_SIZE)
}
