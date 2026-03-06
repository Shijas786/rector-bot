import { ethers } from "ethers";

/**
 * Read-only connection to PredictionRegistry on BSC.
 * Used by the frontend to display predictions, leaderboard, etc.
 */

const BSC_RPC = process.env.NEXT_PUBLIC_BSC_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545/";
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "";

const REGISTRY_ABI = [
    "function count() view returns (uint256)",
    "function predictions(uint256) view returns (uint256 id, address submitter, string claimText, string disambiguated, string runbookRef, uint256 resolutionDate, uint8 status, bool outcome, uint8 confidence, string evidenceRef, string reasoning, bytes signature, uint256 createdAt, uint256 resolvedAt)",
    "function getPrediction(uint256 _id) view returns (tuple(uint256 id, address submitter, string claimText, string disambiguated, string runbookRef, uint256 resolutionDate, uint8 status, bool outcome, uint8 confidence, string evidenceRef, string reasoning, bytes signature, uint256 createdAt, uint256 resolvedAt))",
    "function getByAddress(address _addr) view returns (uint256[])",
    "function getAccuracy(address _addr) view returns (uint256 correct, uint256 total)",
    "function correctCount(address) view returns (uint256)",
    "function totalCount(address) view returns (uint256)",
];

let provider: ethers.JsonRpcProvider | null = null;
let contract: ethers.Contract | null = null;

export function getProvider(): ethers.JsonRpcProvider {
    if (!provider) {
        provider = new ethers.JsonRpcProvider(BSC_RPC);
    }
    return provider;
}

export function getRegistry(): ethers.Contract {
    if (!contract) {
        contract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, getProvider());
    }
    return contract;
}

export async function getPredictionCount(): Promise<number> {
    const registry = getRegistry();
    const count = await registry.count();
    return Number(count);
}

export async function getPrediction(id: number) {
    const registry = getRegistry();
    return registry.getPrediction(id);
}

export async function getAccuracy(address: string) {
    const registry = getRegistry();
    const [correct, total] = await registry.getAccuracy(address);
    return { correct: Number(correct), total: Number(total) };
}
