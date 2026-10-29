import { describe, expect, it } from 'vitest'
import { SOKUON_DOUBLE, SentenceInput, createMainTable, toHiragana } from './romaji'

/** romaji を最後まで打てて、ちょうど打ち終わるか */
function canType(reading: string, romaji: string): boolean {
  const input = new SentenceInput(reading, createMainTable())
  for (const c of romaji) {
    if (!input.type(c)) return false
  }
  return input.isComplete
}

/** romaji を打ち、打てなかった時点で止める。打てた文字数を返す */
function typeAll(input: SentenceInput, romaji: string): number {
  let n = 0
  for (const c of romaji) {
    if (!input.type(c)) break
    n++
  }
  return n
}

describe('基本', () => {
  it.each([
    ['あいうえお', 'aiueo'],
    ['かきくけこ', 'kakikukeko'],
    ['がっこう', 'gakkou'],
    ['すし', 'susi'],
    ['すし', 'sushi'],
    ['ちず', 'tizu'],
    ['ちず', 'chizu'],
    ['つくえ', 'tsukue'],
    ['ふじ', 'fuji'],
    ['ふじ', 'huzi'],
    ['らーめん', 'ra-menn'],
    ['らーめん', 'ra-mexn'],
  ])('%s を %s で打てる', (reading, romaji) => {
    expect(canType(reading, romaji)).toBe(true)
  })

  it('カタカナはひらがなとして扱う', () => {
    expect(toHiragana('ラーメン')).toBe('らーめん')
    expect(toHiragana('ヴァイオリン')).toBe('ゔぁいおりん')
    expect(canType('ラーメン', 'ra-menn')).toBe(true)
  })

  it('間違った文字は受け付けず、状態も進まない', () => {
    const input = new SentenceInput('かき', createMainTable())
    expect(input.type('k')).toBe(true)
    expect(input.type('i')).toBe(false)
    expect(input.typedRomaji).toBe('k')
    expect(input.type('a')).toBe(true)
    expect(input.typedRomaji).toBe('ka')
  })

  it('打ち終えた後は何も受け付けない', () => {
    const input = new SentenceInput('か', createMainTable())
    typeAll(input, 'ka')
    expect(input.isComplete).toBe(true)
    expect(input.type('a')).toBe(false)
  })

  it('変換できない文字があるとエラー', () => {
    expect(() => new SentenceInput('かa', createMainTable())).toThrow()
    expect(() => new SentenceInput('か。', createMainTable())).toThrow()
  })
})

describe('ん', () => {
  it.each([
    ['かんじ', 'kanji', true],
    ['かんじ', 'kannji', true],
    ['かんじ', 'kaxnji', true],
    ['ほんや', 'honya', false], // n＋y は「にゃ」系になる
    ['ほんや', 'honnya', true],
    ['あんい', 'ani', false], // n＋母音は「な行」になる
    ['あんい', 'anni', true],
    ['あんな', 'anna', false], // n＋n は「ん」になる
    ['あんな', 'annna', true],
    ['ほん', 'hon', false], // 文末は nn が必要
    ['ほん', 'honn', true],
    ['ほんー', 'hon-', true],
  ])('%s を %s で打てる：%s', (reading, romaji, ok) => {
    expect(canType(reading, romaji)).toBe(ok)
  })
})

describe('っ', () => {
  it.each([
    ['きって', 'kitte'],
    ['きって', 'kixtute'],
    ['きって', 'kiltsute'],
    ['まっちゃ', 'maccha'],
    ['まっちゃ', 'mattya'],
    ['まっちゃ', 'maxtutya'],
    ['いっしょ', 'issho'],
    ['いっしょ', 'issyo'],
    ['あっ', 'axtu'],
    ['ざっし', 'zassi'],
  ])('%s を %s で打てる', (reading, romaji) => {
    expect(canType(reading, romaji)).toBe(true)
  })

  it.each([
    ['あっな', 'anna'], // n は重ねられない
    ['あっ', 'att'], // 文末の っ は重ねられない
  ])('%s を %s では打てない', (reading, romaji) => {
    expect(canType(reading, romaji)).toBe(false)
  })
})

describe('拗音', () => {
  it.each([
    ['しゃしん', 'syasinn'],
    ['しゃしん', 'shashinn'],
    ['しゃしん', 'sixyasinn'],
    ['しゃしん', 'shilyasinn'],
    ['ちょっと', 'chotto'],
    ['ちょっと', 'tyotto'],
    ['ちょっと', 'cyotto'],
    ['じゃま', 'jama'],
    ['じゃま', 'zyama'],
    ['じゃま', 'jyama'],
    ['ふぁん', 'fann'],
    ['ふぁん', 'fuxann'],
    ['てぃー', 'thi-'],
    ['うぃるす', 'wirusu'],
  ])('%s を %s で打てる', (reading, romaji) => {
    expect(canType(reading, romaji)).toBe(true)
  })

  it('shi は「し」なので「しぃ」にはならない', () => {
    const input = new SentenceInput('しぃ', createMainTable())
    expect(typeAll(input, 'shi')).toBe(3)
    expect(input.isComplete).toBe(false)
    expect(typeAll(input, 'xi')).toBe(2)
    expect(input.isComplete).toBe(true)
  })
})

