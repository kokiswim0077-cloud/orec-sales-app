import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const oneSignalQueueIndex = html.indexOf("window.OneSignalDeferred = window.OneSignalDeferred || [];");
const oneSignalSdkIndex = html.indexOf("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js");
if (oneSignalQueueIndex < 0 || oneSignalSdkIndex < 0 || oneSignalQueueIndex > oneSignalSdkIndex) {
  throw new Error("OneSignal deferred queue must be created before the SDK script loads");
}
const oneSignalInitIndex = html.indexOf("window.OneSignalDeferred.push(async function(OneSignal)");
if (oneSignalInitIndex < 0 || oneSignalInitIndex > oneSignalSdkIndex) {
  throw new Error("OneSignal initialization must be queued in the document head before the SDK executes");
}
if (!html.includes("serviceWorkerPath: 'sales/push/onesignal/OneSignalSDKWorker.js'")) {
  throw new Error("OneSignal service worker path must be relative to the site root without a leading slash");
}
const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] || "";
const scriptSrc = csp.match(/(?:^|;\s*)script-src\s+([^;]+)/)?.[1] || "";
if (!scriptSrc.split(/\s+/).includes("https://api.onesignal.com")) {
  throw new Error("CSP script-src must allow the OneSignal JSONP configuration endpoint");
}
if (!html.includes("data-onesignal-ready', 'true'") || !html.includes("data-onesignal-ready', 'error'")) {
  throw new Error("OneSignal initialization status marker is missing");
}
if (!html.includes("intelReloadOneSignalSdk") || !html.includes("OneSignal CDNへ接続できませんでした。")) {
  throw new Error("OneSignal SDK retry handling is missing");
}
let inlineCount = 0;
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (!match[1].trim()) continue;
  inlineCount += 1;
  Function(match[1]);
}
const ids = [...html.matchAll(/\bid="([A-Za-z][A-Za-z0-9_:.-]*)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((value, index) => ids.indexOf(value) !== index))];
if (duplicateIds.length) throw new Error(`Duplicate HTML IDs: ${duplicateIds.join(", ")}`);
for (const required of ["s-home", "s-intel", "intel-home-card", "intel-report", "intel-pr-points", "intel-competitive", "intel-unconventional", "intel-notify-btn"]) {
  if (!ids.includes(required)) throw new Error(`Required UI element is missing: ${required}`);
}
Function(fs.readFileSync("sw.js", "utf8"));
console.log(`HTML check passed: ${inlineCount} inline script block(s), ${ids.length} unique IDs.`);
