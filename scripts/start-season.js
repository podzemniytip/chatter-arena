const hre = require("hardhat");

const CHATTER = "0x51062475c702655F3508b65f02C8c97de0ACe812";
const FEE = hre.ethers.parseEther("0.0005"); // 0.0005 ETH
const REG = 600; // 10 min
const COM = 600; // 10 min
const REV = 600; // 10 min

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const chatter = await hre.ethers.getContractAt("Chatter", CHATTER, signer);
  const tx = await chatter.startSeason(FEE, REG, COM, REV);
  console.log("Starting season 1... tx:", tx.hash);
  await tx.wait();
  console.log("Season 1 started!");
  const s = await chatter.seasons(1);
  console.log("Phase:", ["Registration","Commit","Reveal","Complete"][s.phase]);
  console.log("Fee:", hre.ethers.formatEther(s.entryFee), "ETH");
}

main().catch(console.error);
