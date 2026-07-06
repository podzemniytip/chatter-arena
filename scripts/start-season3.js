const hre = require("hardhat");

const CHATTER = "0x51062475c702655F3508b65f02C8c97de0ACe812";
const FEE = hre.ethers.parseEther("0.005");
const REG = 1800;  // 30 min
const COM = 1800;  // 30 min
const REV = 1800;  // 30 min

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const chatter = await hre.ethers.getContractAt("Chatter", CHATTER, signer);
  const tx = await chatter.startSeason(FEE, REG, COM, REV);
  console.log("Starting Season 3... tx:", tx.hash);
  await tx.wait();
  console.log("Season 3 started with", hre.ethers.formatEther(FEE), "ETH fee");
  const s = await chatter.seasons(3);
  console.log("Phase:", ["Registration","Commit","Reveal","Complete"][s.phase]);
  const now = Math.floor(Date.now() / 1000);
  console.log("Registration ends in:", s.regEnd - now, "seconds");
}

main().catch(console.error);
