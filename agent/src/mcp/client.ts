import { spawn, ChildProcess } from "child_process";

/**
 * MCP Client — communicates with the BNB Chain MCP server.
 * Uses stdio transport (JSON-RPC over stdin/stdout).
 */

interface MCPRequest {
    jsonrpc: "2.0";
    id: number;
    method: string;
    params?: Record<string, unknown>;
}

interface MCPResponse {
    jsonrpc: "2.0";
    id: number;
    result?: unknown;
    error?: { code: number; message: string };
}

export class MCPClient {
    private process: ChildProcess | null = null;
    private requestId = 0;
    private pendingRequests = new Map<number, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }>();
    private buffer = "";

    async connect(): Promise<void> {
        if (this.process) return; // Prevent multiple connections
        
        console.log("[MCP] Spawning client process...");
        this.process = spawn("npx", ["-y", "@bnb-chain/mcp@latest"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                PRIVATE_KEY: process.env.PRIVATE_KEY || "",
            },
        });

        this.process.stdout?.on("data", (data: Buffer) => {
            this.buffer += data.toString();
            this.processBuffer();
        });

        this.process.stderr?.on("data", (data: Buffer) => {
            console.error("[MCP stderr]", data.toString());
        });

        this.process.on("close", (code) => {
            console.log(`[MCP] Process exited with code ${code}`);
            this.process = null;
        });

        // Wait for MCP server to be ready
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        console.log("[MCP] Connected to BNB Chain MCP server");
    }

    private processBuffer(): void {
        const lines = this.buffer.split("\n");
        // The last part is either an incomplete line or empty string
        this.buffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const response: MCPResponse = JSON.parse(line);
                const pending = this.pendingRequests.get(response.id);
                if (pending) {
                    this.pendingRequests.delete(response.id);
                    if (response.error) {
                        pending.reject(new Error(response.error.message));
                    } else {
                        // Unpack the JSON-RPC result format from MCP tools
                        const toolResult = response.result as { content?: Array<{ text?: string }> };
                        if (toolResult && toolResult.content && toolResult.content.length > 0) {
                            const rawText = toolResult.content[0].text || "{}";
                            console.log(`[MCP] Raw text length: ${rawText.length}`);
                            console.log(`[MCP] Raw text head: ${rawText.substring(0, 150)}...`);
                            
                            try {
                                const parsed = JSON.parse(rawText);
                                pending.resolve(parsed);
                            } catch {
                                pending.resolve(rawText);
                            }
                        } else {
                            console.log("[MCP Raw Result]", JSON.stringify(response.result));
                            pending.resolve(response.result);
                        }
                    }
                }
            } catch {
                // Not a valid JSON-RPC message, could be a log
                console.log("[MCP stdout]", line);
            }
        }
    }

    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
        if (!this.process?.stdin) {
            throw new Error("MCP client not connected");
        }

        const id = ++this.requestId;
        const request: MCPRequest = {
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: { name: toolName, arguments: args },
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.process!.stdin!.write(JSON.stringify(request) + "\n");

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`MCP call ${toolName} timed out`));
                }
            }, 30000);
        });
    }

    async listTools(): Promise<any> {
        if (!this.process?.stdin) throw new Error("MCP client not connected");
        const id = ++this.requestId;
        const request: MCPRequest = { jsonrpc: "2.0", id, method: "tools/list" };
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.process!.stdin!.write(JSON.stringify(request) + "\n");
            setTimeout(() => { if (this.pendingRequests.has(id)) { this.pendingRequests.delete(id); reject(new Error("Timeout")); } }, 5000);
        });
    }

    async disconnect(): Promise<void> {
        this.process?.kill();
        this.process = null;
    }
}

export const mcpClient = new MCPClient();
