import crypto from "node:crypto";

export const JST = "Asia/Tokyo";

export const THEME_ROTATION = [
  { key: "weekly-plan", label: "週間まとめと翌週の訪問計画" },
  { key: "kanto-demand", label: "関東の需要・季節・市場兆候" },
  { key: "repair-triage", label: "修理初動と故障切り分け" },
  { key: "dealer-demo", label: "販売店訪問・展示・実演提案" },
  { key: "use-case", label: "用途別製品提案と必要に応じた競合比較" },
  { key: "sales-talk", label: "商談トーク、反論対応、追加提案" },
  { key: "safety-care", label: "安全、保守、繁忙期準備" }
];

const DANGEROUS_PATTERNS = [
  /安全装置.{0,8}(解除|無効|外す)/,
  /(エンジン|モーター).{0,12}(かけたまま|回したまま)/,
  /バッテリ[ー]?.{0,12}(装着したまま|接続したまま)/,
  /刃.{0,8}(回転中|動作中).{0,8}(触|確認)/
];

export function nowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return parts;
}

export function jstDateId(date = new Date()) {
  const p = nowParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function jstPathParts(date = new Date()) {
  const p = nowParts(date);
  return { year: p.year, month: p.month, day: p.day, hhmm: `${p.hour}${p.minute}` };
}

export function themeForDate(date = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: JST, weekday: "short" }).format(date);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return THEME_ROTATION[index < 0 ? 0 : index];
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function stableSourceId(url) {
  return `src-${sha256(normalizeUrl(url)).slice(0, 12)}`;
}

export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"].forEach(key => url.searchParams.delete(key));
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

export function dedupeSources(sources = []) {
  const seen = new Set();
  const result = [];
  for (const raw of sources) {
    const url = normalizeUrl(raw?.url || raw?.uri || "");
    if (!url || !url.startsWith("https://") || seen.has(url)) continue;
    seen.add(url);
    result.push({
      id: raw.id || stableSourceId(url),
      title: String(raw.title || new URL(url).hostname).slice(0, 180),
      url,
      publisher: String(raw.publisher || new URL(url).hostname).slice(0, 120),
      publishedAt: raw.publishedAt || null,
      accessedAt: raw.accessedAt || new Date().toISOString(),
      type: raw.type || "web"
    });
  }
  return result;
}

export function dedupeFindings(findings = []) {
  const seen = new Set();
  return findings.filter(item => {
    const text = typeof item === "string" ? item : item?.fact || item?.title || JSON.stringify(item);
    const key = sha256(String(text).trim().toLowerCase());
    if (!text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sanitizeRepairInfo(items = [], warnings = []) {
  const safe = [];
  for (const item of items) {
    const combined = JSON.stringify(item || {});
    const unsafe = DANGEROUS_PATTERNS.some(pattern => pattern.test(combined));
    const hasScope = String(item?.modelScope || "").trim().length > 0;
    const hasSafety = Array.isArray(item?.stopConditions) && item.stopConditions.length > 0;
    const hasEscalation = String(item?.escalation || "").trim().length > 0;
    if (unsafe || !hasScope || !hasSafety || !hasEscalation) {
      warnings.push("安全条件または対象機種が不十分な修理項目を除外しました。");
      continue;
    }
    safe.push(item);
  }
  return safe;
}

export function validateObservation(value) {
  const errors = [];
  if (!value || typeof value !== "object") return ["observation must be an object"];
  if (value.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!value.id) errors.push("id is required");
  if (!value.collectedAt || Number.isNaN(Date.parse(value.collectedAt))) errors.push("collectedAt must be an ISO date");
  if (!value.theme) errors.push("theme is required");
  if (!Array.isArray(value.findings)) errors.push("findings must be an array");
  if (!Array.isArray(value.sources)) errors.push("sources must be an array");
  return errors;
}

export function validateReport(value) {
  const errors = [];
  if (!value || typeof value !== "object") return ["report must be an object"];
  if (value.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.id || "")) errors.push("id must be YYYY-MM-DD");
  if (!value.publishedAt || Number.isNaN(Date.parse(value.publishedAt))) errors.push("publishedAt must be an ISO date");
  if (!value.theme?.key || !value.theme?.label || !value.theme?.headline) errors.push("theme is incomplete");
  if (!Array.isArray(value.summary) || value.summary.length < 1 || value.summary.length > 3) errors.push("summary must contain 1-3 items");
  if (!Array.isArray(value.marketSignals)) errors.push("marketSignals must be an array");
  if (!Array.isArray(value.productPrPoints)) errors.push("productPrPoints must be an array");
  if (!Array.isArray(value.competitiveInsights)) errors.push("competitiveInsights must be an array");
  if (!value.unconventionalAngle || typeof value.unconventionalAngle !== "object") errors.push("unconventionalAngle is required");
  if (!Array.isArray(value.repairInfo)) errors.push("repairInfo must be an array");
  if (!value.salesPlaybook || typeof value.salesPlaybook !== "object") errors.push("salesPlaybook is required");
  if (!Array.isArray(value.sources) || value.sources.length < 1) errors.push("at least one source is required");
  if (!Array.isArray(value.warnings)) errors.push("warnings must be an array");
  return errors;
}

export function extractGroundingSources(response, accessedAt = new Date().toISOString()) {
  const candidate = response?.candidates?.[0];
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  return dedupeSources(chunks.map(chunk => ({
    title: chunk?.web?.title,
    url: chunk?.web?.uri,
    publisher: chunk?.web?.title,
    accessedAt,
    type: "google-search"
  })));
}

export function extractText(response) {
  return (response?.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("\n").trim();
}

export function parseJsonText(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(cleaned);
}

export function notificationIdempotencyKey(dateId) {
  const hex = sha256(`orec-sales-report:${dateId}`).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = (["8", "9", "a", "b"][parseInt(hex[16], 16) % 4]);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
