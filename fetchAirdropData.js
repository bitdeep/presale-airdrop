'use strict';

const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();
const Web3 = require('web3');
const web3 = new Web3(process.env.RPC);

async function onEventData( events, json, md, stats ){
    for (let j = 0; j < events.length; j++) {
        const e = events[j];
        if (!e.event) continue;
        if (e.event !== 'Buy') continue;
        const u = e.returnValues;
        // event Buy(address indexed user, uint256 amount);
        const user = u.user;
        const contributedAmount = u.amount;
        const contributedAmountDecimal = parseFloat( web3.utils.fromWei(contributedAmount, 'mwei').toString() )
        const mdLine = `|${user}|${contributedAmountDecimal}|`;
        console.log(mdLine);
        md.push(mdLine);
        json.push({
            user: user,
            contributedAmount: contributedAmount
        });
        stats.contributors++;
        stats.total += contributedAmountDecimal;

    }
}

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


async function main() {

    const abi = JSON.parse(fs.readFileSync("./presale-abi.js", "utf8"));
    const presale = new web3.eth.Contract(abi, process.env.CONTRACT);

    const startBlock = 39500492;
    const endBlock = 42569715;
    let size = 1000;
    let json = [], md = [];
    let stats = {contributors: 0, total: 0};

    md.push(``);
    md.push(`---`);
    md.push(``);
    md.push(`|Address|Contributed|`);
    md.push(`|:---|---:|`);

    for (let i = startBlock; i < endBlock; i += size) {
        const args = {fromBlock: i, toBlock: i + size - 1};
        console.log(`- processing: index=${i} left=${endBlock-i}`);
        while( ! await getEvents(presale, stats, json, md, args) ){
            console.log(' - trying again: ', args);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await new Promise(resolve => setTimeout(resolve, 1000));

    }

    md.unshift(`#Totals\n\n- contributors: ${stats.contributors}\n- totals: ${stats.contributors.toFixed(2)}\n\n`);
    fs.writeFileSync('./README.md', md.join('\n'));
    fs.writeFileSync('./airdrop.json', JSON.stringify(json));

}

main();