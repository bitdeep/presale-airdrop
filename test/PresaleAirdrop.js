const {expect} = require("chai");
const fs = require('fs');

describe("PresaleAirdrop", function () {
    let PresaleAirdrop;
    let presaleAirdrop;
    let PaymentToken;
    let paymentToken;
    let owner;
    let claimData;
    let user1;
    let user2;
    let user3;
    let AirdropAmount = 0;
    const FeeShare = 10; // 10%
    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();
        PaymentToken = await ethers.getContractFactory("FaucetERC20d6");
        paymentToken = await PaymentToken.deploy("USDC", "USDC", AirdropAmount);
        PresaleAirdrop = await ethers.getContractFactory("PresaleAirdrop");
        presaleAirdrop = await PresaleAirdrop.deploy(paymentToken.address, FeeShare, owner.address);
        await paymentToken.approve(presaleAirdrop.address, AirdropAmount);
        claimData = JSON.parse(fs.readFileSync('./airdrop.json').toString());
        for( let i in claimData ){
            AirdropAmount += parseFloat(claimData[i].v);
        }
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

    it("should load claim data and emit event", async function () {
        await expect(presaleAirdrop.loadClaims(claimData))
            .to.emit(presaleAirdrop, "LoadClaimInfo")
            .withArgs(claimData.length, 60); // 60 is 10% of 600%

        expect(await presaleAirdrop.getClaimAmount(user1.address)).to.equal(10);
        expect(await presaleAirdrop.getClaimAmount(user2.address)).to.equal(20);
        expect(await presaleAirdrop.getClaimAmount(user3.address)).to.equal(30);
    });

    it("should revert if claim data is already loaded", async function () {
        await presaleAirdrop.loadClaims(claimData);
        await expect(presaleAirdrop.loadClaims(claimData)).to.be.revertedWithCustomError(presaleAirdrop, "LoadClaimAlreadySet");
    });

    it("should revert if caller is not owner", async function () {
        await expect(presaleAirdrop.connect(user1).loadClaims(claimData)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    // EXTERNAL/PUBLIC operations


    it("should revert if the claim data is not loaded", async function () {
        await expect(presaleAirdrop.connect(user1).claim()).to.be.revertedWithCustomError(
            presaleAirdrop, "ClaimDataNotLoaded"
        );
    });

    it("should revert if the claim period is not open yet", async function () {
        const user1Contribution = ethers.utils.parseEther("1");

        // Load the claim data for user1
        await presaleAirdrop.loadClaims([
            {
                user: user1.address,
                contributedAmount: user1Contribution,
                claimedAmount: 0,
                claimedIn: 0,
            },
        ]);

        // Set the claim open status to false
        await presaleAirdrop.setClaimOpenStatus(false);

        await expect(presaleAirdrop.connect(user1).claim()).to.be.revertedWithCustomError(
            presaleAirdrop, "claimNotOpenYet"
        );
    });

    // claim after already claiming
    it("should revert if the user has already claimed", async function () {
        // Load initial claims
        await presaleAirdrop.loadClaims(claimData);

        // Set claim status to open
        await presaleAirdrop.setClaimOpenStatus(true);

        // First claim
        await presaleAirdrop.connect(user1).claim();

        // Second claim
        await expect(presaleAirdrop.connect(user1).claim())
            .to.be.revertedWithCustomError(presaleAirdrop, "UserAlreadyClaimed");
    });

    it("should allow a user to claim their tokens", async function () {
        const user1Contribution = (100 * 1e6).toString();
        const user1ClaimAmount = (10 * 1e6).toString();
        const allowance = user1Contribution;

        // Load the claim data for user1
        await presaleAirdrop.loadClaims([
            {
                user: user1.address,
                contributedAmount: user1Contribution,
                claimedAmount: 0,
                claimedIn: 0,
            },
        ]);

        // Set the claim open status to true
        await presaleAirdrop.setClaimOpenStatus(true);

        // Approve the token transfer from the treasury to the contract
        await paymentToken
            .connect(owner)
            .approve(presaleAirdrop.address, allowance);

        const getClaimAmount = (await presaleAirdrop.getClaimAmount(user1.address)).toString();
        expect(getClaimAmount).to.be.eq(user1ClaimAmount);

        const block = await ethers.provider.getBlock();
        let ts = parseInt(block.timestamp);
        await expect(presaleAirdrop.connect(user1).claim()).to
            .emit(presaleAirdrop, 'Claim')
            .withArgs(user1.address, ++ts, user1Contribution, user1ClaimAmount);

        // Check that the user's claim info has been updated
        const user1ClaimInfo = await presaleAirdrop.getClaimInfo(user1.address);
        expect(parseInt(user1ClaimInfo.claimedIn.toString())).to.be.gt(0);
        expect(user1ClaimInfo.claimedAmount.toString()).to.equal(user1ClaimAmount);
    });

});
