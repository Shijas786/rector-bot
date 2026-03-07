#!/usr/bin/env tsx
/**
 * CLI wrapper for the analyse_token pipeline.
 * Usage: npx tsx src/scripts/analyse.ts BNB
 */
import "dotenv/config";
import { analyseToken } from "../pipeline/analyse.js";

const symbol = process.argv[2];
if (!symbol) {
    console.error("Usage: npx tsx src/scripts/analyse.ts <SYMBOL>");
    process.exit(1);
}

try {
    const result = await analyseToken(symbol);
    console.log(result.formattedMessage);
} catch (error: any) {
    console.error(`❌ Analysis failed: ${error.message}`);
    process.exit(1);
}
