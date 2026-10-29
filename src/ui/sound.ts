// 効果音（Web Audio で合成。素材ファイルは使わない）

export type SoundName =
  | 'correct'
  | 'miss'
  | 'qwerty-miss'
  | 'complete'
  | 'perfect'
  | 'swap'
  | 'count'
  | 'start'
  | 'timeup'
  | 'found'
  | 'milestone'
  | 'fever'
  | 'combo-break'
  | 'tick'
  | 'meter'
  | 'meter-line'
  | 'grade'
  | 'grade-top'

const MUTE_KEY = 'random-type:muted'

/** 1音ぶんの指定 */
interface Tone {
  type: OscillatorType
  /** 開始・終了の周波数（Hz）。違えばその間を滑らかに変化させる */
  from: number
  to?: number
  /** 鳴り始め（秒、相対） */
  at?: number
  /** 長さ（秒） */
  dur: number
  /** 音量（0〜1） */
  vol: number
}

const SOUNDS: Record<SoundName, Tone[]> = {
  // 軽いポンという音。コンボに合わせて音程を上げる（play の pitch）
  correct: [
    { type: 'triangle', from: 880, to: 860, dur: 0.07, vol: 0.14 },
    { type: 'sine', from: 1760, dur: 0.04, vol: 0.05 },
  ],
  // ブブッという低いブザー
  miss: [
    { type: 'sawtooth', from: 180, to: 140, dur: 0.09, vol: 0.18 },
    { type: 'sawtooth', from: 180, to: 120, at: 0.1, dur: 0.12, vol: 0.18 },
  ],
  // ガクッと落ちる音（通常ミスとは別）
  'qwerty-miss': [
    { type: 'square', from: 700, to: 90, dur: 0.32, vol: 0.12 },
    { type: 'sine', from: 120, to: 60, at: 0.05, dur: 0.3, vol: 0.3 },
  ],
  // 1文完了：上がっていくチャイム
  complete: [
    { type: 'triangle', from: 1047, dur: 0.1, vol: 0.2 },
    { type: 'triangle', from: 1319, at: 0.08, dur: 0.1, vol: 0.2 },
    { type: 'triangle', from: 1568, at: 0.16, dur: 0.18, vol: 0.2 },
  ],
  // パーフェクト（ミスなしで1文完了）：きらきら駆け上がる
  perfect: [
    { type: 'triangle', from: 1047, dur: 0.08, vol: 0.2 },
    { type: 'triangle', from: 1319, at: 0.06, dur: 0.08, vol: 0.2 },
    { type: 'triangle', from: 1568, at: 0.12, dur: 0.08, vol: 0.2 },
    { type: 'triangle', from: 2093, at: 0.18, dur: 0.25, vol: 0.22 },
    { type: 'sine', from: 3136, at: 0.24, dur: 0.3, vol: 0.06 },
  ],
  // 入れ替え：くるくる回るような音
  swap: [
    { type: 'sine', from: 500, to: 1500, at: 0.2, dur: 0.12, vol: 0.12 },
    { type: 'sine', from: 1500, to: 500, at: 0.32, dur: 0.12, vol: 0.12 },
    { type: 'sine', from: 500, to: 1500, at: 0.44, dur: 0.12, vol: 0.12 },
  ],
  count: [{ type: 'square', from: 660, dur: 0.12, vol: 0.1 }],
  start: [{ type: 'square', from: 1320, dur: 0.35, vol: 0.1 }],
  // タイムアップ：下がっていく3音
  timeup: [
    { type: 'square', from: 1047, dur: 0.15, vol: 0.1 },
    { type: 'square', from: 784, at: 0.15, dur: 0.15, vol: 0.1 },
    { type: 'square', from: 523, at: 0.3, dur: 0.4, vol: 0.1 },
  ],
  // 見つけた：ピロリン
  found: [
    { type: 'sine', from: 1568, dur: 0.07, vol: 0.16 },
    { type: 'sine', from: 2349, at: 0.06, dur: 0.16, vol: 0.16 },
  ],
  // コンボの節目：ファンファーレ
  milestone: [
    { type: 'square', from: 523, dur: 0.08, vol: 0.08 },
    { type: 'square', from: 659, at: 0.08, dur: 0.08, vol: 0.08 },
    { type: 'square', from: 784, at: 0.16, dur: 0.08, vol: 0.08 },
    { type: 'square', from: 1047, at: 0.24, dur: 0.3, vol: 0.09 },
    { type: 'triangle', from: 1319, at: 0.24, dur: 0.3, vol: 0.12 },
  ],
  // フィーバー突入：ギュイーンと上がって和音
  fever: [
    { type: 'sawtooth', from: 200, to: 1600, dur: 0.35, vol: 0.07 },
    { type: 'square', from: 1047, at: 0.35, dur: 0.35, vol: 0.06 },
    { type: 'square', from: 1319, at: 0.35, dur: 0.35, vol: 0.06 },
    { type: 'square', from: 1568, at: 0.35, dur: 0.35, vol: 0.06 },
  ],
  // コンボが途切れた：ヒュ〜ンと落ちる
  'combo-break': [{ type: 'triangle', from: 900, to: 200, at: 0.08, dur: 0.4, vol: 0.14 }],
  // 残り10秒の秒読み
  tick: [{ type: 'square', from: 1760, dur: 0.03, vol: 0.06 }],
  // ランクのメーターが上がる：ギギギと小さく刻む
  meter: [{ type: 'square', from: 220, to: 180, dur: 0.035, vol: 0.06 }],
  // メーターがランクの境目を越えた：カン
  'meter-line': [
    { type: 'triangle', from: 1175, dur: 0.08, vol: 0.16 },
    { type: 'sine', from: 2350, dur: 0.05, vol: 0.05 },
  ],
  // ランク評価のハンコ：ドン
  grade: [
    { type: 'sine', from: 160, to: 50, dur: 0.3, vol: 0.4 },
    { type: 'square', from: 523, at: 0.05, dur: 0.15, vol: 0.06 },
  ],
  // S・A ランクのハンコ：ドン＋ファンファーレ
  'grade-top': [
    { type: 'sine', from: 160, to: 50, dur: 0.3, vol: 0.4 },
    { type: 'square', from: 784, at: 0.1, dur: 0.1, vol: 0.08 },
    { type: 'square', from: 784, at: 0.22, dur: 0.1, vol: 0.08 },
    { type: 'square', from: 784, at: 0.34, dur: 0.1, vol: 0.08 },
    { type: 'square', from: 1047, at: 0.46, dur: 0.5, vol: 0.09 },
    { type: 'triangle', from: 1319, at: 0.46, dur: 0.5, vol: 0.12 },
    { type: 'triangle', from: 1568, at: 0.46, dur: 0.5, vol: 0.1 },
  ],
}

