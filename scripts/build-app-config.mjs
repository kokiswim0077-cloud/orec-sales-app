import fs from "node:fs/promises";
import path from "node:path";

const output = path.resolve(process.argv[2] || "dist/app-config.js");
const config = {
  reportIndexUrl: process.env.REPORT_INDEX_URL || "https://raw.githubusercontent.com/kokiswim0077-cloud/orec-sales-app/reports/index.json",
  reportBaseUrl: process.env.REPORT_BASE_URL || "https://raw.githubusercontent.com/kokiswim0077-cloud/orec-sales-app/reports/",
  oneSignalAppId: process.env.ONESIGNAL_APP_ID || "",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "https://dkl5pcrrq8gba.cloudfront.net/sales/"
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `window.OREC_SALES_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`, "utf8");
console.log(`Wrote public app configuration to ${output}`);
