// 宣伝動画の場面の並びと長さ（ミリ秒）。中身は promo/director.ts の同じ名前の場面
// seed は乱数の種（出てくる問題文や入れ替わり方が変わる）

export const WIDTH = 1280
export const HEIGHT = 720
/** 1280×720 の画面を 1.5 倍で撮って 1920×1080 にする */
export const SCALE = 1.5
export const FPS = 30

export const CLIPS = [
  // 見る人への問題：「“A” はどこ？」
  { name: 'quiz', duration: 4000, seed: 3 },
  // ルール：1文打つたびにキーが入れ替わる
  { name: 'rule', duration: 3500, seed: 1 },
  // 罠：指がいつもの位置へ行ってガクッ → 経験は無意味！
  { name: 'trap', duration: 7000, seed: 1 },
  // 目で探して見つける → 覚えたころにまた変わる
  { name: 'hunt', duration: 5500, seed: 2 },
  // カオスモードは毎回ぜんぶ
  { name: 'chaos', duration: 2500, seed: 1 },
  // 得意な人ほどハマる（苦戦した結果）
  { name: 'lose', duration: 4500, seed: 4 },
  // 締め
  { name: 'ending', duration: 3500, seed: 1 },
]

/** 罠の場面の出来事の時刻（場面の頭からのミリ秒）。台本と BGM で共有する */
export const TRAP = {
  /** 1回目：いつもの K の位置を押してしまう（BGM が止まる） */
  firstMiss: 1150,
  /** 「経験は無意味！」 */
  slam: 3700,
  /** 溜め始め */
  build: 4600,
  /** 「前代未聞のタイピング！」（BGM が戻る） */
  drop: 5650,
}

/** 問題の場面の答えを見せる時刻 */
export const QUIZ_REVEAL = 2700
