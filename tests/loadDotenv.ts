/**
 * Preload for Node/tsx runs: Vite loads `.env` automatically; plain `tsx` does not.
 * Import this module first so `src/config/env.ts` sees `VITE_*` from the project `.env`.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  config({ path: envPath, quiet: true });
}
