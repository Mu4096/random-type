// 宣伝動画の撮影：場面（clip）ごとに、仮想の時計を1コマずつ進めてスクリーンショットを撮る
//
// 使い方（RANDOM_TYPE フォルダで）
//   node promo/capture.mjs                 全場面を撮って promo/out/ に書き出し、動画にまとめる
//   node promo/capture.mjs opening play    指定した場面だけ撮り直して、動画にまとめ直す
//   node promo/capture.mjs --still opening 0.5 2 3.2   場面の指定の秒のコマだけ撮る（確認用）
//   node promo/capture.mjs --render        撮り直さずに、音と動画のまとめだけやり直す

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { launch } from './cdp.mjs'
import { CLIPS, FPS, HEIGHT, SCALE, WIDTH } from './clips.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const out = join(here, 'out')
const framesDir = join(out, 'frames')
const PORT = 5199

const args = process.argv.slice(2)
const still = args[0] === '--still'
const renderOnly = args[0] === '--render'
const names = still ? [args[1]] : renderOnly ? [] : args.length > 0 ? args : CLIPS.map((c) => c.name)

async function main() {
  mkdirSync(framesDir, { recursive: true })
  if (names.length > 0) await captureClips()
  if (!still) await renderAudio()
  if (!still) encode()
}

async function withBrowser(fn) {
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), server: { port: PORT, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  const browser = await launch()
  browser.on((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      console.log(`  [page ${msg.params.type}]`, msg.params.args.map((a) => a.value ?? a.description).join(' '))
    }
    if (msg.method === 'Runtime.exceptionThrown') console.log('  [page exception]', msg.params.exceptionDetails.exception?.description)
  })
  try {
    await browser.send('Page.enable')
    await browser.send('Runtime.enable')
    await browser.send('Page.bringToFront')
    await browser.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await browser.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false })
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(here, 'vclock.js'), 'utf8') })
    return await fn(browser)
  } finally {
    await browser.close()
    await server.close()
  }
}

/** 場面のページを開いて、撮り始められるまで待つ */
async function openClip(browser, clip) {
  await browser.send('Page.navigate', { url: `http://localhost:${PORT}/promo/?clip=${clip.name}&seed=${clip.seed ?? 1}` })
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 100))
    const ok = await browser.evaluate('!!(window.__promo && window.__promo.loaded)').catch(() => false)
    if (ok) break
  }
  await browser.evaluate('document.fonts.ready.then(() => window.__promo.ready)')
  // フォントの読み込みと最初の描画を待つ（実時間）
  await new Promise((r) => setTimeout(r, 400))
  return browser.evaluate('({ startAt: __promo.startAt, duration: __promo.duration })')
}

/** 仮想の時刻を t（ミリ秒）まで進める。途中は1コマずつ刻む（物理演算やアニメーションの判定が飛ばないように） */
async function advanceTo(browser, t) {
  const step = 1000 / FPS
  await browser.evaluate(`(async () => { while (__vclock.now + ${step} < ${t}) await __vclock.advance(${step}); await __vclock.advance(Math.max(0, ${t} - __vclock.now)) })()`)
}

