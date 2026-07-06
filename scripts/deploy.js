const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Chatter = await hre.ethers.getContractFactory("Chatter");
  const chatter = await Chatter.deploy();
  await chatter.waitForDeployment();

  const addr = await chatter.getAddress();
  console.log("Chatter deployed to:", addr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
