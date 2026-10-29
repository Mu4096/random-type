// 難易度ごとのキー入れ替え

import { SWAP_CODES, isChanged, type Layout } from './keys'

export type Difficulty = 'easy' | 'normal' | 'chaos'

/** 0 以上 1 未満の乱数を返す関数（テストで差し替えられるように引数で受け取る） */
export type Rng = () => number

export interface ShuffleResult {
  layout: Layout
  /** 入れ替わったキー（点滅させる対象）。入れ替えが起きなければ空 */
  changed: string[]
}

/** 1回あたりに入れ替えるキー数 */
const SWAP_COUNT = { easy: 3, normal: 5 } as const

/**
 * 難易度に従ってキーを入れ替えた新しい配列を返す。
 * 選ばれたキーはすべて、入れ替え前とは違う位置に動く。
 */
export function shuffleLayout(layout: Layout, difficulty: Difficulty, rng: Rng = Math.random): ShuffleResult {
  let candidates: string[]
  let count: number
  switch (difficulty) {
    case 'easy':
      // デフォルトから変更されていないキーだけが対象
      candidates = SWAP_CODES.filter((code) => !isChanged(layout, code))
      count = SWAP_COUNT.easy
      break
    case 'normal':
      candidates = [...SWAP_CODES]
      count = SWAP_COUNT.normal
      break
    case 'chaos':
      candidates = [...SWAP_CODES]
      count = SWAP_CODES.length
      break
  }

  const picked = pickRandom(candidates, Math.min(count, candidates.length), rng)
  // 2キー未満では入れ替えようがない（やさしいモードで全部入れ替わり済みのとき）
  if (picked.length < 2) {
    return { layout: { ...layout }, changed: [] }
  }

  const perm = derangement(picked.length, rng)
  const next: Record<string, string> = { ...layout }
  picked.forEach((code, i) => {
    next[code] = layout[picked[perm[i]]]
  })
  return { layout: next, changed: picked }
}

/** 配列から重複なしで n 個ランダムに選ぶ */
function pickRandom<T>(items: readonly T[], n: number, rng: Rng): T[] {
  const arr = [...items]
  shuffleInPlace(arr, rng)
  return arr.slice(0, n)
}

/** Fisher–Yates シャッフル */
function shuffleInPlace<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/**
 * 0..n-1 の完全順列（どの i も perm[i] !== i）を一様に返す。n >= 2。
 * 棄却法：ランダムな順列が完全順列になる確率は約 1/e なので数回で終わる。
 */
export function derangement(n: number, rng: Rng = Math.random): number[] {
  if (n < 2) throw new Error(`derangement: n は 2 以上が必要 (n=${n})`)
  const perm = [...Array(n).keys()]
  for (;;) {
    shuffleInPlace(perm, rng)
    if (perm.every((v, i) => v !== i)) return perm
  }
}