/** コンボ数 → 正解音の音程（半音）。ペンタトニックで駆け上がり、上限で止まる */
const COMBO_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19]

/** コンボ数に合わせた正解音の音程の倍率 */
export function comboPitch(combo: number): number {
  const step = COMBO_STEPS[Math.min(Math.max(combo - 1, 0), COMBO_STEPS.length - 1)]
  return 2 ** (step / 12)
}

export class Sound {
  private ctx: AudioContext | null = null
  private mutedValue: boolean

  constructor() {
    this.mutedValue = readMuted()
  }

  get muted(): boolean {
    return this.mutedValue
  }

  set muted(value: boolean) {
    this.mutedValue = value
    try {
      localStorage.setItem(MUTE_KEY, value ? '1' : '0')
    } catch {
      // 保存できなくても、このページの間はミュートが効く
    }
  }

  /** 鳴らす。pitch は音程の倍率（2 で1オクターブ上） */
  play(name: SoundName, pitch = 1): void {
    if (this.mutedValue) return
    const ctx = this.context()
    if (!ctx) return
    const now = ctx.currentTime
    for (const tone of SOUNDS[name]) {
      const start = now + (tone.at ?? 0)
      const end = start + tone.dur
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone.type
      osc.frequency.setValueAtTime(tone.from * pitch, start)
      if (tone.to !== undefined) osc.frequency.exponentialRampToValueAtTime(tone.to * pitch, end)
      // プツッというノイズが出ないよう、立ち上がりと終わりをなめらかにする
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(tone.vol, start + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(end + 0.02)
    }
  }

  /** AudioContext はユーザー操作の後でないと鳴らせないので、最初に鳴らすときに作る */
  private context(): AudioContext | null {
    if (!this.ctx) {
      if (typeof AudioContext === 'undefined') return null
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}
