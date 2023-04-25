require("@nomicfoundation/hardhat-toolbox");
const dotenv = require("dotenv");
dotenv.config()
require("@nomiclabs/hardhat-etherscan");
const fs = require('fs');

task("load", "load data into deployed contract").setAction(async () => {
    const contractAddress = fs.readFileSync('./contract.txt').toString();
    const PresaleAirdrop = await ethers.getContractFactory("PresaleAirdrop")
    const presaleAirdrop = PresaleAirdrop.attach(contractAddress);

    // store the total by address ready to load into the contract
    let consolidatedData = [];

    // get all contributions, can be various by address.
    const allContributions = JSON.parse(fs.readFileSync('./airdrop.json').toString());

    // consolidate contributions
    let balanceByUsers = {};
    for( let i in allContributions ){
        let contribution = allContributions[i];
        const user = contribution.user;
        balanceByUsers[ user ] = balanceByUsers[ user ] || 0;
        balanceByUsers[ user ] += parseFloat(contribution.amount);
    }

    // no load balanceByUsers into an array to pass to the contract
    for( let user in balanceByUsers){
        consolidatedData.push({user: user, amount: balanceByUsers[user]});
    }
    let AirdropAmount = 0;
    // now that all the contribution are consolidated by address we can inject in
    // chucks into the contract
    const limitByTx = 250;
    let users = [], amounts = [];

    console.log(`Loading: ${consolidatedData.length} into ${contractAddress}`);

    for( let i = 0; i < consolidatedData.length; ++i ){
        const user = consolidatedData[i].user;
        const amount = consolidatedData[i].amount;

        // we run and reset the chunk
        if( users.length === limitByTx || i+1 === consolidatedData.length ) {
            console.log(` - adding: ${users.length} users...`);
            const tx = await presaleAirdrop.loadClaims(users, amounts);
            await tx.wait();
            console.log(` - tx: ${tx.hash}`);
            users = [];
            amounts = [];
        }

        users.push( user );
        amounts.push( amount );
        AirdropAmount += parseFloat(amount);
    }

    console.log(`Allowance needed: ${AirdropAmount} (${parseFloat(AirdropAmount/1e6).toFixed(2)}) USDC.`);

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
                blockNumber: 84293972
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
