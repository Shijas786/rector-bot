import { ethers } from "hardhat";

/**
 * Register agent identity as ERC-8004 on BSC.
 * ERC-8004 is a standard for onchain agent identity registration.
 * See: https://www.8004scan.io/
 *
 * This script registers the deployer wallet as a verified AI agent
 * with metadata pointing to the OpenClaw skill.
 */

// ERC-8004 Registry on BSC Testnet
const ERC8004_REGISTRY = "0x19F4a11E6D1A65A3B7C46BeFbA08F89B0010C252";

const ERC8004_ABI = [
    "function register(string calldata name, string calldata metadata) external",
    "function isRegistered(address agent) external view returns (bool)",
];

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Registering ERC-8004 agent identity:", deployer.address);

    const registry = new ethers.Contract(ERC8004_REGISTRY, ERC8004_ABI, deployer);

    // Check if already registered
    try {
        const registered = await registry.isRegistered(deployer.address);
        if (registered) {
            console.log("✅ Agent already registered on ERC-8004");
            return;
        }
    } catch {
        console.log("Note: Could not check registration status, proceeding...");
    }

    // Register with agent metadata
    const metadata = JSON.stringify({
        name: "Rector Prediction Verifier",
        description: "AI agent that verifies crypto predictions onchain using Binance data",
        framework: "rector",
        chain: "BSC",
        capabilities: ["market_analysis", "prediction_verification", "onchain_attestation"],
    });

    try {
        const tx = await registry.register("rector-predictor", metadata);
        await tx.wait();
        console.log("\n✅ Agent registered as ERC-8004");
        console.log("TX:", tx.hash);
        console.log("View: https://testnet.8004scan.io/");
    } catch (error: any) {
        console.log("\n⚠️  ERC-8004 registration failed (may not be available on testnet yet)");
        console.log("Error:", error.message);
        console.log("\nThis is optional — your agent will still work without ERC-8004 registration.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
