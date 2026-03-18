import { mcpClient } from "./mcp/client.js";
import dotenv from "dotenv";
dotenv.config();

async function checkAccount() {
    await mcpClient.connect();
    // Wait longer for the server to initialize tools
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
        const { ethers } = await import("ethers");
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "");
        const address = wallet.address;
        console.log(`Checking Greenfield Testnet account for: ${address}`);

        // Try to get tools again
        const id = 999;
        const msg = JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/list"
        }) + "\n";
        
        // Use raw access if possible
        const result = await mcpClient.callTool("list_tools", {}) as any;
        console.log("Tools Result:", JSON.stringify(result, null, 2));

    } catch (e: any) {
        console.error("Error checking account:", e.message);
    } finally {
        await mcpClient.disconnect();
    }
}

checkAccount();
