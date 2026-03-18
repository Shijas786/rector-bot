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

    // Deploy ConditionalPayment (Escrow) linked to Registry
    console.log("\nDeploying ConditionalPayment (Escrow)...");
    const ConditionalPayment = await ethers.getContractFactory("ConditionalPayment");
    const escrow = await ConditionalPayment.deploy(address);
    await escrow.waitForDeployment();

    const escrowAddress = await escrow.getAddress();
    console.log("✅ ConditionalPayment deployed to:", escrowAddress);

    console.log("\nNext steps:");
    console.log(`1. Add to .env: PREDICTION_REGISTRY_ADDRESS=${address}`);
    console.log(`2. Add to .env: CONDITIONAL_PAYMENT_ADDRESS=${escrowAddress}`);
    console.log(`3. Verify Registry: npx hardhat verify --network bscTestnet ${address} ${deployer.address} ${deployer.address}`);
    console.log(`4. Verify Escrow: npx hardhat verify --network bscTestnet ${escrowAddress} ${address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
