// Chrome（なければ Edge）をヘッドレスで起動し、Chrome DevTools Protocol で操作する小さな道具
// （puppeteer などを入れずに、Node 24 の組み込み WebSocket で直接話す）

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Chrome を優先する。ヘッドレスの Edge は、撮影を数十回続けると撮影の頼みに返事をしなくなることがある
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch({ port = 9333 } = {}) {
  const { existsSync } = await import('node:fs')
  const exe = process.env.PROMO_BROWSER ?? BROWSERS.find((p) => existsSync(p))
  if (!exe) throw new Error('Chrome か Edge が見つかりません')
  const profile = mkdtempSync(join(tmpdir(), 'promo-browser-'))
  const proc = spawn(exe, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ])
  let target
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(100)
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = list.find((t) => t.type === 'page')
    } catch {
      // まだ起動していない
    }
  }
  if (!target) throw new Error('ブラウザに接続できませんでした')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`))
      else resolve(msg.result)
    } else if (msg.method) {
      for (const fn of listeners) fn(msg)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, { resolve, reject })
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  /** ページの中で式を評価して値を返す（Promise は待つ） */
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    }
    return r.result.value
  }
  const close = async () => {
    try {
      await send('Browser.close')
    } catch {
      // すでに閉じている
    }
    ws.close()
    proc.kill()
    await sleep(500)
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      // ブラウザがまだ掴んでいることがある。一時フォルダなので残っても困らない
    }
  }
  return { send, evaluate, close, on: (fn) => listeners.push(fn) }
}
