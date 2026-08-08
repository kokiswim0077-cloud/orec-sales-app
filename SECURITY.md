# Security Notes

## 現在の対策

- 外部CDNの JavaScript は SRI と `crossorigin="anonymous"` で改ざん検知する。
- CSP と Referrer-Policy を `index.html` に設定する。
- 外部リンクは `noopener,noreferrer` を付ける。
- Gemini API キーは URL クエリに載せず、`x-goog-api-key` ヘッダーで送信する。
- 見積書/引合書の簡易認証キーは SHA-256 形式へ移行する。
- 保存済み Gemini API キーと Excel 保存先は画面から削除できる。
- `.env` や秘密鍵ファイルは Git 管理対象外にする。
- GeminiとOneSignalの秘密値はGitHub Actions Secretsだけで管理し、公開HTMLやレポートJSONへ埋め込まない。
- 日次レポートに使用できるのは公開情報だけとし、顧客名・販売店個別情報・社内価格・社内修理資料を `reports` ブランチへ保存しない。
- Web Pushは全購読者向けセグメントではなく、`ONESIGNAL_SUBSCRIPTION_IDS` に登録した端末だけへ送信する。

## 運用ルール

- 共有 PC では Gemini API キーを保存しない。保存した場合は使用後にホーム画面または API キー設定画面から削除する。
- Excel 保存先を変更・解除したい場合は、ホーム画面の `Excel保存先` から再選択または解除する。
- GitHub に API キー、パスワード、OneDrive 同期フォルダ内の私的ファイルを追加しない。
- Actionsログにプロンプト全文、API応答ヘッダー、Subscription ID、秘密値を出力しない。
- 社外共有する前に、`rg "AIza|AQ|sk-|BEGIN .*PRIVATE|password|api[_-]?key"` で秘密情報が混入していないか確認する。

## 残るリスクと次の改善候補

- Gemini API キーはブラウザ保存のため、端末を共有する運用では漏えいリスクが残る。より強くする場合は、API キーを Cloudflare Workers / Lambda / 社内サーバー側に置き、ブラウザから直接扱わない。
- 引合書・見積書タブの認証はフロントエンド上の簡易ロックであり、本格的なアクセス制御ではない。社外公開や厳格な権限制御が必要なら、Microsoft Entra ID などのログイン認証を導入する。
- SharePoint/OneDrive の共有リンクはアプリ内に含まれる。リンク自体で認証を突破できない前提だが、必要ならリンクをアプリ外の社内設定に移す。
- `index.html` はインラインイベント/スクリプトを多用しているため、CSP から `'unsafe-inline'` を完全に外せていない。将来的には JavaScript を分離し、イベントリスナー方式へ移行する。
- OneSignal Web SDKは継続更新されるService Workerを公式CDNから読み込むためSRIを固定できない。CSPで接続先をOneSignal公式ドメインに限定し、Workerは同一オリジンの専用パスから登録する。
- 社内資料を扱う第2段階では、公開GitHubから分離した非公開ストレージ、本人認証、API認可、監査ログを先に導入する。
