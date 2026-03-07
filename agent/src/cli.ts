import { prisma } from "./db/prisma.js";
import { analyseToken } from "./pipeline/analyse.js";
import { disambiguatePrediction } from "./pipeline/disambiguate.js";
import { executePredictionPipeline } from "./index.js";

/**
 * CLI Bridge for OpenClaw Skills
 * Allows OpenClaw to call agent tools via shell commands.
 * Usage: npx tsx src/cli.ts <tool_name> <json_args>
 */

async function main() {
    const [, , toolName, jsonArgs] = process.argv;

    if (!toolName) {
        console.error("Usage: npx tsx src/cli.ts <tool_name> <json_args>");
        process.exit(1);
    }

    const args = JSON.parse(jsonArgs || "{}");

    try {
        if (toolName === "analyse_token") {
            const { symbol } = args;
            const result = await analyseToken(symbol);
            console.log(result.formattedMessage);
        } else if (toolName === "record_prediction") {
            const { claim, telegramId, username } = args;

            // 1. Ensure user exists
            const user = await prisma.user.upsert({
                where: { telegramId: String(telegramId) },
                update: { username },
                create: { telegramId: String(telegramId), username },
            });

            // 2. Disambiguate
            const disambiguation = await disambiguatePrediction(claim, "2026-12-31T23:59:00Z");

            // 3. Execute pipeline
            const resultMessage = await executePredictionPipeline(user.id, String(telegramId), disambiguation);
            console.log(resultMessage);
        } else {
            console.error(`Unknown tool: ${toolName}`);
            process.exit(1);
        }
    } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

main();
