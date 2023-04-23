require("@nomicfoundation/hardhat-toolbox");
const dotenv = require("dotenv");
dotenv.config()
require("@nomiclabs/hardhat-etherscan");


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    networks: {

        arb: {
            url: process.env.RPC,
            accounts: [`${process.env.PRIVATE_KEY}`],
        },

        hardhat: {
            blockGasLimit: 12_450_000,
            hardfork: "london"
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
