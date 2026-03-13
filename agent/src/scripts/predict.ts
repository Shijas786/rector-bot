#!/usr/bin/env tsx
/**
 * CLI wrapper for the record_prediction pipeline.
 * Usage: npx tsx src/scripts/predict.ts "BNB hits $900" "123456789" "username"
 */
import "dotenv/config";
import { prisma } from "../db/prisma.js";
import { disambiguatePrediction, formatDisambiguation } from "../pipeline/disambiguate.js";
import { executePredictionPipeline, extractResolutionDate } from "../index.js";

const claim = process.argv[2];
const telegramId = process.argv[3];
const username = process.argv[4];

if (!claim || !telegramId || !username) {
    console.error('Usage: npx tsx src/scripts/predict.ts "<CLAIM>" "<TELEGRAM_ID>" "<USERNAME>"');
    process.exit(1);
}

try {
    // 1. Ensure user exists
    const user = await prisma.user.upsert({
        where: { telegramId },
        update: { username },
        create: { telegramId, username },
    });

    // 2. Disambiguate
    const resolutionDate = extractResolutionDate(claim);
    const disambiguation = await disambiguatePrediction(claim, resolutionDate);

    // 3. Execute pipeline (on-chain + DB)
    const resultMessage = await executePredictionPipeline(user.id, telegramId, disambiguation);

    console.log(resultMessage);
} catch (error: any) {
    console.error(`❌ Prediction failed: ${error.message}`);
    process.exit(1);
}
