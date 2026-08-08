import fs from "node:fs/promises";
import path from "node:path";
import { validateObservation, validateReport } from "./lib/reporting.mjs";

const root = path.resolve(process.argv[2] || process.env.REPORTS_DATA_DIR || "report-store");
let checked = 0;
let failed = 0;

async function walk(dir) {
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (entry.name.endsWith(".json") && /[\\/](reports|observations)[\\/]/.test(target)) {
      checked += 1;
      try {
        const value = JSON.parse(await fs.readFile(target, "utf8"));
        const errors = target.includes(`${path.sep}observations${path.sep}`) ? validateObservation(value) : validateReport(value);
        if (errors.length) { failed += 1; console.error(`${target}: ${errors.join("; ")}`); }
      } catch (error) { failed += 1; console.error(`${target}: ${error.message}`); }
    }
  }
}
await walk(root);
console.log(`Validated ${checked} report data files; ${failed} failed.`);
if (failed) process.exit(1);
