// 撮影用の仮想の時計（ページのどのスクリプトよりも先に差し込む）
// 時間に関わるもの（performance.now・Date.now・requestAnimationFrame・setTimeout・setInterval・
// CSS アニメーション・Math.random・AudioContext）を差し替え、__vclock.advance(ms) で1コマずつ進める。
// 実時間の録画と違って、コマ落ちせず毎回同じ映像になる
;(() => {
  let now = 0
  const dateBase = Date.parse('2026-10-18T12:00:00+09:00')

  // ---- 乱数（種つき。?seed= で変えられる） ----
  const params = new URLSearchParams(location.search)
  let seed = Number(params.get('seed') ?? 1) >>> 0
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // ---- 時刻 ----
  Performance.prototype.now = function () {
    return now
  }
  const RealDate = Date
  Date.now = () => dateBase + now
  window.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(dateBase + now)
      else super(...args)
    }
    static now() {
      return dateBase + now
    }
  }

  // ---- タイマー ----
  let nextId = 1
  const timers = new Map()
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args, interval: 0 })
    return id
  }
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = nextId++
    const interval = Math.max(1, Number(ms) || 0)
    timers.set(id, { at: now + interval, fn, args, interval })
    return id
  }
  window.clearTimeout = window.clearInterval = (id) => {
    timers.delete(id)
  }

  let frameCallbacks = new Map()
  window.requestAnimationFrame = (fn) => {
    const id = nextId++
    frameCallbacks.set(id, fn)
    return id
  }
  window.cancelAnimationFrame = (id) => {
    frameCallbacks.delete(id)
  }

  const call = (fn, args) => {
    try {
      if (typeof fn === 'function') fn(...args)
    } catch (e) {
      console.error(e)
    }
  }

  /** たまっている Promise の続き（マイクロタスク）を全部走らせる。台本の await wait() を正しい時刻で進めるため */
  const flush = () =>
    new Promise((resolve) => {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => resolve()
      ch.port2.postMessage(0)
    })

  /** 時刻 to までのタイマーを、時刻順に実行する（実行中は now をそのタイマーの時刻にする） */
  const runTimers = async (to) => {
    for (;;) {
      let pick = null
      for (const [id, t] of timers) {
        if (t.at <= to && (!pick || t.at < pick[1].at || (t.at === pick[1].at && id < pick[0]))) pick = [id, t]
      }
      if (!pick) break
      const [id, t] = pick
      now = Math.max(now, t.at)
      if (t.interval) t.at += t.interval
      else timers.delete(id)
      call(t.fn, t.args)
      await flush()
    }
    now = to
  }

  // ---- CSS アニメーション・トランジション ----
  // 見つけた時刻を開始とし、止めたうえで毎コマ currentTime を仮想の時刻に合わせる
  const started = new WeakMap()
  const syncAnimations = () => {
    for (const anim of document.getAnimations()) {
      let start = started.get(anim)
      if (start === undefined) {
        start = now
        started.set(anim, start)
        anim.pause()
      }
      if (anim.playState === 'finished') continue
      const end = anim.effect?.getComputedTiming().endTime ?? Infinity
      const t = now - start
      if (Number.isFinite(end) && t >= end) {
        anim.finish()
      } else {
        anim.currentTime = t
      }
    }
  }

  // ---- 音（鳴らした音の指定を記録する偽の AudioContext） ----
  const sounds = []
  class FakeParam {
    constructor(events) {
      this.events = events
      this.value = 0
    }
    setValueAtTime(v, t) {
      this.events.push(['set', v, t])
      return this
    }
    linearRampToValueAtTime(v, t) {
      this.events.push(['lin', v, t])
      return this
    }
    exponentialRampToValueAtTime(v, t) {
      this.events.push(['exp', v, t])
      return this
    }
  }
  class FakeNode {
    connect(node) {
      this.out = node
      return node
    }
    disconnect() {}
  }
  class FakeOsc extends FakeNode {
    constructor() {
      super()
      this.rec = { type: 'sine', freq: [], gain: [], start: 0, stop: 0 }
      this.frequency = new FakeParam(this.rec.freq)
      this.type = 'sine'
    }
    start(t = 0) {
      this.rec.start = t
    }
    stop(t = 0) {
      this.rec.type = this.type
      this.rec.stop = t
      if (this.out && this.out.gainRec) this.rec.gain = this.out.gainRec
      sounds.push(this.rec)
    }
  }
  class FakeGain extends FakeNode {
    constructor() {
      super()
      this.gainRec = []
      this.gain = new FakeParam(this.gainRec)
    }
  }
  class FakeAudioContext {
    constructor() {
      this.state = 'running'
      this.destination = new FakeNode()
    }
    get currentTime() {
      return now / 1000
    }
    resume() {
      return Promise.resolve()
    }
    createOscillator() {
      return new FakeOsc()
    }
    createGain() {
      return new FakeGain()
    }
  }
  window.AudioContext = FakeAudioContext

  // OS の「動きを減らす」設定に左右されないようにする
  const realMatchMedia = window.matchMedia.bind(window)
  window.matchMedia = (q) => (q.includes('prefers-reduced-motion') ? { matches: false, addEventListener() {}, removeEventListener() {} } : realMatchMedia(q))

  window.__vclock = {
    get now() {
      return now
    },
    sounds,
    /** ms だけ時間を進める：タイマー → requestAnimationFrame → CSS アニメーション */
    async advance(ms) {
      await runTimers(now + ms)
      const cbs = frameCallbacks
      frameCallbacks = new Map()
      for (const fn of cbs.values()) call(fn, [now])
      await flush()
      syncAnimations()
    },
  }
})()
