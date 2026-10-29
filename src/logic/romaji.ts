// ローマ字入力の判定
//
// 問題文の読み（ひらがな）を、入力できるローマ字の候補に分解しながら1打ずつ判定する。
// 「ん」の n 1文字確定や「っ」の子音重ね、拗音の分解入力（し＋ゃ など）に対応するため、
// 入力途中の解釈を複数（Hyp）同時に持ち、打鍵ごとに生き残ったものだけを残す。

/** 「っ」を子音重ねで打ったことを表す、メインの打ち方テーブル上の値 */
export const SOKUON_DOUBLE = '(double)'

// かな → ローマ字候補（先頭がメインの打ち方の初期値）
const TABLE_SRC = `
あ a|い i,yi|う u,wu,whu|え e|お o
か ka,ca|き ki|く ku,cu,qu|け ke|こ ko,co
さ sa|し si,shi,ci|す su|せ se,ce|そ so
た ta|ち ti,chi|つ tu,tsu|て te|と to
な na|に ni|ぬ nu|ね ne|の no
は ha|ひ hi|ふ hu,fu|へ he|ほ ho
ま ma|み mi|む mu|め me|も mo
や ya|ゆ yu|よ yo
ら ra|り ri|る ru|れ re|ろ ro
わ wa|を wo|ん nn,xn
が ga|ぎ gi|ぐ gu|げ ge|ご go
ざ za|じ zi,ji|ず zu|ぜ ze|ぞ zo
だ da|ぢ di|づ du|で de|ど do
ば ba|び bi|ぶ bu|べ be|ぼ bo
ぱ pa|ぴ pi|ぷ pu|ぺ pe|ぽ po
ゔ vu
ぁ xa,la|ぃ xi,li,xyi,lyi|ぅ xu,lu|ぇ xe,le,xye,lye|ぉ xo,lo
ゃ xya,lya|ゅ xyu,lyu|ょ xyo,lyo|ゎ xwa,lwa|ゕ xka,lka|ゖ xke,lke
っ xtu,ltu,xtsu,ltsu
ー -
ふぁ fa,fwa|ふぃ fi,fwi,fyi|ふぇ fe,fwe,fye|ふぉ fo,fwo|ふゃ fya|ふゅ fyu|ふょ fyo
てぃ thi|てゅ thu|てゃ tha|てぇ the|てょ tho
でぃ dhi|でゅ dhu|でゃ dha|でぇ dhe|でょ dho
とぅ twu|どぅ dwu
うぁ wha|うぃ wi,whi|うぇ we,whe|うぉ who|いぇ ye
ゔぁ va|ゔぃ vi|ゔぇ ve|ゔぉ vo|ゔゅ vyu
くぁ qa,kwa,qwa|くぃ qi,qwi|くぇ qe,qwe|くぉ qo,qwo|ぐぁ gwa
すぃ swi|つぁ tsa|つぃ tsi|つぇ tse|つぉ tso
`

// 拗音（き＋ゃ など）：子音部分の候補。母音は小書き文字から決まる
const YOON_SRC: [string, string[]][] = [
  ['き', ['ky']],
  ['し', ['sy', 'sh']],
  ['ち', ['ty', 'ch', 'cy']],
  ['に', ['ny']],
  ['ひ', ['hy']],
  ['み', ['my']],
  ['り', ['ry']],
  ['ぎ', ['gy']],
  ['じ', ['zy', 'j', 'jy']],
  ['ぢ', ['dy']],
  ['び', ['by']],
  ['ぴ', ['py']],
]
const SMALL_VOWELS: [string, string][] = [
  ['ゃ', 'a'],
  ['ぃ', 'i'],
  ['ゅ', 'u'],
  ['ぇ', 'e'],
  ['ょ', 'o'],
]

const TABLE: ReadonlyMap<string, readonly string[]> = buildTable()

function buildTable(): Map<string, string[]> {
  const table = new Map<string, string[]>()
  for (const entry of TABLE_SRC.split(/[|\n]/)) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const [kana, romaji] = trimmed.split(' ')
    table.set(kana, romaji.split(','))
  }
  for (const [base, prefixes] of YOON_SRC) {
    const baseOptions = table.get(base) ?? []
    for (const [small, vowel] of SMALL_VOWELS) {
      // shi・chi・ji は「し・ち・じ」1文字の打ち方なので、拗音の候補にしない
      const options = prefixes.map((p) => p + vowel).filter((r) => !baseOptions.includes(r))
      if (options.length > 0) table.set(base + small, options)
    }
  }
  return table
}

