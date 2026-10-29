// 宣伝動画の音：撮影中に記録した効果音を作り直し、BGM（合成）を重ねて WAV にする
// capture.mjs が window.renderPromoAudio(events, 秒数, 場面の区切り) を呼び、window.promoWav（base64）を受け取る

import { CLIPS, TRAP } from './clips.mjs'

interface Recorded {
  type: OscillatorType
  freq: [string, number, number][]
  gain: [string, number, number][]
  start: number
  stop: number
}

declare global {
  interface Window {
    renderPromoAudio: (events: Recorded[], total: number) => Promise<void>
    promoWav: string
  }
}

const RATE = 48000

/** 場面の頭の時刻（秒） */
const clipStart: Record<string, number> = {}
{
  let t = 0
  for (const c of CLIPS) {
    clipStart[c.name] = t
    t += c.duration / 1000
  }
}

/** BGM が始まる・止まる・溜める・また始まる時刻（秒。台本に合わせる） */
const START_AT = () => clipStart.rule
const STOP_AT = () => clipStart.trap + TRAP.firstMiss / 1000
const BUILD_AT = () => clipStart.trap + TRAP.build / 1000
const DROP_AT = () => clipStart.trap + TRAP.drop / 1000
const BPM = 150
const BEAT = 60 / BPM

function applyEvents(param: AudioParam, events: [string, number, number][]): void {
  for (const [kind, v, t] of events) {
    const time = Math.max(0, t)
    if (kind === 'set') param.setValueAtTime(v, time)
    else if (kind === 'lin') param.linearRampToValueAtTime(v, time)
    else param.exponentialRampToValueAtTime(v, time)
  }
}

window.renderPromoAudio = async (events, total) => {
  const ctx = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE)
  const master = ctx.createDynamicsCompressor()
  master.threshold.value = -10
  master.ratio.value = 4
  master.attack.value = 0.003
  master.release.value = 0.15
  master.connect(ctx.destination)

  // ---- 効果音（ゲームと同じ音） ----
  const sfx = ctx.createGain()
  sfx.gain.value = 1.15
  sfx.connect(master)
  for (const e of events) {
    if (e.stop < 0) continue
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = e.type
    applyEvents(osc.frequency, e.freq)
    gain.gain.value = 0
    applyEvents(gain.gain, e.gain)
    osc.connect(gain).connect(sfx)
    osc.start(Math.max(0, e.start))
    osc.stop(Math.max(0, e.stop))
  }

  // ---- BGM ----
  const bgm = ctx.createGain()
  bgm.gain.value = 0.5
  bgm.connect(master)
  buildBgm(ctx, bgm, total)

  const buffer = await ctx.startRendering()
  window.promoWav = toWavBase64(buffer)
}

// ---- BGM の部品 ----

let noiseBuffer: AudioBuffer | null = null
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, RATE, RATE)
    const d = noiseBuffer.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

function env(ctx: BaseAudioContext, out: AudioNode, t: number, vol: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  g.connect(out)
  return g
}

function kick(ctx: BaseAudioContext, out: AudioNode, t: number, vol = 0.9): void {
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(160, t)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
  o.connect(env(ctx, out, t, vol, 0.002, 0.28))
  o.start(t)
  o.stop(t + 0.35)
}

function noiseHit(ctx: BaseAudioContext, out: AudioNode, t: number, vol: number, decay: number, type: BiquadFilterType, freq: number): void {
  const s = ctx.createBufferSource()
  s.buffer = noise(ctx)
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  s.connect(f).connect(env(ctx, out, t, vol, 0.001, decay))
  s.start(t, Math.random() * 0.5)
  s.stop(t + decay + 0.05)
}

function snare(ctx: BaseAudioContext, out: AudioNode, t: number, vol = 0.5): void {
  noiseHit(ctx, out, t, vol, 0.16, 'bandpass', 1900)
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(240, t)
  o.frequency.exponentialRampToValueAtTime(160, t + 0.08)
  o.connect(env(ctx, out, t, vol * 0.6, 0.001, 0.1))
  o.start(t)
  o.stop(t + 0.15)
}

const hat = (ctx: BaseAudioContext, out: AudioNode, t: number, vol = 0.12) => noiseHit(ctx, out, t, vol, 0.04, 'highpass', 8000)
const crash = (ctx: BaseAudioContext, out: AudioNode, t: number) => noiseHit(ctx, out, t, 0.28, 1.4, 'highpass', 5000)

