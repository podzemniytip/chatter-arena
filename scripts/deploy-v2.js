const hre = require("hardhat");

const FEE = hre.ethers.parseEther("0.005");
const REG = 7200;   // 2 hours
const COM = 7200;   // 2 hours
const REV = 7200;   // 2 hours

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Fee:", hre.ethers.formatEther(FEE), "ETH");
  console.log("Durations:", REG, COM, REV, "seconds each");

  const Chatter = await hre.ethers.getContractFactory("ChatterV2");
  const chatter = await Chatter.deploy(FEE, REG, COM, REV);
  await chatter.waitForDeployment();

  const addr = await chatter.getAddress();
  console.log("ChatterV2 deployed to:", addr);
  console.log("Season 1 auto-started");
}

main().catch(console.error);
