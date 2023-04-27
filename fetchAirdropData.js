'use strict';

const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();
const Web3 = require('web3');
const web3 = new Web3(process.env.RPC);

// store tx already processed, to prevent double entry, just to be safe.
let POOL = [];

/**
 * @function calculateXGrailAirdrop
 * @description Calculate the amount to be airdropped to user in xGRAIL (18 decimal) token.
 */
function calculateXGrailAirdrop(_usdcAmount) {
    const usdcBN = BigInt(_usdcAmount);
    const xgrail_price = BigInt(process.env.XGRAIL_PRICE);
    const airdrop = BigInt(process.env.CLAIM_PERCENT);
    return (((usdcBN * (10n**12n)) / xgrail_price)*airdrop)/100n;
}

/**
* @function onEventData
* @description Parses event data and logs it to the console and adds it to a JSON and Markdown file.
* @param {Array} events - Array of event objects returned from smart contract events.
* @param {Object} json - Array to hold JSON data.
* @param {Array} md - Array to hold Markdown data.
* @param {Object} stats - Object to hold contributor and total information.
*/
async function onEventData( events, json, md, stats ){
    for (let j = 0; j < events.length; j++) {
        const e = events[j];
        if (!e.event) continue;
        if (e.event !== 'Buy') continue;
        const u = e.returnValues;

        // just to be safe, cache the current tx+event:
        const txid = `${e.transactionHash}-${j}`;
        if( POOL.indexOf(txid) !== -1 ){
            console.log(`FOUND: TX=${txid} blockNumber=${e.blockNumber}`);
            continue;
        }
        POOL.push(txid);
        // event Buy(address indexed user, uint256 amount);
        const user = u.user;
        const contributedAmount = u.amount;

        const contributedAmountDecimal = parseFloat( web3.utils.fromWei(contributedAmount, 'mwei').toString() )

        // computes xgrail airdrop based on this contribution:
        const xgrail = calculateXGrailAirdrop(contributedAmount).toString();
        const xgrailInDecimal = parseFloat( web3.utils.fromWei(xgrail).toString() );

        // as user can do multiples deposits, let's get already computed deposits:
        let userInfo = json[user] || {address: user, usdc_contribution: 0n,
                                      xgrail_airdrop_allocation: 0n, tx: e.transactionHash};

        // now we sum up any new deposit on existing deposits:
        userInfo.usdc_contribution += BigInt(contributedAmount);
        userInfo.xgrail_airdrop_allocation += BigInt(xgrail);

        // save the cached data for if we find another contribution tx:
        json[user] = userInfo;

        // save some nice stats:
        stats.contributors++;
        stats.usdc += contributedAmountDecimal;
        stats.xgrail += xgrailInDecimal;

        const mdLine = `|${user}|${contributedAmountDecimal}|${xgrailInDecimal}`;
        console.log(mdLine);
        md.push(mdLine);

    }
}

/**
 * @function getEvents
 * @description Gets the event data for a given range of blocks, processes it and logs it to the console and saves it to a JSON and Markdown file.
 * @param {Object} presale - The instance of the contract.
 * @param {Object} stats - Object to hold contributor and total information.
 * @param {Object} json - Array to hold JSON data.
 * @param {Array} md - Array to hold Markdown data.
 * @param {Object} args - An object with fromBlock and toBlock properties.
 * @returns {boolean} - Returns true if event data is successfully retrieved, otherwise false.
 */
async function getEvents(presale, stats, json, md, args){
    try {
        const events = await presale.getPastEvents(args);
        await onEventData(events, json, md, stats);
        return true;
    } catch (e) {
        console.log(e.toString());
        return false;
    }
}

/**
 * @function main
 * @description Gets the event data for a range of blocks, processes it and logs it to the console and saves it to a JSON and Markdown file.
 */
async function main() {

    const abi = JSON.parse(fs.readFileSync("./presale-abi.js", "utf8"));
    const presale = new web3.eth.Contract(abi, process.env.CONTRACT);

    const startBlock = 39500492;
    const endBlock = 42569715;
    let size = 1000;
    let json = {}, md = [];
    let stats = {contributors: 0, usdc: 0, xgrail: 0};

    md.push(``);
    md.push(`---`);
    md.push(``);
    md.push(`|Address|USDC_Contributed|xGRAIL_Airdrop`);
    md.push(`|:---|---:|---:|`);

    for (let i = startBlock; i < endBlock; i += size) {
        const args = {fromBlock: i, toBlock: i + size - 1};
        console.log(`- processing: index=${i} left=${endBlock-i}`);
        while( ! await getEvents(presale, stats, json, md, args) ){
            console.log(' - trying again: ', args);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        //await new Promise(resolve => setTimeout(resolve, 1000));

    }

    md.unshift(`
    #Totals
    
    - Contributors: ${stats.contributors}
    - USDC: ${stats.usdc.toFixed(2)}
    - xGRAIL: ${stats.xgrail.toFixed(2)}
    
    ---
    
    `);

    // just nice stats for peer review
    fs.writeFileSync('./README.md', md.join('\n'));

    // rebuild the object to array to allow npx hardhat load to work by splitting the data:
    let contributions = [];
    for( let address in json ){
        let userInfo = json[address];
        // transform BigInt to String or JSON.stringify will complain
        userInfo.usdc_contribution = userInfo.usdc_contribution.toString();
        userInfo.xgrail_airdrop_allocation = userInfo.xgrail_airdrop_allocation.toString();
        contributions.push(json[address]);
    }
    fs.writeFileSync('./airdrop.json', JSON.stringify(contributions,undefined,'    '));

}

main();
