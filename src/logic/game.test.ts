import { describe, expect, it } from 'vitest'
import { Game, type Sentence } from './game'
import { QWERTY_CHAR, SWAP_CODES, isChanged } from './keys'
import { addResult, emptyScore, kpm } from './score'

const SENTENCES: Sentence[] = [
  { text: '花', reading: 'はな' },
  { text: '空', reading: 'そら' },
  { text: '海', reading: 'うみ' },
]

/** 今の配列で文字 c を入力する物理キー */
function codeFor(game: Game, c: string): string {
  return SWAP_CODES.find((code) => game.layout[code] === c)!
}

/** 今の文を、残りのローマ字どおりに最後まで打つ */
function typeSentence(game: Game, now: number) {
  for (const c of game.input.remainingRomaji()) {
    expect(game.press(codeFor(game, c), now)).toBe('correct')
  }
}

describe('score', () => {
  it('判定結果を数える', () => {
    let s = emptyScore()
    for (const r of ['correct', 'correct', 'miss', 'qwerty-miss', 'ignored'] as const) s = addResult(s, r)
    expect(s).toEqual({ correct: 2, miss: 1, qwertyMiss: 1 })
  })

  it('kpm は1分あたりの正しい打鍵数', () => {
    expect(kpm(300, 90_000)).toBe(200)
    expect(kpm(1, 0)).toBe(0)
  })
})

describe('Game', () => {
  it('カウントダウン中に最初の入れ替えが済んでいて、入力は受け付けない', () => {
    const game = new Game({ difficulty: 'chaos', sentences: SENTENCES }, 0)
    expect(game.phase).toBe('countdown')
    expect(SWAP_CODES.every((code) => isChanged(game.layout, code))).toBe(true)
    expect(game.press(codeFor(game, 'h'), 1000)).toBe('ignored')
    expect(game.countdownLeftMs(1000)).toBe(2000)
    expect(game.timeLeftMs(1000)).toBe(90_000)
  })

  it('カウントダウン後にプレイが始まり、90秒で終わる', () => {
    const game = new Game({ difficulty: 'easy', sentences: SENTENCES }, 0)
    expect(game.update(3000)).toBe('playing')
    expect(game.timeLeftMs(33_000)).toBe(60_000)
    expect(game.update(92_999)).toBe('playing')
    expect(game.update(93_000)).toBe('finished')
    expect(game.press('KeyA', 93_000)).toBe('ignored')
    expect(game.elapsedMs(100_000)).toBe(90_000)
  })

  it('打った結果がスコアに入り、1文打ち終えると次の文に進んで入れ替えが起こる', () => {
    const game = new Game({ difficulty: 'easy', sentences: SENTENCES }, 0)
    const first = game.sentence
    const layoutBefore = game.layout
    // 通常ミス：今の文字も本来の QWERTY の文字も、次に打てる文字ではないキー
    const wrong = SWAP_CODES.find((code) => !game.input.canAccept(game.layout[code]) && !game.input.canAccept(QWERTY_CHAR[code]))!
    expect(game.press(wrong, 3000)).toBe('miss')
    const romajiLength = game.input.remainingRomaji().length
    typeSentence(game, 3000)
    expect(game.completedSentences).toBe(1)
    expect(game.sentence).not.toBe(first)
    expect(game.layout).not.toEqual(layoutBefore)
    expect(game.changed).toHaveLength(3)
    expect(game.score.miss).toBe(1)
    expect(game.score.correct).toBe(romajiLength)
  })

  it('入れ替え対象外のキーは無視', () => {
    const game = new Game({ difficulty: 'normal', sentences: SENTENCES }, 0)
    expect(game.press('Space', 3000)).toBe('ignored')
    expect(game.score).toEqual(emptyScore())
  })

  it('文は一巡するまで重複せず、一巡後も続けて出る', () => {
    const game = new Game({ difficulty: 'normal', sentences: SENTENCES }, 0)
    const seen = [game.sentence]
    for (let i = 0; i < 2; i++) {
      typeSentence(game, 3000)
      seen.push(game.sentence)
    }
    expect(new Set(seen).size).toBe(3)
    for (let i = 0; i < 10; i++) {
      const prev = game.sentence
      typeSentence(game, 3000)
      expect(game.sentence).not.toBe(prev)
    }
  })
})
