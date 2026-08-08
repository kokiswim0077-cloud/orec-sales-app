import fs from "node:fs/promises";
import path from "node:path";
import { jstDateId, notificationIdempotencyKey } from "./lib/reporting.mjs";

const getArg = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const dataDir = path.resolve(getArg("--data-dir") || process.env.REPORTS_DATA_DIR || "report-store");
const dateId = getArg("--date") || jstDateId(process.env.NOW ? new Date(process.env.NOW) : new Date());
const [year, month, day] = dateId.split("-");
const report = JSON.parse(await fs.readFile(path.join(dataDir, "reports", year, month, `${day}.json`), "utf8"));
const statePath = path.join(dataDir, "state", "notified.json");
let state = { schemaVersion: 1, dates: {} };
try { state = JSON.parse(await fs.readFile(statePath, "utf8")); } catch {}
if (state.dates?.[dateId]?.status === "sent") {
  console.log(`Notification for ${dateId} already sent; skipping.`);
  process.exit(0);
}

const appId = process.env.ONESIGNAL_APP_ID;
const apiKey = process.env.ONESIGNAL_API_KEY;
const subscriptionIds = JSON.parse(process.env.ONESIGNAL_SUBSCRIPTION_IDS || "[]");
const baseUrl = (process.env.PUBLIC_BASE_URL || "https://dkl5pcrrq8gba.cloudfront.net/sales/").replace(/\/?$/, "/");
if (!appId || !apiKey || !Array.isArray(subscriptionIds) || !subscriptionIds.length) {
  throw new Error("OneSignal configuration is incomplete (ONESIGNAL_APP_ID, ONESIGNAL_API_KEY, ONESIGNAL_SUBSCRIPTION_IDS)");
}

const response = await fetch("https://api.onesignal.com/notifications", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
  body: JSON.stringify({
    app_id: appId,
    include_subscription_ids: subscriptionIds,
    target_channel: "push",
    headings: { ja: `OREC営業｜${report.theme.label}` },
    contents: { ja: report.summary[0].slice(0, 120) },
    url: `${baseUrl}?report=${encodeURIComponent(dateId)}`,
    web_url: `${baseUrl}?report=${encodeURIComponent(dateId)}`,
    chrome_web_icon: `${baseUrl}icons/icon-192.png`,
    idempotency_key: notificationIdempotencyKey(dateId)
  }),
  signal: AbortSignal.timeout(30_000)
});
const body = await response.text();
if (!response.ok) throw new Error(`OneSignal API ${response.status}: ${body.slice(0, 500)}`);
const result = JSON.parse(body);
state.dates ||= {};
state.dates[dateId] = { status: "sent", sentAt: new Date().toISOString(), notificationId: result.id || null };
const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
state.dates = Object.fromEntries(Object.entries(state.dates).filter(([date]) => Date.parse(`${date}T00:00:00Z`) >= cutoff));
await fs.mkdir(path.dirname(statePath), { recursive: true });
await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
console.log(`Sent notification ${result.id || "(no id)"} for ${dateId}.`);
