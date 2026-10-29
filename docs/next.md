# 次の作業

- 更新: 2026-10-30（rename-account-id の後）

## やること
CLAUDE.md の実装順（1〜6）はすべて完了。ただし 2026-10-23 に公開を停止した（unpublish）。GitHub Pages は無効、リポジトリは Private。
2026-10-30 にアカウント ID を Mu4096 に変え、新しいリポジトリ Mu4096/random-type（Private）に履歴を作り直して入れた（rename-account-id）。それより前の push 済みの記述は旧リポジトリでのこと（旧リポジトリは非公開のまま別名で残っている）。
README.md の追加、readable-text、mode-cards、start-keys、result-choices、ランキング画面の「登録しない」（register-decline）、ファビコン（favicon）、タイトル画面のサブタイトル削除（remove-subtitle）、結果画面のランクインの吹き出し（rank-bubble）、ランク基準の緩和（grade-looser）、ちょっぴり難しめモードの説明文の修正（normal-desc-period）、URL を共有したときの表示（ogp）、ランク基準のさらなる引き下げ（grade-lower）、ランク評価でミスを差し引く（grade-miss-penalty）、指ごとの範囲の色の枠（finger-zones）、ログの時刻のずれの修正と時刻確認のルール追加（fix-log-times）、結果画面の GOD ランク追加と基準の変更（grade-god）、結果画面のランクのメーター演出（grade-meter）まで push 済み（2026-10-17）。
宣伝動画（promo-video、promo/random-type-promo.mp4）と、タイトル画面で放置すると宣伝動画を流す機能（attract-video）も push 済み（2026-10-18）。
タイトルの文字が入れ替わったまま残る不具合の修正（title-scramble-stuck）も push 済み（2026-10-18）。
次に何をするかはユーザーに聞く。候補として出せるもの：

- 再公開するか（するなら下の「メモ」の再公開の手順）。公開停止中は、公開ページでの確認（音つきの自動再生、Discord の表示など）はできない

- 宣伝動画の手直し（spec.md「宣伝動画」、promo/director.ts の場面ごとの台本）
  - 音は耳では未確認（効果音と BGM の大きさのつり合い、BGM の曲調）
  - X に載せたときの見え方（ミュートでの自動再生、スマホでの字幕の読みやすさ）
  - 縦長・正方形の版が要るか
- 放置したときの宣伝動画の手直し（src/ui/attract.ts の ATTRACT_IDLE_MS など）
  - 実際の公開ページで音つきで流れるか（ブラウザの自動再生の制限）。耳では未確認。再公開しないなら npm.cmd run preview で確認する
  - スマホ・タブレットでの見え方
- 実際に遊んでみての調整
  - 結果画面の3択ボタン・ランキング画面での登録の使い心地
  - ランク評価の kpm 基準（grade-god で GOD を足して6段階に。やさしいは GOD＝100・S＝80・A＝60。spec.md「結果画面」の表、hype.ts の GRADE_KPM）
  - ランク評価でミスを差し引く係数（1ミス0.2打鍵。hype.ts の GRADE_MISS_PENALTY）。ふつうに遊んで下がりすぎないか、ガチャガチャ押して十分下がるか
  - フィーバーに入るコンボ数（15）、節目の間隔、「見つけた」の1.2秒
  - 演出の多さ・効果音の音量や音色
  - 結果画面のランクのメーター：上がる速さ（GOD の上まで約2.8秒）、ギギギ・カンの音
  - 難易度カードのおすすめの一言の文言
- ほかの画面の文字の読みやすさ（プレイ画面のステータス、ランキング画面、操作案内の灰色の文字など。今回はタイトル画面と結果画面だけ直した）
- 問題文の追加・入れ替え
- 再公開したら、Discord で URL を貼って、説明文と画像（public/ogp.png）が出るかの確認（Discord は表示をキャッシュするので、前に貼った URL は古いままのことがある）
- スマホ・タブレットでの扱い（キーボード前提のゲームなので、案内を出すかなど）。README には「非対応」と書いてあるので、対応を変えたら README も直す。スマホ幅だと結果画面のランクのメーターはスコアの下に回る（スクロールが要る）
- 実機で日本語入力 ON のまま Space / Enter を押したときの確認（開始はするが、プレイ中の打鍵で IME 警告が出る想定）
- ライセンス（LICENSE ファイル）を付けるか。付けたら README にライセンスの節を足す
- README にスクリーンショットを入れるか

## 着手前にユーザーへ確認すること
- 次にやりたいこと（上の候補以外でもよい）