describe('ヒントと残りのローマ字（メインの打ち方）', () => {
  it('初期値は短い方の打ち方', () => {
    const input = new SentenceInput('しゃしんをとった', createMainTable())
    expect(input.remainingRomaji()).toBe('syasinnwototta')
    expect(input.hint()).toBe('s')
  })

  it.each([
    ['ちず', 'tizu'],
    ['つふじ', 'tuhuzi'],
    ['ちゃいろ', 'tyairo'],
    ['きってー', 'kitte-'],
    ['あっあ', 'axtua'],
  ])('%s の残りは %s', (reading, romaji) => {
    expect(new SentenceInput(reading, createMainTable()).remainingRomaji()).toBe(romaji)
  })

  it('別の打ち方を打ち始めたら、その続きをヒントにする', () => {
    const input = new SentenceInput('しか', createMainTable())
    input.type('s')
    expect(input.hint()).toBe('i')
    input.type('h')
    expect(input.hint()).toBe('i')
    expect(input.remainingRomaji()).toBe('ika')
  })

  it('n 1文字の後は次の文字をヒントにする', () => {
    const input = new SentenceInput('かんじ', createMainTable())
    typeAll(input, 'kan')
    // nn の途中とも、n で確定した後とも取れる。メインの打ち方（nn）を優先
    expect(input.hint()).toBe('n')
    input.type('j')
    expect(input.hint()).toBe('i')
  })

  it('打ち終えたら null', () => {
    const input = new SentenceInput('か', createMainTable())
    typeAll(input, 'ka')
    expect(input.hint()).toBeNull()
    expect(input.remainingRomaji()).toBe('')
  })
})

describe('メインの打ち方の学習', () => {
  it('違う打ち方をすると、そのプレイの以降の文でメインの打ち方が変わる', () => {
    const main = createMainTable()
    const first = new SentenceInput('しちつ', main)
    typeAll(first, 'shichitsu')
    expect(first.isComplete).toBe(true)
    expect(main.get('し')).toBe('shi')
    expect(main.get('ち')).toBe('chi')
    expect(main.get('つ')).toBe('tsu')

    const second = new SentenceInput('すしをつくる', main)
    expect(second.remainingRomaji()).toBe('sushiwotsukuru')
  })

  it('別のプレイ（新しいテーブル）には影響しない', () => {
    const main = createMainTable()
    typeAll(new SentenceInput('し', main), 'shi')
    expect(createMainTable().get('し')).toBe('si')
  })

  it('拗音・っ・ん も学習する', () => {
    const main = createMainTable()
    typeAll(new SentenceInput('しゃしんをとった', main), 'shashinnwotoxtuta')
    expect(main.get('しゃ')).toBe('sha')
    expect(main.get('っ')).toBe('xtu')
    expect(new SentenceInput('きって', main).remainingRomaji()).toBe('kixtute')

    typeAll(new SentenceInput('きって', main), 'kitte')
    expect(main.get('っ')).toBe(SOKUON_DOUBLE)
  })

  it('n 1文字の「ん」を学習しても、n 1文字で打てない位置では nn をヒントにする', () => {
    const main = createMainTable()
    typeAll(new SentenceInput('かんじ', main), 'kanji')
    expect(main.get('ん')).toBe('n')
    expect(new SentenceInput('かんじ', main).remainingRomaji()).toBe('kanji')
    expect(new SentenceInput('ほんや', main).remainingRomaji()).toBe('honnya')
    expect(new SentenceInput('ほん', main).remainingRomaji()).toBe('honn')
  })

  it('解釈が確定するまでは学習しない', () => {
    const main = createMainTable()
    const input = new SentenceInput('かんじ', main)
    typeAll(input, 'kan')
    // nn の途中か n 確定か未確定
    expect(main.get('ん')).toBe('nn')
    input.type('n')
    expect(main.get('ん')).toBe('nn')
  })
})

describe('canAccept', () => {
  it('状態を変えずに、次に打てる文字か調べられる', () => {
    const input = new SentenceInput('し', createMainTable())
    expect(input.canAccept('s')).toBe(true)
    expect(input.canAccept('c')).toBe(true)
    expect(input.canAccept('t')).toBe(false)
    expect(input.typedRomaji).toBe('')
  })
})
