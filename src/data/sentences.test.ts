import { describe, expect, it } from 'vitest'
import { SentenceInput, createMainTable } from '../logic/romaji'
import { SENTENCES } from './sentences'

describe('問題文データ', () => {
  it('100文あり、同じ文がない', () => {
    expect(SENTENCES).toHaveLength(100)
    expect(new Set(SENTENCES.map((s) => s.text)).size).toBe(100)
  })

  it('句読点・？・！を含まない', () => {
    for (const s of SENTENCES) expect(s.text).not.toMatch(/[、。，．,.？！?!]/)
  })

  it.each(SENTENCES.map((s) => [s.text, s.reading]))('%s：読みがローマ字で最後まで打てる', (_text, reading) => {
    const input = new SentenceInput(reading, createMainTable())
    for (const c of input.remainingRomaji()) expect(input.type(c)).toBe(true)
    expect(input.isComplete).toBe(true)
  })
})
