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

const commonRules = `現在は日本時間 ${p.year}-${p.month}-${p.day} ${clock.hour}:${clock.minute}、テーマは「${theme.label}」です。必ずGoogle検索ツールを実行し、公開された一次情報を優先してください。匿名投稿、顧客名、販売店個別情報、社内価格、社内修理情報は使わないでください。事実、推測、営業提案を明確に区別し、出典のない優劣や他社批判は書かないでください。安全装置解除、稼働中の点検、対象機種不明の分解手順は書かないでください。日本語の短い調査メモとしてください。`;
const prompts = [
  `株式会社オーレックの公式サイト、公式ニュース、公開取扱説明書をGoogle検索してください。${commonRules} 製品機能を羅列せず、販売店や利用者にとっての価値へ変換できるPR根拠を探してください。新情報がなければ、季節に合う製品・安全・保守情報を公式資料から選んでください。`,
  `草刈機・自走式草刈機・緑地管理機に関係する他社の公式サイト、ニュース、製品ページ、取扱説明書をGoogle検索してください。対象例はマキタ、やまびこ、クボタ、イセキアグリ、ハスクバーナ、スチールですが、今回のテーマに関係する会社だけを扱ってください。${commonRules} 他社の新製品、販促、サポート、安全情報から「市場がどちらへ動いているか」と「オーレックが販売店へ提供できる機会」を抽出してください。`,
  `関東地域の草刈り・農業・緑地管理に関する直近情報を、農林水産省、自治体、業界団体などの公式サイトでGoogle検索してください。${commonRules} 需要の時期、作業者不足、気象、安全、補助制度、施設管理など、訪問先で質問に使える変化を探してください。`,
  `草刈機の直接情報だけでなく、猛暑、担い手不足、耕作放棄地、太陽光発電所、河川・道路・公園管理、防災、鳥獣対策、地域雇用など隣接分野の公的・公式情報をGoogle検索してください。${commonRules} オーレック営業に結びつく意外な仮説を1つ以上示し、小さく試せる販売店提案まで考えてください。`
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
