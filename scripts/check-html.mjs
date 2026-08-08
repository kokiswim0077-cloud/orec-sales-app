import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const oneSignalQueueIndex = html.indexOf("window.OneSignalDeferred = window.OneSignalDeferred || [];");
const oneSignalSdkIndex = html.indexOf("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js");
if (oneSignalQueueIndex < 0 || oneSignalSdkIndex < 0 || oneSignalQueueIndex > oneSignalSdkIndex) {
  throw new Error("OneSignal deferred queue must be created before the SDK script loads");
}
if (!html.includes("intelGetOneSignal().catch(function(error)")) {
  throw new Error("OneSignal initialization must be queued during page parsing");
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
for (const required of ["s-home", "s-intel", "intel-home-card", "intel-report", "intel-notify-btn"]) {
  if (!ids.includes(required)) throw new Error(`Required UI element is missing: ${required}`);
}
Function(fs.readFileSync("sw.js", "utf8"));
console.log(`HTML check passed: ${inlineCount} inline script block(s), ${ids.length} unique IDs.`);
