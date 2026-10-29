import { describe, expect, it } from 'vitest'
import { QWERTY_CHAR, SWAP_CODES, defaultLayout, isChanged, type Layout } from './keys'
import { derangement, shuffleLayout, type Difficulty } from './shuffle'

const TRIALS = 300

/** 配列に入っている文字の集合が、入れ替え前後で変わっていないこと */
function expectSameChars(layout: Layout) {
  expect(Object.values(layout).sort()).toEqual(Object.values(QWERTY_CHAR).sort())
}

/** 変わったキー（入れ替え前と文字が違うキー） */
function diffCodes(before: Layout, after: Layout): string[] {
  return SWAP_CODES.filter((code) => before[code] !== after[code])
}

describe('keys', () => {
  it('入れ替え対象はアルファベット26キーと伸ばし棒', () => {
    expect(SWAP_CODES).toHaveLength(27)
    expect(QWERTY_CHAR.KeyA).toBe('a')
    expect(QWERTY_CHAR.Minus).toBe('-')
  })
})

describe('derangement', () => {
  it('どの位置も元の位置に残らない', () => {
    for (let n = 2; n <= 27; n++) {
      const perm = derangement(n)
      expect([...perm].sort((a, b) => a - b)).toEqual([...Array(n).keys()])
      perm.forEach((v, i) => expect(v).not.toBe(i))
    }
  })

  it('n < 2 はエラー', () => {
    expect(() => derangement(1)).toThrow()
  })
})

describe('shuffleLayout 共通', () => {
  const cases: [Difficulty, number][] = [
    ['easy', 3],
    ['normal', 5],
    ['chaos', 27],
  ]
  it.each(cases)('%s：選ばれた %i キーはすべて入れ替え前と違う文字になり、他は変わらない', (difficulty, count) => {
    let layout = defaultLayout()
    for (let t = 0; t < TRIALS; t++) {
      // やさしいモードは9回で固定されるので、適宜リセットする
      if (difficulty === 'easy' && t % 9 === 0) layout = defaultLayout()
      const { layout: next, changed } = shuffleLayout(layout, difficulty)
      expect(changed).toHaveLength(count)
      expect(diffCodes(layout, next).sort()).toEqual([...changed].sort())
      expectSameChars(next)
      layout = next
    }
  })

  it('元の配列を書き換えない', () => {
    const layout = defaultLayout()
    shuffleLayout(layout, 'chaos')
    expect(layout).toEqual(defaultLayout())
  })
})

describe('shuffleLayout やさしい', () => {
  it('デフォルトから変更されていないキーだけが入れ替わり、9回で全部入れ替わって固定される', () => {
    for (let t = 0; t < TRIALS / 10; t++) {
      let layout = defaultLayout()
      for (let round = 1; round <= 9; round++) {
        const { layout: next, changed } = shuffleLayout(layout, 'easy')
        changed.forEach((code) => expect(isChanged(layout, code)).toBe(false))
        // 一度入れ替わったキーは元に戻らない
        expect(SWAP_CODES.filter((c) => isChanged(next, c))).toHaveLength(round * 3)
        layout = next
      }
      const fixed = shuffleLayout(layout, 'easy')
      expect(fixed.changed).toEqual([])
      expect(fixed.layout).toEqual(layout)
    }
  })
})

describe('shuffleLayout ちょっぴり難しめ', () => {
  it('すでに入れ替わったキーも対象になり、全部入れ替わった後も続く', () => {
    let layout = defaultLayout()
    let pickedChanged = false
    for (let t = 0; t < TRIALS; t++) {
      const { layout: next, changed } = shuffleLayout(layout, 'normal')
      expect(changed).toHaveLength(5)
      if (changed.some((code) => isChanged(layout, code))) pickedChanged = true
      layout = next
    }
    expect(pickedChanged).toBe(true)
  })
})

describe('shuffleLayout 乱数の差し替え', () => {
  it('同じ乱数列なら同じ結果になる', () => {
    const seq = () => {
      let s = 1
      return () => {
        s = (s * 16807) % 2147483647
        return (s - 1) / 2147483646
      }
    }
    const a = shuffleLayout(defaultLayout(), 'normal', seq())
    const b = shuffleLayout(defaultLayout(), 'normal', seq())
    expect(a).toEqual(b)
  })
})
