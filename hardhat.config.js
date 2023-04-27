require("@nomicfoundation/hardhat-toolbox");
const dotenv = require("dotenv");
dotenv.config()
require("@nomiclabs/hardhat-etherscan");
const fs = require('fs');

task("load", "load data into deployed contract").setAction(async () => {
    const contractAddress = fs.readFileSync('./contract.txt').toString();
    const PresaleAirdrop = await ethers.getContractFactory("PresaleAirdrop")
    const presaleAirdrop = PresaleAirdrop.attach(contractAddress);

    // get all contributions, can be various by address.
    const xgrailData = JSON.parse(fs.readFileSync('./airdrop.json').toString());

    let AirdropAmount = 0n;
    // now that all the contribution are consolidated by address we can inject in
    // chucks into the contract
    const limitByTx = 250;
    let users = [], amounts = [];

    console.log(`Loading: ${xgrailData.length} users into ${contractAddress}`);

    for( let i = 0; i < xgrailData.length; i++ ){
        const user = xgrailData[i].address;
        const amount = xgrailData[i].xgrail_airdrop_allocation;
        users.push( user );
        amounts.push( amount );
        AirdropAmount += BigInt(amount);
        // we run and reset the chunk
        if( users.length === limitByTx || i+1 === xgrailData.length ) {
            const tx = await presaleAirdrop.loadClaims(users, amounts);
            await tx.wait();
            console.log(` - tx: ${tx.hash}`);
            users = [];
            amounts = [];
        }
    }

    console.log(`Allowance needed: ${AirdropAmount.toString()} (${parseFloat(AirdropAmount.toString()/1e18).toFixed(2)}) xGRAIL.`);

});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    networks: {

        arb: {
            url: process.env.RPC,
            accounts: [`${process.env.PRIVATE_KEY}`],
        },

        hardhat: {
            forking: {
                url: `${process.env.RPC}`,
                blockNumber: 84934089
            }
        },
        localhost: {
            url: 'http://localhost:8545',
        },
    },
    solidity: {
        compilers: [
            {
                version: '0.8.17',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    },
                },
            },
            {
                version: '0.7.6',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    },
                },
            },
        ],
    },
    etherscan: {
        apiKey: { // npx hardhat verify --list-networks
            arbitrumOne: `${process.env.ARBSCAN}`,
        },
    }
};