function note(ctx: BaseAudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, vol: number, cutoff = 4000): void {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.value = freq
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = cutoff
  o.connect(f).connect(env(ctx, out, t, vol, 0.004, dur))
  o.start(t)
  o.stop(t + dur + 0.05)
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** コード進行（1小節ずつ）：C → G → Am → F。根音と和音（MIDI） */
const CHORDS = [
  { root: 48, tones: [60, 64, 67, 72] },
  { root: 43, tones: [59, 62, 67, 71] },
  { root: 45, tones: [60, 64, 69, 72] },
  { root: 41, tones: [60, 65, 69, 72] },
]

/** 1拍ぶんのグルーヴ（beat は通し番号。4拍で1小節） */
function groove(ctx: BaseAudioContext, out: AudioNode, t: number, beat: number, full: boolean): void {
  const chord = CHORDS[Math.floor(beat / 4) % CHORDS.length]
  const b = beat % 4
  kick(ctx, out, t)
  if (b === 1 || b === 3) snare(ctx, out, t)
  hat(ctx, out, t + BEAT / 2)
  if (full) hat(ctx, out, t, 0.06)
  // ベース：8分で根音とオクターブ
  note(ctx, out, 'square', hz(chord.root), t, BEAT * 0.4, 0.13, 900)
  note(ctx, out, 'square', hz(chord.root + 12), t + BEAT / 2, BEAT * 0.35, 0.1, 900)
  // 裏拍の和音
  for (const m of chord.tones.slice(0, 3)) note(ctx, out, 'square', hz(m), t + BEAT / 2, BEAT * 0.25, 0.025, 2600)
  // きらきらしたアルペジオ（16分）
  if (full) {
    for (let i = 0; i < 4; i++) {
      const m = chord.tones[(b * 4 + i) % chord.tones.length] + 12
      note(ctx, out, 'triangle', hz(m), t + (i * BEAT) / 4, BEAT * 0.22, 0.05, 6000)
    }
  }
}

function buildBgm(ctx: BaseAudioContext, out: AudioNode, total: number): void {
  const start = START_AT()
  const stop = STOP_AT()
  const build = BUILD_AT()
  const drop = DROP_AT()
  // 0) 問題の間：低い音が静かに脈打つだけ（見る人が探すのを邪魔しない）
  for (let t = 0.25; t < start - 0.3; t += BEAT * 2) note(ctx, out, 'triangle', hz(36), t, BEAT * 1.2, 0.12, 400)
  // 1) ルールから：軽快なグルーヴ。罠でいつもの位置を押した瞬間に止まる
  crash(ctx, out, start)
  for (let beat = 0; start + beat * BEAT < stop - 0.01; beat++) groove(ctx, out, start + beat * BEAT, beat, beat >= 4)
  // 止まる瞬間：テープが止まるように音程が落ちる
  {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(330, stop)
    o.frequency.exponentialRampToValueAtTime(40, stop + 0.35)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 1200
    o.connect(f).connect(env(ctx, out, stop, 0.12, 0.005, 0.35))
    o.start(stop)
    o.stop(stop + 0.4)
  }
  // 止まっている間（指が迷う間）は、時計のように小さく刻む
  for (let t = stop + 0.5; t < clipStart.trap + TRAP.slam / 1000 - 0.1; t += BEAT) hat(ctx, out, t, 0.05)
  // 2) 溜め：スネアの連打が速くなり、ノイズが上がっていく
  {
    const len = drop - build
    let t = build
    while (t < drop - 0.02) {
      const p = (t - build) / len
      snare(ctx, out, t, 0.12 + p * 0.3)
      t += p < 0.4 ? BEAT / 2 : p < 0.75 ? BEAT / 4 : BEAT / 8
    }
    const s = ctx.createBufferSource()
    s.buffer = noise(ctx)
    s.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(400, build)
    f.frequency.exponentialRampToValueAtTime(9000, drop)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, build)
    g.gain.exponentialRampToValueAtTime(0.25, drop - 0.05)
    g.gain.linearRampToValueAtTime(0, drop)
    s.connect(f).connect(g).connect(out)
    s.start(build)
    s.stop(drop)
  }
  // 3) 「前代未聞のタイピング！」から最後まで。締めの場面に入ったら最後の和音で終わる
  const endAt = clipStart.ending + 0.2
  crash(ctx, out, drop)
  for (const name of ['chaos', 'lose']) crash(ctx, out, clipStart[name])
  for (let beat = 0; drop + beat * BEAT < endAt - 0.01; beat++) {
    const t = drop + beat * BEAT
    groove(ctx, out, t, beat, true)
    // カオスの場面は音を厚くする
    if (t >= clipStart.chaos && t < clipStart.lose) hat(ctx, out, t + BEAT / 4, 0.07)
  }
  // 最後の和音（C）
  const last = Math.ceil((endAt - drop) / BEAT) * BEAT + drop
  kick(ctx, out, last)
  crash(ctx, out, last)
  for (const m of [48, 60, 64, 67, 72, 76]) note(ctx, out, 'square', hz(m), last, Math.max(1, total - last - 0.1), 0.05, 3000)
}

/** 16bit ステレオの WAV にして base64 で返す */
function toWavBase64(buffer: AudioBuffer): string {
  const n = buffer.length
  const ch = buffer.numberOfChannels
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2))
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  data.setUint32(4, 36 + n * ch * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, ch, true)
  data.setUint32(24, RATE, true)
  data.setUint32(28, RATE * ch * 2, true)
  data.setUint16(32, ch * 2, true)
  data.setUint16(34, 16, true)
  str(36, 'data')
  data.setUint32(40, n * ch * 2, true)
  // 音割れしないよう、いちばん大きいところを -1 dB にそろえる
  let peak = 0
  const chans = [...Array(ch).keys()].map((c) => buffer.getChannelData(c))
  for (const d of chans) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]))
  const k = peak > 0 ? 0.89 / peak : 1
  let o = 44
  for (let i = 0; i < n; i++) {
    for (const d of chans) {
      const v = Math.max(-1, Math.min(1, d[i] * k))
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      o += 2
    }
  }
  const bytes = new Uint8Array(data.buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
