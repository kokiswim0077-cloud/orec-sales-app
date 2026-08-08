import fs from "node:fs/promises";
import path from "node:path";
import { generateWithGemini } from "./lib/gemini.mjs";
import {
  dedupeFindings,
  dedupeSources,
  extractGroundingSources,
  extractText,
  jstPathParts,
  normalizeUrl,
  nowParts,
  sha256,
  themeForDate,
  validateObservation
} from "./lib/reporting.mjs";

const getArg = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const dataDir = path.resolve(getArg("--data-dir") || process.env.REPORTS_DATA_DIR || "report-store");
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const theme = themeForDate(now);
const clock = nowParts(now);
const p = jstPathParts(now);
const collectedAt = now.toISOString();
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const commonRules = `現在は日本時間 ${p.year}-${p.month}-${p.day} ${clock.hour}:${clock.minute}、テーマは「${theme.label}」です。必ずGoogle検索ツールを実行し、公開された一次情報を優先してください。匿名投稿、顧客名、販売店個別情報、社内価格、社内修理情報は使わないでください。事実と営業提案を区別し、安全装置解除、稼働中の点検、対象機種不明の分解手順は書かないでください。日本語の短い調査メモとしてください。`;
const prompts = [
  `株式会社オーレックの公式サイト、公式ニュース、公開取扱説明書をGoogle検索してください。${commonRules} 新情報がなければ、季節に合う製品・安全・保守情報を公式資料から選んでください。`,
  `関東地域の草刈り・農業・緑地管理に関する直近情報を、農林水産省、自治体、業界団体などの公式サイトでGoogle検索してください。${commonRules} マキタ草刈機は、今回の営業・修理テーマに明確な関連がある公式情報が見つかった場合だけ補足してください。`
];
const results = await Promise.allSettled(prompts.map(item => generateWithGemini({
  prompt: item,
  apiKey: process.env.GEMINI_API_KEY,
  model,
  googleSearch: true
})));
const grounded = results.filter(item => item.status === "fulfilled").map(item => ({
  text: extractText(item.value),
  sources: extractGroundingSources(item.value, collectedAt)
})).filter(item => item.text && item.sources.length > 0);
let text = grounded.map(item => item.text).join("\n\n---\n\n");
let sources = dedupeSources(grounded.flatMap(item => item.sources));
if (!text || sources.length === 0) throw new Error("Grounded research returned no usable text or sources");

const sourceHashesPath = path.join(dataDir, "state", "source-hashes.json");
let sourceState = { schemaVersion: 1, hashes: {} };
try { sourceState = JSON.parse(await fs.readFile(sourceHashesPath, "utf8")); } catch {}

const freshSources = sources.filter(source => {
  const key = sha256(normalizeUrl(source.url));
  return !sourceState.hashes[key];
});
for (const source of sources) sourceState.hashes[sha256(normalizeUrl(source.url))] = collectedAt;

const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
sourceState.hashes = Object.fromEntries(Object.entries(sourceState.hashes).filter(([, date]) => Date.parse(date) >= cutoff));

const observation = {
  schemaVersion: 1,
  id: `${p.year}-${p.month}-${p.day}T${p.hhmm}+09:00`,
  collectedAt,
  theme: theme.label,
  researchText: text,
  findings: dedupeFindings(text.split("\n").map(line => line.replace(/^[-*#\s]+/, "").trim()).filter(line => line.length >= 20).slice(0, 30)),
  sources,
  freshSourceIds: freshSources.map(source => source.id),
  warnings: freshSources.length === 0 ? ["今回の収集では新規URLがなく、既知情報を再確認しました。"] : [],
  generator: { provider: "gemini", model }
};
const errors = validateObservation(observation);
if (errors.length) throw new Error(`Observation validation failed: ${errors.join("; ")}`);

const observationPath = path.join(dataDir, "observations", p.year, p.month, p.day, `${p.hhmm}.json`);
await fs.mkdir(path.dirname(observationPath), { recursive: true });
await fs.mkdir(path.dirname(sourceHashesPath), { recursive: true });
await fs.writeFile(observationPath, `${JSON.stringify(observation, null, 2)}\n`, "utf8");
await fs.writeFile(sourceHashesPath, `${JSON.stringify(sourceState, null, 2)}\n`, "utf8");
console.log(`Saved ${observationPath} with ${sources.length} cited sources (${freshSources.length} new).`);
