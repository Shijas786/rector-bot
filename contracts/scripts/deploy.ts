import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying PredictionRegistry with account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // Deploy — admin and agent are both the deployer for simplicity
    const PredictionRegistry = await ethers.getContractFactory("PredictionRegistry");
    const registry = await PredictionRegistry.deploy(deployer.address, deployer.address);
    await registry.waitForDeployment();

    const address = await registry.getAddress();
    console.log("\n✅ PredictionRegistry deployed to:", address);
    console.log("\nNext steps:");
    console.log(`1. Add to .env: PREDICTION_REGISTRY_ADDRESS=${address}`);
    console.log(`2. Verify: npx hardhat verify --network bscTestnet ${address} ${deployer.address} ${deployer.address}`);
    console.log(`3. View: https://testnet.bscscan.com/address/${address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