/** 「ん」を n 1文字で確定したとき、次の打鍵に使えない文字 */
const AFTER_SINGLE_N_FORBIDDEN = 'aiueoyn'
/** 子音重ねで「っ」を打てる文字 */
const DOUBLABLE = /^[bcdfghjklmpqrstvwxz]/

/** メインの打ち方テーブル（かな → ローマ字）。プレイごとに作り、プレイ中に学習で書き換わる */
export type MainTable = Map<string, string>

/** メインの打ち方テーブルの初期値を作る */
export function createMainTable(): MainTable {
  const main: MainTable = new Map()
  for (const [kana, options] of TABLE) main.set(kana, options[0])
  main.set('っ', SOKUON_DOUBLE)
  return main
}

/** カタカナをひらがなにする（ー はそのまま） */
export function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

/** 打ち終えたかな（学習の単位） */
interface Done {
  kana: string
  romaji: string
}

/** 1つの塊（かな1〜2文字＋子音重ねの「っ」）とその打ち方 */
interface Chunk {
  romaji: string
  /** 消費するかなの文字数 */
  len: number
  /** 学習に使う内訳 */
  parts: Done[]
  /** n 1文字で「ん」を確定した塊か */
  singleN?: boolean
}

/** 入力途中の解釈 */
interface Hyp {
  /** 次に打つ塊の先頭位置（かなの添字） */
  pos: number
  /** 塊の途中まで打ったローマ字 */
  buf: string
  /** 直前が n 1文字の「ん」なら、この塊の先頭に使えない文字 */
  forbid: string
  /** この文で打ち終えたかな */
  done: Done[]
}

/** 1文ぶんのローマ字入力の判定 */
export class SentenceInput {
  readonly kana: string
  private readonly main: MainTable
  private hyps: Hyp[]
  private typed = ''
  /** 学習済みの done の件数（解釈が1つに確定した分だけ学習する） */
  private learned = 0

  /**
   * @param reading 問題文の読み（ひらがな・カタカナ・ー）
   * @param main プレイ中のメインの打ち方テーブル（学習で書き換える）
   */
  constructor(reading: string, main: MainTable) {
    this.kana = toHiragana(reading)
    this.main = main
    for (const c of this.kana) {
      if (!TABLE.has(c)) throw new Error(`ローマ字に変換できない文字: ${c}（${reading}）`)
    }
    this.hyps = [{ pos: 0, buf: '', forbid: '', done: [] }]
  }

  /** 打ち終えたか */
  get isComplete(): boolean {
    return this.hyps.some((h) => h.pos === this.kana.length)
  }

  /** ここまでに正しく打ったローマ字 */
  get typedRomaji(): string {
    return this.typed
  }

  /** 次に c を打てるか（状態は変えない） */
  canAccept(c: string): boolean {
    return this.next(c).length > 0
  }

  /** c を打つ。正しければ状態を進めて true、間違いなら何もせず false */
  type(c: string): boolean {
    if (this.isComplete) return false
    const next = this.next(c)
    if (next.length === 0) return false
    this.hyps = next
    this.typed += c
    this.learn()
    return true
  }

  /** ヒントとして点滅させる文字（メインの打ち方で次に打つ1文字）。打ち終えていたら null */
  hint(): string | null {
    const best = this.bestPath()
    return best ? best.chunk.romaji[best.hyp.buf.length] : null
  }

  /** 残りのローマ字（メインの打ち方）。画面のローマ字表示用 */
  remainingRomaji(): string {
    const best = this.bestPath()
    if (!best) return ''
    let rest = best.chunk.romaji.slice(best.hyp.buf.length)
    let pos = best.hyp.pos + best.chunk.len
    let forbid = best.chunk.singleN ? AFTER_SINGLE_N_FORBIDDEN : ''
    while (pos < this.kana.length) {
      const chunk = this.mainChunk(pos, forbid)
      rest += chunk.romaji
      pos += chunk.len
      forbid = chunk.singleN ? AFTER_SINGLE_N_FORBIDDEN : ''
    }
    return rest
  }

  private next(c: string): Hyp[] {
    const result: Hyp[] = []
    for (const hyp of this.hyps) {
      if (hyp.pos === this.kana.length) continue
      const typed = hyp.buf + c
      for (const chunk of this.chunks(hyp.pos, hyp.forbid)) {
        if (!chunk.romaji.startsWith(typed)) continue
        if (chunk.romaji === typed) {
          result.push({
            pos: hyp.pos + chunk.len,
            buf: '',
            forbid: chunk.singleN ? AFTER_SINGLE_N_FORBIDDEN : '',
            done: [...hyp.done, ...chunk.parts],
          })
        } else if (!result.some((h) => h.pos === hyp.pos && h.buf === typed && h.forbid === hyp.forbid)) {
          result.push({ ...hyp, buf: typed })
        }
      }
    }
    return result
  }

