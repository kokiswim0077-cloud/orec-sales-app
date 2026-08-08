function localizedJapanese(value) {
  const text = String(value || "");
  return { en: text, ja: text };
}

export function buildReportNotificationPayload({ appId, subscriptionIds, report, baseUrl, dateId, idempotencyKey }) {
  const reportUrl = `${baseUrl}?report=${encodeURIComponent(dateId)}`;
  return {
    app_id: appId,
    include_subscription_ids: subscriptionIds,
    target_channel: "push",
    headings: localizedJapanese(`OREC営業｜${report.theme.label}`),
    contents: localizedJapanese(report.summary[0].slice(0, 120)),
    web_url: reportUrl,
    chrome_web_icon: `${baseUrl}icons/icon-192.png`,
    idempotency_key: idempotencyKey
  };
}

export function buildFailureNotificationPayload({ appId, subscriptionIds, workflow, runUrl }) {
  return {
    app_id: appId,
    include_subscription_ids: subscriptionIds,
    target_channel: "push",
    headings: localizedJapanese("OREC営業情報｜更新エラー"),
    contents: localizedJapanese(`${workflow}に失敗しました。前回の正常レポートは保持されています。`),
    web_url: runUrl
  };
}
