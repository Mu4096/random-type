import { describe, expect, it } from 'vitest'
import { pressKey, judgeKey } from './judge'
import { defaultLayout, type Layout } from './keys'
import { SentenceInput, createMainTable } from './romaji'

/** デフォルト配列から、指定したキー同士の文字を入れ替えた配列 */
function swapped(...pairs: [string, string][]): Layout {
  const layout: Record<string, string> = { ...defaultLayout() }
  for (const [a, b] of pairs) {
    ;[layout[a], layout[b]] = [layout[b], layout[a]]
  }
  return layout
}

const sentence = (reading: string) => new SentenceInput(reading, createMainTable())

describe('judgeKey', () => {
  it('今の配列で正しい文字のキーなら正解', () => {
    // K と Z を入れ替え：Z の位置で k が入力される
    const layout = swapped(['KeyK', 'KeyZ'])
    expect(judgeKey(layout, 'KeyZ', sentence('か'))).toBe('correct')
  })

  it('入れ替わった後に本来の QWERTY の位置を打つと QWERTY 位置ミス', () => {
    const layout = swapped(['KeyK', 'KeyZ'])
    expect(judgeKey(layout, 'KeyK', sentence('か'))).toBe('qwerty-miss')
  })

  it('どちらでもなければ通常のミス', () => {
    const layout = swapped(['KeyK', 'KeyZ'])
    expect(judgeKey(layout, 'KeyA', sentence('か'))).toBe('miss')
  })

  it('まだ入れ替わっていないキーは正解', () => {
    expect(judgeKey(swapped(['KeyQ', 'KeyZ']), 'KeyK', sentence('か'))).toBe('correct')
  })

  it('複数回の入れ替えで元の位置に戻ったキーは正解', () => {
    const once = swapped(['KeyK', 'KeyZ'])
    const back: Layout = { ...once, KeyK: once.KeyZ, KeyZ: once.KeyK }
    expect(judgeKey(back, 'KeyK', sentence('か'))).toBe('correct')
  })

  it('ローマ字の候補のどれかで次に打てる文字なら QWERTY 位置ミス（し = si / shi / ci）', () => {
    // C と V を入れ替え：C の位置を押すと v が入力されるが、本来の c は ci の c
    const layout = swapped(['KeyC', 'KeyV'])
    expect(judgeKey(layout, 'KeyC', sentence('し'))).toBe('qwerty-miss')
  })

  it('伸ばし棒も入れ替え対象', () => {
    const layout = swapped(['Minus', 'KeyP'])
    expect(judgeKey(layout, 'KeyP', sentence('ー'))).toBe('correct')
    expect(judgeKey(layout, 'Minus', sentence('ー'))).toBe('qwerty-miss')
  })

  it.each(['Space', 'ShiftLeft', 'Digit1', 'Comma', 'Semicolon'])('入れ替え対象外のキー %s は無視', (code) => {
    expect(judgeKey(defaultLayout(), code, sentence('か'))).toBe('ignored')
  })

  it('打ち終えた後は無視', () => {
    const input = sentence('か')
    pressKey(defaultLayout(), 'KeyK', input)
    pressKey(defaultLayout(), 'KeyA', input)
    expect(judgeKey(defaultLayout(), 'KeyK', input)).toBe('ignored')
  })
})

describe('pressKey', () => {
  it('正解のときだけ入力が進む', () => {
    const layout = swapped(['KeyK', 'KeyZ'])
    const input = sentence('か')
    expect(pressKey(layout, 'KeyK', input)).toBe('qwerty-miss')
    expect(input.typedRomaji).toBe('')
    expect(pressKey(layout, 'KeyZ', input)).toBe('correct')
    expect(input.typedRomaji).toBe('k')
    expect(pressKey(layout, 'KeyA', input)).toBe('correct')
    expect(input.isComplete).toBe(true)
  })
})
