// キーを押したときの判定

import { QWERTY_CHAR, isSwapCode, type Layout } from './keys'
import type { SentenceInput } from './romaji'

/**
 * - correct: 正解（入力が進む）
 * - miss: 通常のミス
 * - qwerty-miss: 入れ替え後なのに、本来の QWERTY 配列の位置を打ってしまったミス
 * - ignored: 入れ替え対象外のキー、または打ち終えた後。ミスにも正解にも数えない
 */
export type KeyResult = 'correct' | 'miss' | 'qwerty-miss' | 'ignored'

/** 押されたキーを判定する（入力は進めない） */
export function judgeKey(layout: Layout, code: string, input: SentenceInput): KeyResult {
  if (!isSwapCode(code) || input.isComplete) return 'ignored'
  const char = layout[code]
  // 今の配列で正しい文字なら正解（入れ替わっていない・元の位置に戻ったキーもここで正解になる）
  if (input.canAccept(char)) return 'correct'
  // 本来の QWERTY の文字が、どのローマ字候補でも次に打てる文字なら QWERTY 位置ミス
  if (input.canAccept(QWERTY_CHAR[code])) return 'qwerty-miss'
  return 'miss'
}

/** 押されたキーを判定し、正解なら入力を進める */
export function pressKey(layout: Layout, code: string, input: SentenceInput): KeyResult {
  const result = judgeKey(layout, code, input)
  if (result === 'correct') input.type(layout[code])
  return result
}
