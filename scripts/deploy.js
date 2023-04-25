const hre = require("hardhat");
const fs = require('fs');
async function main() {

  const network = await hre.ethers.provider.getNetwork();
  const chainId = network.chainId;
  const mainnet = network.chainId === 42161;

  const PresaleAirdrop = await hre.ethers.getContractFactory("PresaleAirdrop");
  const USDC = process.env.USDC;
  const CLAIM_PERCENT = process.env.CLAIM_PERCENT;
  const TREASURE = process.env.TREASURE;
  const main = await PresaleAirdrop.deploy(USDC, CLAIM_PERCENT, TREASURE);
  await main.deployed();
  console.log(`- airdrop contract: ${main.address}`);
  console.log(`- % to be paid: ${CLAIM_PERCENT}`);
  console.log(`- USDC funds at: ${TREASURE}`);
  fs.writeFileSync('./contract.txt', main.address);

  if( process.env.ARBSCAN ) {
    try {
      if (mainnet) {
        await main.deployTransaction.wait(5);
        await hre.run("verify:verify", {
          address: main.address,
          constructorArguments: [USDC, CLAIM_PERCENT, TREASURE]
        });
      }
    } catch (e) {
      console.log(e.toString());
    }
  }else{
    console.log(`contract verification canceled as ARBSCAN API key not informed in .env file.`)
  }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
