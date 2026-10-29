# GitHub アカウント ID の変更に合わせた置き換え
- 状態: 完了
- 開始: 2026-10-30 00:58

## 目的
GitHub のアカウント ID を Mu4096 に変えたため、リポジトリ内の旧 ID をすべて新しい ID に置き換える。公開用の新しいリポジトリ（履歴を作り直したもの）に入れる前の準備。

## 経過
- 00:58 旧 ID の出現箇所を検索：大文字始まり 7 か所、小文字（github.io のドメイン）9 か所。対象は index.html、README.md、vite.config.ts、docs/spec.md、docs/history.md、logs/ の 4 ファイル
- 00:58 OGP 画像（public/ogp.png）と宣伝動画（promo/random-type-promo.mp4）に URL・ID が写っていないことを目視で確認

- 01:04 ユーザーの OK を受け、docs/history.md に追記、docs/next.md を更新。新しいリポジトリ Mu4096/random-type（Private）に1コミットで入れて push する（公開はしない）

## 判断
- [確認済み] 新しい ID に置き換える。過去の記録（docs/history.md、logs/）も新しい ID に置き換える（当時の実際の ID とは食い違うことを伝えたうえでのユーザーの決定）
- [AI判断] GitHub Pages のドメインは小文字なので、URL 中の小文字表記は小文字の新 ID（mu4096.github.io）にする。それ以外は Mu4096
- [AI判断] vite.config.ts の base（/random-type/）はリポジトリ名が変わらないので変更しない

## 未解決
- docs/spec.md「公開方法」の節は「公開を停止している」のまま。公開し直すときに書き直す
