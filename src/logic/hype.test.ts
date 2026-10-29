import { describe, expect, it } from 'vitest'
import { ComboCounter, FEVER_COMBO, GRADE_ORDER, comboTier, grade, gradeKpm, gradeMeterLevel, isFound, milestoneLabel } from './hype'

describe('ComboCounter', () => {
  it('正解で増え、ミスで 0 に戻る。途切れた数を返す', () => {
    const c = new ComboCounter()
    c.add('correct')
    c.add('correct')
    expect(c.combo).toBe(2)
    const e = c.add('miss')
    expect(e.broken).toBe(2)
    expect(c.combo).toBe(0)
    expect(c.maxCombo).toBe(2)
  })

  it('QWERTY 位置ミスでも途切れる', () => {
    const c = new ComboCounter()
    c.add('correct')
    expect(c.add('qwerty-miss').broken).toBe(1)
    expect(c.combo).toBe(0)
  })

  it('無視された打鍵では変わらない', () => {
    const c = new ComboCounter()
    c.add('correct')
    const e = c.add('ignored')
    expect(e.combo).toBe(1)
    expect(e.broken).toBe(0)
  })

  it('FEVER_COMBO に達した打鍵でフィーバー開始、ミスで終了', () => {
    const c = new ComboCounter()
    for (let i = 1; i < FEVER_COMBO; i++) expect(c.add('correct').feverStart).toBe(false)
    expect(c.add('correct').feverStart).toBe(true)
    expect(c.fever).toBe(true)
    expect(c.add('correct').feverStart).toBe(false)
    expect(c.add('miss').feverEnd).toBe(true)
    expect(c.fever).toBe(false)
  })

  it('フィーバー前のミスでは feverEnd にならない', () => {
    const c = new ComboCounter()
    c.add('correct')
    expect(c.add('miss').feverEnd).toBe(false)
  })

  it('最大コンボを覚えている', () => {
    const c = new ComboCounter()
    for (let i = 0; i < 7; i++) c.add('correct')
    c.add('miss')
    for (let i = 0; i < 3; i++) c.add('correct')
    expect(c.maxCombo).toBe(7)
  })

  it('節目の打鍵で言葉を返す', () => {
    const c = new ComboCounter()
    const labels: (string | null)[] = []
    for (let i = 0; i < 20; i++) labels.push(c.add('correct').milestone)
    expect(labels[9]).toBe('NICE!')
    expect(labels[19]).toBe('GREAT!')
    expect(labels.filter((l) => l !== null)).toHaveLength(2)
  })
})

describe('milestoneLabel', () => {
  it('節目以外は null', () => {
    expect(milestoneLabel(1)).toBeNull()
    expect(milestoneLabel(11)).toBeNull()
    expect(milestoneLabel(120)).toBeNull()
  })

  it('最後の節目のあとは50ごとに最後の言葉', () => {
    expect(milestoneLabel(100)).toBe('GODLIKE!!!')
    expect(milestoneLabel(150)).toBe('GODLIKE!!!')
    expect(milestoneLabel(200)).toBe('GODLIKE!!!')
  })
})

describe('comboTier', () => {
  it('コンボが増えるほど段階が上がる', () => {
    expect(comboTier(0)).toBe(0)
    expect(comboTier(4)).toBe(0)
    expect(comboTier(5)).toBe(1)
    expect(comboTier(FEVER_COMBO)).toBe(2)
    expect(comboTier(30)).toBe(3)
    expect(comboTier(50)).toBe(4)
    expect(comboTier(500)).toBe(4)
  })
})

describe('isFound', () => {
  it('入れ替わったキーを、しばらく迷ってから正しく打てたときだけ', () => {
    expect(isFound('correct', true, 1500)).toBe(true)
    expect(isFound('correct', true, 500)).toBe(false)
    expect(isFound('correct', false, 1500)).toBe(false)
    expect(isFound('miss', true, 1500)).toBe(false)
  })
})

describe('grade', () => {
  it('kpm の基準でランクが決まる', () => {
    expect(grade('easy', 100)).toBe('GOD')
    expect(grade('easy', 99)).toBe('S')
    expect(grade('easy', 80)).toBe('S')
    expect(grade('easy', 79)).toBe('A')
    expect(grade('easy', 60)).toBe('A')
    expect(grade('easy', 59)).toBe('B')
    expect(grade('easy', 40)).toBe('B')
    expect(grade('easy', 20)).toBe('C')
    expect(grade('easy', 19)).toBe('D')
  })

  it('難易度ごとの GOD の基準', () => {
    expect(grade('normal', 90)).toBe('GOD')
    expect(grade('normal', 89)).toBe('S')
    expect(grade('chaos', 70)).toBe('GOD')
    expect(grade('chaos', 69)).toBe('S')
  })

  it('難しいモードほど同じ kpm でも高いランクになる', () => {
    expect(grade('easy', 56)).toBe('B')
    expect(grade('normal', 56)).toBe('A')
    expect(grade('chaos', 56)).toBe('S')
  })
})

describe('gradeKpm', () => {
  it('ミスがなければ kpm と同じ', () => {
    expect(gradeKpm(105, 0, 90000)).toBe(70)
  })

  it('ふつうのミスの数ならほんの少しだけ下がる', () => {
    // 90秒で105打鍵・ミス30回：70 → 66
    expect(gradeKpm(105, 30, 90000)).toBe(66)
  })

  it('ガチャガチャ押してミスが極端に多いと大きく下がる', () => {
    // 90秒で200打鍵（kpm 133）でもミスが1000回なら0
    expect(gradeKpm(200, 1000, 90000)).toBe(0)
    expect(grade('easy', gradeKpm(200, 1000, 90000))).toBe('D')
  })

  it('時間が0なら0', () => {
    expect(gradeKpm(10, 0, 0)).toBe(0)
  })
})

describe('gradeMeterLevel', () => {
  it('ランクの基準の kpm でちょうど区間の境目になる', () => {
    expect(gradeMeterLevel('easy', 0)).toBe(0)
    expect(gradeMeterLevel('easy', 20)).toBe(1)
    expect(gradeMeterLevel('easy', 30)).toBe(1.5)
    expect(gradeMeterLevel('easy', 100)).toBe(5)
    expect(gradeMeterLevel('easy', 125)).toBe(6)
    expect(gradeMeterLevel('easy', 999)).toBe(6)
  })

  it('整数部分がランクの位置と一致する', () => {
    for (const d of ['easy', 'normal', 'chaos'] as const) {
      for (let kpm = 0; kpm <= 150; kpm++) {
        const level = Math.min(Math.floor(gradeMeterLevel(d, kpm)), GRADE_ORDER.length - 1)
        expect(GRADE_ORDER[level]).toBe(grade(d, kpm))
      }
    }
  })
})