  /** 解釈が1つに確定したら、そこまでの打ち方をメインの打ち方テーブルに反映する */
  private learn(): void {
    const decided = this.isComplete ? this.hyps.find((h) => h.pos === this.kana.length) : this.hyps.length === 1 ? this.hyps[0] : undefined
    if (!decided) return
    for (const d of decided.done.slice(this.learned)) this.main.set(d.kana, d.romaji)
    this.learned = decided.done.length
  }

  /** ヒント・残り表示に使う解釈と、その次の塊 */
  private bestPath(): { hyp: Hyp; chunk: Chunk } | null {
    const live = this.hyps.filter((h) => h.pos < this.kana.length)
    if (live.length === 0 || this.isComplete) return null
    // 優先順：メインの打ち方の途中 → 塊の先頭 → それ以外（打ち始めた別の打ち方を続ける）
    for (const hyp of live) {
      const m = this.mainChunk(hyp.pos, hyp.forbid)
      if (hyp.buf && m.romaji.length > hyp.buf.length && m.romaji.startsWith(hyp.buf)) return { hyp, chunk: m }
    }
    for (const hyp of live) {
      if (!hyp.buf) return { hyp, chunk: this.mainChunk(hyp.pos, hyp.forbid) }
    }
    for (const hyp of live) {
      const chunk = this.chunks(hyp.pos, hyp.forbid).find((ch) => ch.romaji.length > hyp.buf.length && ch.romaji.startsWith(hyp.buf))
      if (chunk) return { hyp, chunk }
    }
    return null
  }

  /** pos から始まる塊のうち、メインの打ち方のもの */
  private mainChunk(pos: number, forbid: string): Chunk {
    const options = this.chunks(pos, forbid)
    const kana2 = this.kana.slice(pos, pos + 2)
    const kana1 = this.kana[pos]
    const find = (kana: string, romaji: string | undefined) =>
      romaji === undefined ? undefined : options.find((ch) => ch.parts.length === 1 && ch.parts[0].kana === kana && ch.romaji === romaji)

    // 拗音など2文字の塊を優先する
    const chunk2 = kana2.length === 2 && TABLE.has(kana2) ? find(kana2, this.main.get(kana2)) ?? find(kana2, TABLE.get(kana2)?.[0]) : undefined
    if (chunk2) return chunk2

    if (kana1 === 'っ' && this.main.get('っ') === SOKUON_DOUBLE) {
      const next = this.mainChunk(pos + 1, '')
      const doubled = options.find((ch) => ch.parts[0].romaji === SOKUON_DOUBLE && ch.romaji === next.romaji[0] + next.romaji)
      if (doubled) return doubled
    }
    const fallback = kana1 === 'っ' ? 'xtu' : TABLE.get(kana1)?.[0]
    return find(kana1, this.main.get(kana1)) ?? find(kana1, fallback) ?? options[0]
  }

  /** pos から始まる塊の候補（forbid で始まるものは除く） */
  private chunks(pos: number, forbid: string): Chunk[] {
    const all = this.allChunks(pos)
    return forbid ? all.filter((ch) => !forbid.includes(ch.romaji[0])) : all
  }

  private allChunks(pos: number): Chunk[] {
    const kana = this.kana
    if (pos >= kana.length) return []
    const result: Chunk[] = []
    const add = (k: string) => {
      for (const romaji of TABLE.get(k) ?? []) result.push({ romaji, len: k.length, parts: [{ kana: k, romaji }] })
    }
    if (pos + 1 < kana.length) add(kana.slice(pos, pos + 2))
    add(kana[pos])

    if (kana[pos] === 'ん' && pos + 1 < kana.length) {
      // 次の打鍵が母音・y・n 以外になれるときだけ n 1文字で確定できる
      const canSingle = this.allChunks(pos + 1).some((ch) => !AFTER_SINGLE_N_FORBIDDEN.includes(ch.romaji[0]))
      if (canSingle) result.push({ romaji: 'n', len: 1, parts: [{ kana: 'ん', romaji: 'n' }], singleN: true })
    }
    if (kana[pos] === 'っ') {
      // 次の塊の先頭の子音を重ねる
      for (const ch of this.allChunks(pos + 1)) {
        if (!DOUBLABLE.test(ch.romaji)) continue
        result.push({
          romaji: ch.romaji[0] + ch.romaji,
          len: ch.len + 1,
          parts: [{ kana: 'っ', romaji: SOKUON_DOUBLE }, ...ch.parts],
        })
      }
    }
    return result
  }
}
