import fs from "node:fs/promises";
import path from "node:path";
import { generateWithGemini } from "./lib/gemini.mjs";
import {
  dedupeSources,
  jstDateId,
  parseJsonText,
  sanitizeRepairInfo,
  themeForDate,
  validateObservation,
  validateReport
} from "./lib/reporting.mjs";

const getArg = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const dataDir = path.resolve(getArg("--data-dir") || process.env.REPORTS_DATA_DIR || "report-store");
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const dateId = jstDateId(now);
const theme = themeForDate(now);
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const observationRoot = path.join(dataDir, "observations");

async function listJsonFiles(dir) {
  const result = [];
  async function walk(current) {
    let entries = [];
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.name.endsWith(".json")) result.push(target);
    }
  }
  await walk(dir);
  return result;
}

const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
const observations = [];
for (const file of await listJsonFiles(observationRoot)) {
  try {
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    if (validateObservation(value).length === 0 && Date.parse(value.collectedAt) >= cutoff) observations.push(value);
  } catch {}
}
observations.sort((a, b) => Date.parse(a.collectedAt) - Date.parse(b.collectedAt));
if (!observations.length) throw new Error("No valid observations from the last 24 hours; previous report was preserved");

const sources = dedupeSources(observations.flatMap(item => item.sources));
const sourceIds = new Set(sources.map(source => source.id));
const compact = observations.map(item => ({
  collectedAt: item.collectedAt,
  theme: item.theme,
  researchText: item.researchText,
  findings: item.findings,
  sourceIds: item.sources.map(source => source.id)
}));

const prompt = `
以下は過去24時間に4回まで収集した、公開情報だけの調査メモです。オーレック関東営業担当が3分で読める日次レポートを作ってください。
本日のテーマ: ${theme.label}
日付: ${dateId}

利用可能な出典:
${JSON.stringify(sources)}

調査メモ:
${JSON.stringify(compact)}

JSONだけを返してください。形は次の通りです。
{
  "theme": {"headline":"短い見出し"},
  "summary": ["3行以内の要点"],
  "marketSignals": [{"title":"", "detail":"", "confidence":"high|medium|reference", "sourceIds":[""]}],
  "repairInfo": [{"brand":"OREC|Makita|共通", "modelScope":"具体的な対象機種または公式資料の範囲", "symptom":"", "checks":[""], "safeAction":"", "stopConditions":["エンジン停止・電源遮断等"], "escalation":"販売店・サービス部門へ渡す条件", "sourceIds":[""]}],
  "salesPlaybook": {"dealerValue":"", "questions":[""], "talkTrack":"30秒程度", "objectionHandling":[{"objection":"", "response":""}], "nextActions":["必ず3件"]},
  "makitaRelevance": null または {"summary":"", "sourceIds":[""]},
  "warnings": [""]
}

ルール:
- sourceIdsは上記の利用可能な出典IDだけを使用する
- 事実には必ずsourceIdsを付け、出典のない断定はしない
- 修理情報は対象範囲、安全停止条件、専門部門への引継条件が揃わなければ含めない
- 安全装置解除、稼働中の点検、対象不明の分解手順は禁止
- マキタは関連性が明確な場合だけ。競合への否定的な断定は禁止
- 営業提案と確認済み事実を混同しない
`;

const response = await generateWithGemini({ prompt, apiKey: process.env.GEMINI_API_KEY, model, json: true });
const raw = parseJsonText(response?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n"));
const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(String) : [];
const repairInfo = sanitizeRepairInfo(Array.isArray(raw.repairInfo) ? raw.repairInfo : [], warnings);

function validSourceIds(ids) {
  return Array.isArray(ids) && ids.filter(id => sourceIds.has(id));
}
const marketSignals = (Array.isArray(raw.marketSignals) ? raw.marketSignals : []).map(item => ({
  ...item,
  sourceIds: validSourceIds(item.sourceIds)
})).filter(item => item.sourceIds.length > 0);
for (const item of repairInfo) item.sourceIds = validSourceIds(item.sourceIds);
const safeRepairInfo = repairInfo.filter(item => item.sourceIds.length > 0);
let makitaRelevance = raw.makitaRelevance || null;
if (makitaRelevance) {
  makitaRelevance.sourceIds = validSourceIds(makitaRelevance.sourceIds);
  if (!makitaRelevance.sourceIds.length) makitaRelevance = null;
}

const report = {
  schemaVersion: 1,
  id: dateId,
  publishedAt: now.toISOString(),
  theme: { key: theme.key, label: theme.label, headline: String(raw.theme?.headline || theme.label).slice(0, 100) },
  summary: (Array.isArray(raw.summary) ? raw.summary : []).map(String).filter(Boolean).slice(0, 3),
  marketSignals,
  repairInfo: safeRepairInfo,
  salesPlaybook: {
    dealerValue: String(raw.salesPlaybook?.dealerValue || ""),
    questions: (raw.salesPlaybook?.questions || []).map(String).slice(0, 5),
    talkTrack: String(raw.salesPlaybook?.talkTrack || ""),
    objectionHandling: (raw.salesPlaybook?.objectionHandling || []).slice(0, 4),
    nextActions: (raw.salesPlaybook?.nextActions || []).map(String).filter(Boolean).slice(0, 3)
  },
  makitaRelevance,
  sources,
  warnings: [...new Set(warnings)],
  generator: { provider: "gemini", model, observationCount: observations.length }
};
const errors = validateReport(report);
if (report.salesPlaybook.nextActions.length !== 3) errors.push("salesPlaybook.nextActions must contain exactly 3 items");
if (errors.length) throw new Error(`Report validation failed: ${errors.join("; ")}`);

const [year, month, day] = dateId.split("-");
const reportPath = path.join(dataDir, "reports", year, month, `${day}.json`);
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const indexPath = path.join(dataDir, "index.json");
let index = { schemaVersion: 1, generatedAt: report.publishedAt, latestId: dateId, reports: [] };
try { index = JSON.parse(await fs.readFile(indexPath, "utf8")); } catch {}
const entry = { id: dateId, publishedAt: report.publishedAt, theme: report.theme.label, headline: report.theme.headline, path: `reports/${year}/${month}/${day}.json` };
index.reports = [entry, ...(index.reports || []).filter(item => item.id !== dateId)].slice(0, 365);
index.schemaVersion = 1;
index.generatedAt = report.publishedAt;
index.latestId = dateId;
await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

async function pruneFiles(root, cutoffMs) {
  for (const file of await listJsonFiles(root)) {
    try {
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      const timestamp = Date.parse(value.collectedAt || value.publishedAt || "");
      if (Number.isFinite(timestamp) && timestamp < cutoffMs) await fs.rm(file);
    } catch {}
  }
}
await pruneFiles(path.join(dataDir, "observations"), now.getTime() - 30 * 24 * 60 * 60 * 1000);
await pruneFiles(path.join(dataDir, "reports"), now.getTime() - 365 * 24 * 60 * 60 * 1000);
console.log(`Published ${reportPath} from ${observations.length} observations and ${sources.length} sources.`);
