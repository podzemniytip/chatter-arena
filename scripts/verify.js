const hre = require("hardhat");

async function main() {
  const [s] = await hre.ethers.getSigners();
  const c = await hre.ethers.getContractAt("Chatter", "0x51062475c702655F3508b65f02C8c97de0ACe812", s);
  const sid = await c.seasonId();
  const season = await c.seasons(sid);
  console.log("Phase:", season.phase);
  console.log("Fee:", season.entryFee.toString());
  console.log("Fee ETH:", hre.ethers.formatEther(season.entryFee));
  console.log("Pool:", season.pool.toString());
  const owner = await c.owner();
  console.log("Owner:", owner);
  console.log("Signer:", s.address);
}

main().catch(console.error);
