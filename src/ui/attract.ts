import promoUrl from '../../promo/random-type-promo.mp4'

const ENABLED_KEY = 'random-type:attract'
/** 何も操作されずにこの時間がたったら動画を流す */
export const ATTRACT_IDLE_MS = 30_000

/**
 * 放置したときに流す宣伝動画（アトラクトモード）。
 * タイトル画面にいる間だけ arm され、操作がないまま ATTRACT_IDLE_MS たつと全画面で流す。
 */
export class AttractVideo {
  private readonly overlay: HTMLElement
  private readonly video: HTMLVideoElement
  private enabledValue: boolean
  private armed = false
  private timer = 0
  /** 流すときの音の設定（ゲームのミュート設定）を返す */
  private readonly isMuted: () => boolean

  constructor(isMuted: () => boolean) {
    this.isMuted = isMuted
    this.enabledValue = readEnabled()
    this.overlay = document.createElement('div')
    this.overlay.className = 'attract'
    this.overlay.hidden = true
    this.overlay.innerHTML = `
      <video playsinline loop preload="none"></video>
      <p class="attract-hint">なにかキーを押すとタイトルに戻る</p>`
    this.video = this.overlay.querySelector('video')!
    this.video.src = promoUrl
    // クリック・タップでも戻れるようにする
    this.overlay.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.stop()
    })
    document.body.append(this.overlay)
    // マウスを動かしているなら放置ではないので、待ち時間をやり直す（流れている間は止めない）
    for (const type of ['pointerdown', 'wheel'] as const) {
      window.addEventListener(type, () => this.poke(), { passive: true })
    }
    window.addEventListener(
      'pointermove',
      (e) => {
        // 画面の動きでカーソルの下が変わったときの、動いていない pointermove は数えない
        if (e.movementX !== 0 || e.movementY !== 0) this.poke()
      },
      { passive: true },
    )
  }

  get enabled(): boolean {
    return this.enabledValue
  }

  set enabled(value: boolean) {
    this.enabledValue = value
    try {
      localStorage.setItem(ENABLED_KEY, value ? '1' : '0')
    } catch {
      // 保存できなくても、このページの間は設定が効く
    }
    this.restartTimer()
  }

  get playing(): boolean {
    return !this.overlay.hidden
  }

  /** タイトル画面に入ったときに呼ぶ。放置の待ち時間を数え始める */
  arm(): void {
    this.armed = true
    this.restartTimer()
  }

  /** タイトル画面を出るときに呼ぶ */
  disarm(): void {
    this.armed = false
    clearTimeout(this.timer)
    this.stop()
  }

  /** 操作があったときに呼ぶ。流れていなければ待ち時間をやり直す */
  poke(): void {
    if (!this.playing) this.restartTimer()
  }

  /**
   * キーが押されたときに最初に呼ぶ。流れている間はそのキーで動画を止め、true を返す
   * （そのキーはタイトル画面の操作には使わない）
   */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.playing) {
      this.poke()
      return false
    }
    e.preventDefault()
    this.stop()
    return true
  }

  private restartTimer(): void {
    clearTimeout(this.timer)
    if (!this.armed || !this.enabledValue) return
    this.timer = window.setTimeout(() => this.start(), ATTRACT_IDLE_MS)
  }

  private start(): void {
    if (!this.armed || !this.enabledValue || this.playing) return
    this.overlay.hidden = false
    this.video.currentTime = 0
    this.video.muted = this.isMuted()
    this.video.play().catch(() => {
      // まだ一度も操作していないと、音つきの自動再生はブラウザに止められる。無音で流し直す
      if (this.video.muted || !this.playing) return
      this.video.muted = true
      this.video.play().catch(() => {})
    })
  }

  private stop(): void {
    if (!this.playing) return
    this.overlay.hidden = true
    this.video.pause()
    this.restartTimer()
  }
}

function readEnabled(): boolean {
  try {
    // 初期値は「使う」
    return localStorage.getItem(ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}
