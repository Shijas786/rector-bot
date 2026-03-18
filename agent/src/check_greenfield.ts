import { mcpClient } from "./mcp/client.js";
import dotenv from "dotenv";
dotenv.config();

async function checkAccount() {
    await mcpClient.connect();
    try {
        const { ethers } = await import("ethers");
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "");
        const address = wallet.address;
        console.log(`Checking Greenfield Testnet account for: ${address}`);

        // Try to list tool to see what's available
        const toolsResult = await mcpClient.listTools() as any;
        const tools = toolsResult?.result?.tools || [];
        console.log("Available tools:", tools.map((t: any) => t.name));

        // Try to get account status
        const result = await mcpClient.callTool("gnfd_get_balance", {
            address: address,
            network: "testnet"
        }) as any;

        console.log("Balance Result:", JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error("Error checking account:", e.message);
    } finally {
        await mcpClient.disconnect();
    }
}

checkAccount();
