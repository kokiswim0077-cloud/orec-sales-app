import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  dedupeFindings,
  dedupeSources,
  notificationIdempotencyKey,
  sanitizeRepairInfo,
  themeForDate,
  validateReport
} from "../scripts/lib/reporting.mjs";

test("曜日ごとのテーマを日本時間で選ぶ", () => {
  assert.equal(themeForDate(new Date("2026-08-03T09:00:00+09:00")).key, "kanto-demand");
  assert.equal(themeForDate(new Date("2026-08-04T09:00:00+09:00")).key, "repair-triage");
  assert.equal(themeForDate(new Date("2026-08-09T09:00:00+09:00")).key, "weekly-plan");
});

test("追跡パラメータを除去して同じ出典を重複排除する", () => {
  const sources = dedupeSources([
    { url: "https://example.com/news/?utm_source=test", title: "A" },
    { url: "https://example.com/news", title: "B" }
  ]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, "https://example.com/news");
});

test("同一内容の調査結果を重複排除する", () => {
  assert.deepEqual(dedupeFindings(["同じ内容", "同じ内容", "別の内容"]), ["同じ内容", "別の内容"]);
});

test("危険手順と安全条件不足の修理項目を除外する", () => {
  const warnings = [];
  const safe = sanitizeRepairInfo([
    { modelScope: "WMシリーズ公式資料範囲", stopConditions: ["エンジン停止"], escalation: "販売店へ", safeAction: "外観確認" },
    { modelScope: "全機種", stopConditions: ["確認"], escalation: "なし", safeAction: "安全装置を解除して確認" },
    { modelScope: "", stopConditions: [], escalation: "" }
  ], warnings);
  assert.equal(safe.length, 1);
  assert.equal(warnings.length, 2);
});

test("サンプルレポートが公開スキーマを満たす", async () => {
  const report = JSON.parse(await fs.readFile(new URL("./fixtures/report.json", import.meta.url), "utf8"));
  assert.deepEqual(validateReport(report), []);
  assert.equal(report.salesPlaybook.nextActions.length, 3);
  assert.ok(report.productPrPoints.length >= 1);
  assert.ok(report.competitiveInsights.length >= 1);
  assert.ok(report.unconventionalAngle.dealerExperiment);
});

test("拡張前の過去レポートも引き続き検証できる", async () => {
  const report = JSON.parse(await fs.readFile(new URL("./fixtures/report.json", import.meta.url), "utf8"));
  delete report.productPrPoints;
  delete report.competitiveInsights;
  delete report.unconventionalAngle;
  assert.deepEqual(validateReport(report), []);
});

test("通知の冪等キーは日付ごとに安定したUUIDになる", () => {
  const key = notificationIdempotencyKey("2026-08-08");
  assert.equal(key, notificationIdempotencyKey("2026-08-08"));
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
