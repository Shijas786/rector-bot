import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../db/prisma.js";
import { analyseToken } from "../pipeline/analyse.js";
import { disambiguatePrediction } from "../pipeline/disambiguate.js";
import { executePredictionPipeline } from "../index.js";

const server = new Server(
    {
        name: "rector-agent",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * List available tools for the Rector Agent.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "analyse_token",
                description: "Perform deep AI market analysis on a token via Binance data.",
                inputSchema: {
                    type: "object",
                    properties: {
                        symbol: { type: "string", description: "Token symbol (e.g. BNB, BTC)" },
                    },
                    required: ["symbol"],
                },
            },
            {
                name: "record_prediction",
                description: "Disambiguate and record a user prediction on-chain (BSC) and in the database.",
                inputSchema: {
                    type: "object",
                    properties: {
                        claim: { type: "string", description: "The raw prediction text (e.g. 'BNB hits $1000')" },
                        telegramId: { type: "string", description: "Telegram user ID" },
                        username: { type: "string", description: "Telegram username" },
                    },
                    required: ["claim", "telegramId", "username"],
                },
            },
        ],
    };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "analyse_token") {
            const { symbol } = args as { symbol: string };
            const result = await analyseToken(symbol);
            return {
                content: [{ type: "text", text: result.formattedMessage }],
            };
        }

        if (name === "record_prediction") {
            const { claim, telegramId, username } = args as {
                claim: string;
                telegramId: string;
                username: string;
            };

            // 1. Ensure user exists
            const user = await prisma.user.upsert({
                where: { telegramId },
                update: { username },
                create: { telegramId, username },
            });

            // 2. Disambiguate
            const disambiguation = await disambiguatePrediction(claim, "2026-12-31T23:59:00Z");

            // 3. Execute pipeline (on-chain + DB)
            const resultMessage = await executePredictionPipeline(user.id, telegramId, disambiguation);

            return {
                content: [{ type: "text", text: resultMessage }],
            };
        }

        throw new Error(`Tool not found: ${name}`);
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `❌ Error: ${error.message}` }],
            isError: true,
        };
    }
});

/**
 * Start the server using stdio transport.
 */
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Rector MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error starting MCP server:", error);
    process.exit(1);
});