/** p が ms 以内に終わらなければ失敗にする（ブラウザが応答しなくなったときに気づけるように） */
function timeout(p, ms, what) {
  let timer
  return Promise.race([p, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} が ${ms} ms で終わらない`)), ms)))]).finally(() => clearTimeout(timer))
}

let retries = 0
async function shot(browser, file) {
  // ヘッドレスの Edge は、撮影の頼みにときどき返事をしなくなる（頼み直すと返ってくる）。
  // 返事が遅いときは頼み直す。描画も起きるよう、隅の1点（見えないほど薄い）を毎回変える
  await browser.evaluate('window.__promoTick?.()')
  for (let attempt = 0; ; attempt++) {
    try {
      const { data } = await timeout(browser.send('Page.captureScreenshot', { format: 'png' }), 1500, 'スクリーンショット')
      writeFileSync(file, Buffer.from(data, 'base64'))
      return
    } catch (e) {
      if (attempt >= 10) throw e
      retries++
      await browser.evaluate('window.__promoTick?.()')
    }
  }
}

async function captureClips() {
  await withBrowser(async (browser) => {
    for (const name of names) {
      const clip = CLIPS.find((c) => c.name === name)
      if (!clip) throw new Error(`場面 ${name} がありません（${CLIPS.map((c) => c.name).join(', ')}）`)
      const info = await openClip(browser, clip)
      if (still) {
        for (const sec of args.slice(2).map(Number)) {
          await advanceTo(browser, info.startAt + sec * 1000)
          const file = join(out, `still_${name}_${sec}.png`)
          await shot(browser, file)
          console.log(file)
        }
        continue
      }
      const dir = join(framesDir, name)
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      const frames = Math.round((clip.duration / 1000) * FPS)
      console.log(`${name}: ${frames} コマ（前置き ${info.startAt} ms）`)
      await advanceTo(browser, info.startAt)
      for (let i = 0; i < frames; i++) {
        if (i > 0) await timeout(advanceTo(browser, info.startAt + (i * 1000) / FPS), 15000, `${i} コマ目の時計`)
        await shot(browser, join(dir, `${String(i).padStart(5, '0')}.png`))
        if (i % 30 === 0) process.stdout.write(`  ${i}/${frames}\r`)
      }
      // 鳴った音（場面の頭からの秒に直す）
      const sounds = await browser.evaluate('__vclock.sounds')
      const offset = info.startAt / 1000
      const end = clip.duration / 1000
      const inClip = sounds
        .filter((s) => s.start >= offset - 0.001 && s.start - offset < end)
        .map((s) => ({
          ...s,
          start: s.start - offset,
          stop: s.stop - offset,
          freq: s.freq.map(([k, v, t]) => [k, v, t - offset]),
          gain: s.gain.map(([k, v, t]) => [k, v, t - offset]),
        }))
      writeFileSync(join(dir, 'sounds.json'), JSON.stringify(inClip))
      console.log(`  ${frames} コマ、音 ${inClip.length} 個（撮り直し ${retries} 回）`)
      retries = 0
    }
  })
}

/** 効果音（各場面で記録したもの）と BGM を合成して WAV にする */
async function renderAudio() {
  const events = []
  let offset = 0
  for (const clip of CLIPS) {
    const file = join(framesDir, clip.name, 'sounds.json')
    if (existsSync(file)) {
      for (const s of JSON.parse(readFileSync(file, 'utf8'))) {
        const shift = ([k, v, t]) => [k, v, t + offset]
        events.push({ ...s, start: s.start + offset, stop: s.stop + offset, freq: s.freq.map(shift), gain: s.gain.map(shift) })
      }
    }
    offset += clip.duration / 1000
  }
  const total = offset
  console.log(`音を合成（${total.toFixed(2)} 秒、効果音 ${events.length} 個）`)
  await withBrowser(async (browser) => {
    await browser.send('Page.navigate', { url: `http://localhost:${PORT}/promo/audio.html` })
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 100))
      if (await browser.evaluate('!!window.renderPromoAudio').catch(() => false)) break
    }
    writeFileSync(join(out, 'events.json'), JSON.stringify(events))
    await browser.evaluate(`window.renderPromoAudio(${JSON.stringify(events)}, ${total})`)
    // CDP の1回の返事が大きくなりすぎないよう、少しずつ受け取る
    const size = await browser.evaluate('window.promoWav.length')
    const chunks = []
    const CHUNK = 4_000_000
    for (let i = 0; i < size; i += CHUNK) chunks.push(await browser.evaluate(`window.promoWav.slice(${i}, ${i + CHUNK})`))
    writeFileSync(join(out, 'audio.wav'), Buffer.from(chunks.join(''), 'base64'))
  })
}

/** 場面のコマを順につないで、音を付けて MP4 にする */
function encode() {
  const inputs = []
  for (const c of CLIPS) inputs.push('-framerate', String(FPS), '-i', join(framesDir, c.name, '%05d.png'))
  inputs.push('-i', join(out, 'audio.wav'))
  const n = CLIPS.length
  const filter = `${CLIPS.map((_, i) => `[${i}:v]`).join('')}concat=n=${n}:v=1:a=0,format=yuv420p[v]`
  // できた動画は git に含める（コマや音の途中のファイルは promo/out/ に置き、git に含めない）
  const file = join(here, 'random-type-promo.mp4')
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel', 'error',
      ...inputs,
      '-filter_complex', filter,
      '-map', '[v]',
      '-map', `${n}:a`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-r', String(FPS),
      // X などで流したときに小さすぎないよう、音の大きさを -14 LUFS にそろえる
      '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-movflags', '+faststart',
      '-shortest',
      file,
    ],
    { stdio: 'inherit' },
  )
  console.log(file)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