## メモ
- 公開は停止中。新しいリポジトリではデプロイのワークフロー（deploy.yml）を無効にしたかをユーザーに確認すること（無効にしていないと main への push で動くが、Private で Pages が無効なので公開はされず失敗する）
- 再公開の手順：リポジトリを Public に戻す（無料プランでは非公開リポジトリで Pages を使えない）→ Settings → Pages の Source で GitHub Actions を選ぶ → `gh workflow enable deploy.yml` → main に push するか Actions から手動実行。spec.md の「公開方法」も戻す
- CLAUDE.md には「GitHub Pages で公開」の記述が残っているが、ユーザーの判断でそのままにしている
- ログの時刻は推測しない。書く前に毎回 `date "+%Y-%m-%d %H:%M"` を実行し、結果を見てから書く（CLAUDE.md の「ログ」）
- push はユーザーの指示があったときだけ。ユーザーはまとめて push する方針
- ユーザーの PowerShell では `npm.cmd` を使う（CLAUDE.md のコマンド欄）
- 本番と同じ形の確認は `npm.cmd run build` → `npm.cmd run preview` で http://localhost:4173/random-type/
- 遊び方・操作・ファイル構成を変えたら README.md も合わせて直す
- タイトルの難易度カードのミニキーボードは app.ts の shuffleDemo（タイトル文字の入れ替えと同じタイマーで動く）
- 演出の判定（コンボ・ランク評価など）は src/logic/hype.ts、パーティクルと飛び出す文字は src/ui/fx.ts
- ブラウザでの自動確認は、window に keydown（code 指定）を dispatch すれば打てる。キーの表示文字から打つべき code を探せる
- 結果画面をすぐ見たいときは、performance.now を一時的に差し替えて時間を進めると出せる
- ユーザーは傾いた文字の帯を好まない（「キーが入れ替わる！」の傾きは外した）。タイトル画面のサブタイトル「キーの位置、信用するな。」は不要として削除済み。新しい装飾で傾けるときは確認する
- 開始キーは Space / Enter（テンキーの Enter 含む、自動リピートは無視）。判定は app.ts の isStartKey。開始時の IME 判定はなく、タイトルに「日本語入力モードをオフにしてください」の札（.ime-notice）を常に出す。プレイ中の IME 判定（isImeKey と showWarning）は残している
- 結果画面は Space＝もう一度 / Enter＝ランキング / Esc＝タイトル。未登録の記録は app.ts の draft に持ち、結果から入ったランキング画面（showDraftRanking）で「あなた（未登録）」の行として差し込む。登録すると draft を消して通常のランキング画面に戻る。ランクイン時は Backspace・ボタンで登録しない（declineRegister）を選べ、同じく通常のランキング画面になる
- 難易度カードの説明文（app.ts の DIFFICULTIES の desc）は HTML として埋め込まれる。ちょっぴりは <br> で改行している
- ランクのハンコは .grade-GOD など（style.css）。GOD は紫の台に虹色の点滅、S は黄色の塗りだけ
- 結果画面のランクのメーターは app.ts の meterHtml・raiseMeter、高さの計算は hype.ts の gradeMeterLevel。メーター内の色分けは .g-GOD など（ハンコ用の .grade-* はアニメーションが付くので使わない）。ハンコはメーターの右に --level の高さで置く。メーターの効果音（meter・meter-line）は耳では未確認
- ブラウザの確認で performance.now を差し替えるときは Performance.prototype.now.bind(performance) を使う（bind しないと Illegal invocation でゲームのループが止まる）。差し替えると fx.ts の rAF の時刻とずれてコンソールにエラーが出るが、確認用の副作用
- 結果画面のランクインの吹き出しは .rank-bubble（app.ts の showResult、style.css）。ランク外で出ないことはブラウザでは未確認
- ランクインで10位が押し出される表示（10件埋まっている状態でランクイン）はブラウザでは未確認（0打鍵の確認では作れなかった）
- 効果音は耳では未確認
- OGP 画像は tools/ogp.html を直して、先頭コメントのコマンド（PowerShell）で public/ogp.png に書き出す。Git Bash から msedge.exe を呼ぶと書き出せなかった
- ファビコンは public/favicon.svg（SVG 1枚のみ）
- 指の範囲の枠はキーボードの後ろの SVG（.finger-zones）。キーの offsetLeft/Top から描くので、.keyboard は position: relative。キーのすき間（--key-gap 14px）を狭めると隣の範囲の線がくっつく。スマホ幅での見た目は未確認
- 宣伝動画は `node promo/capture.mjs`（全部）・`node promo/capture.mjs 場面名…`（その場面だけ撮り直してまとめ直す）・`--still 場面名 秒…`（確認用のコマ）・`--render`（撮り直さずに音と動画のまとめだけ）。全部撮ると数分。場面の長さと順番は promo/clips.mjs。Chrome（なければ Edge）と ffmpeg が要る。コマの画像は promo/out/（git に含めない）
- ヘッドレスの Edge は撮影を数十回続けると撮影の頼みに返事をしなくなるので、Chrome を優先している（promo/cdp.mjs）
- 台本の at(時刻, fn) は仮想の時刻（絶対時刻）。本物のゲームの場面（hunt・chaos・lose）は種（clips.mjs の seed）で展開が決まる。hunt の撮り始め（director.ts の HUNT_START）は1文クリアの時刻から決めているので、種や打ち方を変えたら --still でコンソールの「1文クリア」の時刻を見て合わせ直す
- 放置したときの宣伝動画は src/ui/attract.ts（AttractVideo）。app.ts の showTitle で arm、startGame・showRanking で disarm、onKeyDown の最初で handleKey。宣伝動画を作り直すと、ゲーム内で流れる動画も変わる（同じファイルを import している）
- ブラウザの自動確認で30秒待つときは、ブラウザの画面の上でマウスが動くと待ち時間がやり直される
- 宣伝動画の字幕は全場面で上（場面ごとに位置を変えない）。重なる場面はゲーム画面を下げる（promo.css）
- テロップに Dela Gothic One を使うときは font-weight: normal にする（太字にするとブラウザが無理に太らせて字がつぶれる）
