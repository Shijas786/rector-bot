import { ethers } from "ethers";

/**
 * BSC-specific operations — read/write contracts on BNB Smart Chain via direct ethers.
 */

const RPC_URL = process.env.NEXT_PUBLIC_BSC_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545/";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const PREDICTION_REGISTRY = process.env.PREDICTION_REGISTRY_ADDRESS || "0x02E9D22b7D5d6310815ee1c8eCB43e8a7baa57f0";
const CONDITIONAL_PAYMENT = process.env.CONDITIONAL_PAYMENT_ADDRESS || "0xF1071252d1a89F7C31925C83CC8D0bD7b1da229F";

const ABI = [
    "function submitWithRunbook(string claimText, string disambiguated, string runbookRef, uint256 resolutionDate, address submitter) external returns (uint256)",
    "function resolveAndAttest(uint256 predictionId, bool outcome, uint8 confidence, string evidenceRef, string reasoning, bytes signature) external",
    "function getPrediction(uint256 predictionId) external view returns (uint256 id, address submitter, string claimText, string disambiguated, string runbookRef, uint256 resolutionDate, uint8 status, bool outcome, uint8 confidence, string evidenceRef, string reasoning, bytes signature, uint256 createdAt, uint256 resolvedAt)",
    "function getAccuracy(address user) external view returns (uint256 correct, uint256 total)",
    "function getByAddress(address user) external view returns (uint256[])",
    "function markInconclusive(uint256 predictionId) external",
    "event PredictionSubmitted(uint256 indexed id, address indexed submitter, uint256 resolutionDate)"
];

const ESCROW_ABI = [
    "function escrowCount() external view returns (uint256)",
    "function escrows(uint256 id) external view returns (address creator, address beneficiary, uint256 predictionId, uint256 amount, bool claimed)",
    "function getEscrowWithPrediction(uint256 escrowId) external view returns (tuple(address creator, address beneficiary, uint256 predictionId, uint256 amount, bool claimed) escrow, tuple(uint256 id, address submitter, string claimText, string disambiguated, string runbookRef, uint256 resolutionDate, uint8 status, bool outcome, uint8 confidence, string evidenceRef, string reasoning, bytes signature, uint256 createdAt, uint256 resolvedAt) prediction)"
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const registryContract = new ethers.Contract(PREDICTION_REGISTRY, ABI, wallet);
const escrowContract = new ethers.Contract(CONDITIONAL_PAYMENT, ESCROW_ABI, wallet);

/**
 * Submit a prediction onchain via direct ethers.
 */
export async function submitPrediction(
    claimText: string,
    disambiguated: string,
    runbookRef: string,
    resolutionDate: number,
    submitter: string
): Promise<{ txHash: string; predictionId: number }> {
    console.log(`[BSC] Submitting prediction: ${claimText}`);
    const tx = await registryContract.submitWithRunbook(
        claimText,
        disambiguated,
        runbookRef,
        resolutionDate,
        submitter
    );
    const receipt = await tx.wait();

    // Find the PredictionSubmitted event
    const event = receipt.logs.find((log: any) => {
        try {
            const parsed = registryContract.interface.parseLog(log);
            return parsed?.name === "PredictionSubmitted";
        } catch (e) {
            return false;
        }
    });

    const parsedEvent = event ? registryContract.interface.parseLog(event) : null;
    let predictionId = parsedEvent ? Number(parsedEvent.args.id) : 0;

    // Safety fallback: if predictionId is 0, it might be a parsing edge case
    if (predictionId === 0) {
        console.warn(`[BSC] Warning: Prediction ID parsed as 0. Tx: ${receipt.hash}`);
        // Log all logs for debugging in Railway
        console.log(`[BSC] Full Receipt Logs: ${JSON.stringify(receipt.logs)}`);
    }

    console.log(`[BSC] Prediction #${predictionId} submitted: ${receipt.hash}`);

    return {
        txHash: receipt.hash,
        predictionId,
    };
}

/**
 * Resolve and attest a prediction onchain via direct ethers.
 */
export async function resolvePrediction(
    id: number,
    outcome: boolean,
    confidence: number,
    evidenceRef: string,
    reasoning: string,
    signature: string
): Promise<{ txHash: string }> {
    console.log(`[BSC] Resolving prediction #${id}: ${outcome}`);
    const tx = await registryContract.resolveAndAttest(id, outcome, confidence, evidenceRef, reasoning, signature);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
}

/**
 * Mark a prediction as inconclusive via direct ethers.
 */
export async function markInconclusive(id: number): Promise<{ txHash: string }> {
    const tx = await registryContract.markInconclusive(id);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
}

/**
 * Read a prediction from the contract.
 */
export async function getPrediction(id: number): Promise<unknown> {
    return registryContract.getPrediction(id);
}

/**
 * Read accuracy stats for an address.
 */
export async function getAccuracy(address: string): Promise<{ correct: number; total: number }> {
    const [correct, total] = await registryContract.getAccuracy(address);
    return {
        correct: Number(correct),
        total: Number(total),
    };
}

/**
 * Get all prediction IDs for an address.
 */
export async function getByAddress(address: string): Promise<number[]> {
    const ids = await registryContract.getByAddress(address);
    return ids.map((id: any) => Number(id));
}

/**
 * Read escrows for a prediction.
 */
export async function getEscrowsForPrediction(predictionId: number): Promise<any[]> {
    const count = await escrowContract.escrowCount();
    const escrows = [];
    for (let i = 1; i <= Number(count); i++) {
        const e = await escrowContract.escrows(i);
        if (Number(e.predictionId) === predictionId) {
            escrows.push({
                id: i,
                creator: e.creator,
                beneficiary: e.beneficiary,
                predictionId: Number(e.predictionId),
                amount: ethers.formatEther(e.amount),
                claimed: e.claimed
            });
        }
    }
    return escrows;
}

/**
 * Read native BNB balance for an address.
 */
export async function getNativeBalance(address: string): Promise<number> {
    const balance = await provider.getBalance(address);
    return Number(ethers.formatEther(balance));
}

/**
 * Read Chainlink price feed on BSC.
 */
export async function readChainlinkPrice(feedAddress: string): Promise<number> {
    const feed = new ethers.Contract(feedAddress, ["function latestAnswer() view returns (int256)"], provider);
    const result = await feed.latestAnswer();
    return Number(result) / 1e8;
}
