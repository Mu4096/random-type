// 入れ替え対象のキー（物理位置は event.code で表す）

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

/** 入れ替え対象の物理キー：アルファベット26キー＋伸ばし棒（Minus） */
export const SWAP_CODES: readonly string[] = [
  ...[...LETTERS].map((c) => `Key${c.toUpperCase()}`),
  'Minus',
]

/** 物理キー → QWERTY 配列での文字（伸ばし棒は '-'） */
export const QWERTY_CHAR: Readonly<Record<string, string>> = Object.fromEntries(
  SWAP_CODES.map((code) => [code, code === 'Minus' ? '-' : code.slice(3).toLowerCase()]),
)

/** 物理キー → 現在そのキーで入力される文字 */
export type Layout = Readonly<Record<string, string>>

export function isSwapCode(code: string): boolean {
  return code in QWERTY_CHAR
}

/** デフォルト（QWERTY）の配列 */
export function defaultLayout(): Layout {
  return { ...QWERTY_CHAR }
}

/** デフォルトから入れ替わっているキーか（複数回の入れ替えで元に戻ったものは false） */
export function isChanged(layout: Layout, code: string): boolean {
  return layout[code] !== QWERTY_CHAR[code]
}
