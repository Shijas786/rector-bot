import "dotenv/config";
import { mcpClient } from "./mcp/client.js";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

async function main() {
    await mcpClient.connect();

    // Check if the tool exists via listTools
    const tools = await mcpClient.listTools();
    const toolNames = tools.tools.map((t: any) => t.name);
    console.log("Tools available:", toolNames.join(", "));

    const fileTool = tools.tools.find((t: any) => t.name === "gnfd_create_file");
    console.dir(fileTool, { depth: null });

    process.exit(0);
}

main();
