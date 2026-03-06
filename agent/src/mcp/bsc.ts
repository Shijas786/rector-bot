import { mcpClient } from "./client.js";

/**
 * BSC-specific MCP operations — read/write contracts on BNB Smart Chain.
 */

const PREDICTION_REGISTRY = process.env.PREDICTION_REGISTRY_ADDRESS || "";

import { Interface } from "ethers";

const ABI_FRAGMENTS = [
    "function submitWithRunbook(string claimText, string disambiguated, string runbookRef, uint256 resolutionDate, address submitter) external returns (uint256)",
    "function resolveAndAttest(uint256 predictionId, bool outcome, uint8 confidence, string evidenceRef, string reasoning, bytes signature) external",
    "function getPrediction(uint256 predictionId) external view returns (uint256, address, string, string, string, uint256, uint8, bool, uint8, string, string)",
    "function getAccuracy(address user) external view returns (uint256 correct, uint256 total)",
    "function getByAddress(address user) external view returns (uint256[])",
    "function markInconclusive(uint256 predictionId) external",
    "function latestAnswer() external view returns (int256)"
];

// Ethers.js automatically parses human-readable ABIs into the JSON object format required by MCP
const PARSED_ABI = JSON.parse(new Interface(ABI_FRAGMENTS).formatJson());

/**
 * Submit a prediction onchain via MCP write_contract.
 */
export async function submitPrediction(
    claimText: string,
    disambiguated: string,
    runbookRef: string,
    resolutionDate: number,
    submitter: string
): Promise<{ txHash: string; predictionId: number }> {
    const result = await mcpClient.callTool("write_contract", {
        contractAddress: PREDICTION_REGISTRY,
        abi: PARSED_ABI,
        functionName: "submitWithRunbook",
        args: [claimText, disambiguated, runbookRef, resolutionDate, submitter],
        privateKey: process.env.PRIVATE_KEY,
        network: "bsc-testnet",
    }) as { transactionHash: string; events?: Array<{ args: string[] }> };

    return {
        txHash: result.transactionHash,
        predictionId: parseInt(result.events?.[0]?.args?.[0] || "0"),
    };
}

/**
 * Resolve and attest a prediction onchain via MCP write_contract.
 */
export async function resolvePrediction(
    id: number,
    outcome: boolean,
    confidence: number,
    evidenceRef: string,
    reasoning: string,
    signature: string
): Promise<{ txHash: string }> {
    const result = await mcpClient.callTool("write_contract", {
        contractAddress: PREDICTION_REGISTRY,
        abi: PARSED_ABI,
        functionName: "resolveAndAttest",
        args: [id, outcome, confidence, evidenceRef, reasoning, signature],
        privateKey: process.env.PRIVATE_KEY,
        network: "bsc-testnet",
    }) as { transactionHash: string };

    return { txHash: result.transactionHash };
}

/**
 * Mark a prediction as inconclusive via MCP write_contract.
 */
export async function markInconclusive(id: number): Promise<{ txHash: string }> {
    const result = await mcpClient.callTool("write_contract", {
        contractAddress: PREDICTION_REGISTRY,
        abi: PARSED_ABI,
        functionName: "markInconclusive",
        args: [id],
        privateKey: process.env.PRIVATE_KEY,
        network: "bsc-testnet",
    }) as { transactionHash: string };

    return { txHash: result.transactionHash };
}

/**
 * Read a prediction from the contract via MCP read_contract.
 */
export async function getPrediction(id: number): Promise<unknown> {
    return mcpClient.callTool("read_contract", {
        contractAddress: PREDICTION_REGISTRY,
        abi: PARSED_ABI,
        functionName: "getPrediction",
        args: [id],
        network: "bsc-testnet",
    });
}

/**
 * Read accuracy stats for an address via MCP read_contract.
 */
export async function getAccuracy(address: string): Promise<{ correct: number; total: number }> {
    const result = await mcpClient.callTool("read_contract", {
        contractAddress: PREDICTION_REGISTRY,
        abi: PARSED_ABI,
        functionName: "getAccuracy",
        args: [address],
        network: "bsc-testnet",
    }) as [string, string];

    return {
        correct: parseInt(result[0]),
        total: parseInt(result[1]),
    };
}

/**
 * Get all prediction IDs for an address via MCP read_contract.
 */
export async function getByAddress(address: string): Promise<number[]> {
    const result = await mcpClient.callTool("read_contract", {
        contractAddress: PREDICTION_REGISTRY,
        abi: PARSED_ABI,
        functionName: "getByAddress",
        args: [address],
        network: "bsc-testnet",
    }) as string[];

    return result.map((id) => parseInt(id));
}

/**
 * Read Chainlink price feed on BSC via MCP read_contract.
 */
export async function readChainlinkPrice(feedAddress: string): Promise<number> {
    const result = await mcpClient.callTool("read_contract", {
        contractAddress: feedAddress,
        abi: PARSED_ABI,
        functionName: "latestAnswer",
        args: [],
        network: "bsc-testnet",
    }) as string;

    // Chainlink feeds return 8 decimal places
    return parseInt(result) / 1e8;
}
