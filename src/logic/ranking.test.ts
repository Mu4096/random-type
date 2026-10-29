import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NAME,
  RANKING_SIZE,
  addEntry,
  compareScore,
  normalizeName,
  rankOf,
  sanitizeEntries,
  type RankingEntry,
} from './ranking'

let seq = 0
function entry(correct: number, miss = 0, qwertyMiss = 0, name = `p${seq}`): RankingEntry {
  seq++
  return { id: `id${seq}`, name, correct, miss, qwertyMiss, kpm: correct, date: '2026-10-16T00:00:00.000Z' }
}

describe('compareScore', () => {
  it('打鍵数が多い方が上', () => {
    expect(compareScore(entry(100), entry(90))).toBeLessThan(0)
  })
  it('打鍵数が同じならミスが少ない方が上', () => {
    expect(compareScore(entry(100, 1), entry(100, 3))).toBeLessThan(0)
  })
  it('ミスも同じなら QWERTY 位置ミスが少ない方が上', () => {
    expect(compareScore(entry(100, 1, 0), entry(100, 1, 2))).toBeLessThan(0)
  })
  it('すべて同じなら 0', () => {
    expect(compareScore(entry(100, 1, 1), entry(100, 1, 1))).toBe(0)
  })
})

describe('rankOf / addEntry', () => {
  it('空のランキングなら1位', () => {
    expect(rankOf([], entry(10))).toBe(1)
  })

  it('並び順どおりの位置に入る', () => {
    let list: RankingEntry[] = []
    for (const e of [entry(50), entry(80), entry(80, 2), entry(80, 1), entry(30)]) list = addEntry(list, e).list
    expect(list.map((e) => [e.correct, e.miss])).toEqual([
      [80, 0],
      [80, 1],
      [80, 2],
      [50, 0],
      [30, 0],
    ])
  })

  it('同点なら先に登録した方が上', () => {
    const first = entry(70, 1, 1, 'first')
    const second = entry(70, 1, 1, 'second')
    let list = addEntry([], first).list
    const result = addEntry(list, second)
    list = result.list
    expect(result.rank).toBe(2)
    expect(list.map((e) => e.name)).toEqual(['first', 'second'])
  })

  it(`${RANKING_SIZE}件を超えたら下から消え、圏外は rank が null`, () => {
    let list: RankingEntry[] = []
    for (let i = 1; i <= RANKING_SIZE; i++) list = addEntry(list, entry(i * 10)).list
    expect(list).toHaveLength(RANKING_SIZE)

    // 最下位（10）より下は圏外
    expect(rankOf(list, entry(5))).toBeNull()
    // 最下位と同点も、先に登録した方が上なので圏外
    expect(rankOf(list, entry(10))).toBeNull()
    const out = addEntry(list, entry(5))
    expect(out.rank).toBeNull()
    expect(out.list).toEqual(list)

    // 途中に入ると最下位が押し出される
    const inserted = addEntry(list, entry(55))
    expect(inserted.rank).toBe(6)
    expect(inserted.list).toHaveLength(RANKING_SIZE)
    expect(inserted.list.at(-1)!.correct).toBe(20)
  })

  it('元のランキングを書き換えない', () => {
    const list = [entry(10)]
    addEntry(list, entry(20))
    expect(list).toHaveLength(1)
  })
})

describe('normalizeName', () => {
  it('前後の空白を除く', () => {
    expect(normalizeName('  たろう  ')).toBe('たろう')
  })
  it('10文字で切る（日本語も1文字）', () => {
    expect(normalizeName('あいうえおかきくけこさし')).toBe('あいうえおかきくけこ')
    expect(normalizeName('abcdefghijkl')).toBe('abcdefghij')
  })
  it('絵文字も1文字として数える', () => {
    expect(normalizeName('😀'.repeat(12))).toBe('😀'.repeat(10))
  })
  it('空欄なら既定の名前', () => {
    expect(normalizeName('')).toBe(DEFAULT_NAME)
    expect(normalizeName('   ')).toBe(DEFAULT_NAME)
  })
})

describe('sanitizeEntries', () => {
  it('配列でなければ空', () => {
    expect(sanitizeEntries(null)).toEqual([])
    expect(sanitizeEntries({})).toEqual([])
  })
  it('壊れた記録を除き、並べ直して件数を制限する', () => {
    const good = [entry(10), entry(30)]
    const data = [...good, { id: 'x', name: 'bad' }, 'oops', { ...entry(20), correct: 'NaN' }]
    expect(sanitizeEntries(data).map((e) => e.correct)).toEqual([30, 10])
  })
})
