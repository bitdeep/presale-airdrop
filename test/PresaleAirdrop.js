const {expect} = require("chai");
const fs = require('fs');

describe("PresaleAirdrop", function () {
    let PresaleAirdrop;
    let presaleAirdrop;
    let PaymentToken;
    let paymentToken;
    let owner;
    let allContributions;
    let user1;
    let user2;
    let user3;
    let AirdropAmount = 0;
    const FeeShare = 10; // 10%
    const user1Contribution = 1e6.toString();

    // store the total by address ready to load into the contract
    let consolidatedData = [];

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();
        PaymentToken = await ethers.getContractFactory("FaucetERC20d6");
        paymentToken = await PaymentToken.deploy("USDC", "USDC", 0);
        PresaleAirdrop = await ethers.getContractFactory("PresaleAirdrop");
        presaleAirdrop = await PresaleAirdrop.deploy(paymentToken.address, FeeShare, owner.address);

        // get all contributions, can be various by address.
        allContributions = JSON.parse(fs.readFileSync('./airdrop.json').toString());

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

        // now that all the contribution are consolidated by address we can inject in
        // chucks into the contract
        const limitByTx = 250;
        let users = [], amounts = [];
        for( let i = 0; i < consolidatedData.length; ++i ){
            const user = consolidatedData[i].user;
            const amount = consolidatedData[i].amount;

            // we run and reset the chunk
            if( users.length === limitByTx || i+1 === consolidatedData.length ) {
                await presaleAirdrop.loadClaims(users, amounts);
                users = [];
                amounts = [];
            }

            users.push( user );
            amounts.push( amount );
            AirdropAmount += parseFloat(amount);
        }

        expect(await presaleAirdrop.totalUsers()).to.be.eq(consolidatedData.length-1);
        
        // add user1 to allow it to pass some tests.
        await presaleAirdrop.loadClaims([user1.address], [user1Contribution] );

        await paymentToken.mint(AirdropAmount.toString());
        await paymentToken.approve(presaleAirdrop.address, AirdropAmount.toString());

    });

    // --SECURITY-- set claim status

    it("should allow the owner to set the claim open status", async function () {
        // set claim open status to true
        await presaleAirdrop.setClaimOpenStatus(true);
        expect(await presaleAirdrop.usersCanClaim()).to.be.true;

        // set claim open status to false
        await presaleAirdrop.setClaimOpenStatus(false);
        expect(await presaleAirdrop.usersCanClaim()).to.be.false;
    });

    it("should revert if non-owner tries to set the claim open status", async function () {
        // set claim open status to true as owner
        await presaleAirdrop.setClaimOpenStatus(true);

        // try to set claim open status to false as non-owner
        await expect(presaleAirdrop.connect(user1).setClaimOpenStatus(false))
            .to.be.revertedWith("Ownable: caller is not the owner");

        // claim open status should still be true
        expect(await presaleAirdrop.usersCanClaim()).to.be.true;
    });

    // -- SECURITY load claim data

    it("should check if all users are loaded correctly", async function () {
        for( let i = 0; i < consolidatedData.length; ++i ){
            const user = consolidatedData[i].user;
            const amount = consolidatedData[i].amount;
            const ClaimInfo = await presaleAirdrop.getClaimInfo(user);
            expect(ClaimInfo.contributedAmount).to.equal(amount);
        }
    });

    it("should revert if caller is not owner", async function () {
        await expect(presaleAirdrop.connect(user1).loadClaims([],[])).to.be.revertedWith("Ownable: caller is not the owner");
    });

    // EXTERNAL/PUBLIC operations

    it("should revert if the claim period is not open yet", async function () {
        // Set the claim open status to false
        await presaleAirdrop.setClaimOpenStatus(false);

        await expect(presaleAirdrop.connect(user1).claim()).to.be.revertedWithCustomError(
            presaleAirdrop, "claimNotOpenYet"
        );
    });

    // claim after already claiming
    it("should revert if the user has already claimed", async function () {

        // Set claim status to open
        await presaleAirdrop.setClaimOpenStatus(true);

        // First claim
        await presaleAirdrop.connect(user1).claim();

        // Second claim
        await expect(presaleAirdrop.connect(user1).claim())
            .to.be.revertedWithCustomError(presaleAirdrop, "UserAlreadyClaimed");
    });

    it("should allow a user to claim their tokens", async function () {

        // Set the claim open status to true
        await presaleAirdrop.setClaimOpenStatus(true);

        const getClaimAmount = (await presaleAirdrop.getClaimAmount(user1.address)).toString();
        const claimValid = (parseFloat(user1Contribution) * FeeShare / 100).toString();
        expect(getClaimAmount).to.be.eq(claimValid);

        const block = await ethers.provider.getBlock();
        let ts = parseInt(block.timestamp);
        await expect(presaleAirdrop.connect(user1).claim()).to
            .emit(presaleAirdrop, 'Claim')
            .withArgs(user1.address, ++ts, user1Contribution, claimValid);

        // Check that the user's claim info has been updated
        const user1ClaimInfo = await presaleAirdrop.getClaimInfo(user1.address);
        expect(parseInt(user1ClaimInfo.claimedIn.toString())).to.be.gt(0);
        expect(user1ClaimInfo.claimedAmount.toString()).to.equal(claimValid);
    });

});
