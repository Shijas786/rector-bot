import "dotenv/config";
import { mcpClient } from "./mcp/client.js";

async function main() {
    await mcpClient.connect();
    const tools = await mcpClient.listTools();
    console.dir(tools, { depth: null });
    process.exit(0);
}

main().catch(console.error);
