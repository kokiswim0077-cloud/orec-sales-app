const appId = process.env.ONESIGNAL_APP_ID;
const apiKey = process.env.ONESIGNAL_API_KEY;
let subscriptionIds = [];
try { subscriptionIds = JSON.parse(process.env.ONESIGNAL_SUBSCRIPTION_IDS || "[]"); } catch {}
if (!appId || !apiKey || !subscriptionIds.length) {
  console.log("OneSignal failure notification skipped because configuration is incomplete.");
  process.exit(0);
}
const workflow = process.env.GITHUB_WORKFLOW || "営業情報ワークフロー";
const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : (process.env.PUBLIC_BASE_URL || "https://dkl5pcrrq8gba.cloudfront.net/sales/");
const response = await fetch("https://api.onesignal.com/notifications", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
  body: JSON.stringify({
    app_id: appId,
    include_subscription_ids: subscriptionIds,
    target_channel: "push",
    headings: { ja: "OREC営業情報｜更新エラー" },
    contents: { ja: `${workflow}に失敗しました。前回の正常レポートは保持されています。` },
    url: runUrl,
    web_url: runUrl
  }),
  signal: AbortSignal.timeout(30_000)
});
if (!response.ok) throw new Error(`OneSignal failure notification failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
console.log("Sent workflow failure notification.");
