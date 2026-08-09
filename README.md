# オーレック 営業支援アプリ

オーレック関東営業所向けの社内営業支援ツールです。  
シングルHTML（`index.html`）1ファイルで動作します。ブラウザで開くだけですぐ使えます。

## 主な機能

| 機能 | 説明 |
|---|---|
| ✉️ メッセージ生成 | 得意先向けメッセージを自動生成 |
| 📊 引合書作成 | 引合内容を入力してExcelエクスポート |
| 📝 見積書作成 | 複数製品対応・仕切率自動計算・クボタ営業所選択 |
| 📋 発送依頼書作成 | 発送依頼書を作成・印刷 |
| 🔩 部品価格検索 | 42,467件の部品価格をオフラインで瞬時検索 |
| 📄 価格表 | kakakuhyou2026.pdf をアプリ内で閲覧 |
| 📚 カタログ | 11シリーズのPDFカタログ + YouTube動画 |
| 🛰️ 営業インテリジェンス | 6時間ごとに公開情報を収集し、毎日18:00に営業テーマ、他社動向、製品PRポイント、斜め上からの営業仮説を配信 |

## 使い方

### ブラウザで直接開く（最も簡単）

```
index.html をダブルクリック → Chrome / Edge で開く
```

> 💡 スマホで使う場合はQRコードや共有URLで送ると便利です

### 本番URL（CloudFront配信）

```
https://dkl5pcrrq8gba.cloudfront.net/sales/
```

## ファイル構成

```
orec-sales-app/
├── index.html                # アプリ本体
├── manifest.webmanifest      # PWA設定
├── sw.js                     # オフライン用Service Worker
├── scripts/                  # 情報収集・日次生成・通知
├── schemas/                  # 公開JSONスキーマ
└── .github/workflows/        # 定期収集・発行・配布
```

> **Note:** 価格表PDF（`kakakuhyou2026.pdf`）やカタログPDFは別途配置が必要です。  
> ローカル開発時は `index.html` と同じフォルダに置いてください。

## 修正・改善の方法

1. このリポジトリを Clone または ZIP ダウンロード
2. `index.html` をエディタ（VS Code 推奨）で編集
3. ブラウザで動作確認
4. GitHub にプッシュ → 担当者がレビュー・本番反映

```bash
git clone https://github.com/kokiswim0077-cloud/orec-sales-app.git
cd orec-sales-app
# index.html を編集...
git add index.html
git commit -m "説明"
git push origin main
```

## 内蔵データ（外部ファイル不要）

- **部品価格**: 42,467件（HTML内に埋め込み済み）
- **販売店マスタ**: 882件（都道府県フィルター付き）
- **得意先仕切率**: 309件（HK_SHIKIRIマスタ）
- **商品マスタ**: 116件（HK_PRODUCTS）

## デプロイ手順（担当者向け）

```bash
# 1. GitHub push（自動反映はなし、手動S3同期が必要）
git push origin main

# 2. S3に反映（CloudFront経由で即時公開）
aws s3 cp index.html s3://orec-parts-chatbot/sales/index.html --region ap-northeast-1
```

## 営業情報の自動収集・スマホ通知

### 実行時刻（日本時間）

- 情報収集: 23:47 / 5:47 / 11:47 / 17:47
- 日次レポート・プッシュ通知: 18:00
- Actions画面の `workflow_dispatch` から収集、発行、通知だけの手動実行も可能

### GitHub設定

`reports` ブランチを作り、Actionsの「Workflow permissions」を `Read and write permissions` にします。

Repository Secrets:

- `GEMINI_API_KEY`
- `ONESIGNAL_API_KEY`
- `ONESIGNAL_SUBSCRIPTION_IDS` — 例: `["端末のSubscription ID"]`

Repository Variables:

- `ONESIGNAL_APP_ID`
- `PUBLIC_BASE_URL` — 既定値: `https://dkl5pcrrq8gba.cloudfront.net/sales/`
- `GEMINI_MODEL` — 既定値: `gemini-2.5-flash`
- 配布を自動化する場合: `AWS_ROLE_ARN`, `AWS_REGION`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`

OneSignalではWeb Pushの対象オリジンを `https://dkl5pcrrq8gba.cloudfront.net` に設定します。iPhoneはSafariからホーム画面に追加後、営業情報画面の「通知を受け取る」を押してください。表示されたSubscription IDをJSON配列としてSecretへ登録すると、その端末だけが通知対象になります。

### 公開データ

収集結果は `reports` ブランチに保存されます。リポジトリが公開されているため、顧客名、販売店個別情報、社内価格、社内修理資料は絶対に含めません。社内資料連携は認証付きの非公開保管先を用意する第2段階で実施します。

### ローカル検証

```bash
npm test
npm run validate:reports -- path/to/report-store
```

## 連絡先

オーレック関東営業G  担当:   

