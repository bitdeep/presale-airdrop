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
    let AirdropAmount = 0n;
    const user1Airdrop = "3359678215500000000";

    // store the total by address ready to load into the contract
    let consolidatedData = [];

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();
        PaymentToken = await ethers.getContractFactory("FaucetERC20d18");
        paymentToken = await PaymentToken.deploy("xGRAIL", "xGRAIL", 0);
        PresaleAirdrop = await ethers.getContractFactory("PresaleAirdrop");
        presaleAirdrop = await PresaleAirdrop.deploy(paymentToken.address, owner.address);

        // get all contributions, can be various by address.
        consolidatedData = JSON.parse(fs.readFileSync('./airdrop.json').toString());

        // now that all the contribution are consolidated by address we can inject in
        // chucks into the contract
        const limitByTx = 250;
        let users = [], amounts = [];
        for( let i = 0; i < consolidatedData.length; i++ ){
            const user = consolidatedData[i].address;
            const amount = consolidatedData[i].xgrail_airdrop_allocation;
            users.push( user );
            amounts.push( amount );
            AirdropAmount += BigInt(amount);

            // we run and reset the chunk
            if( users.length === limitByTx || i+1 === consolidatedData.length ) {
                await presaleAirdrop.loadClaims(users, amounts);
                users = [];
                amounts = [];
            }

        }

        expect(await presaleAirdrop.totalUsers()).to.be.eq(consolidatedData.length);
        
        // add user1 to allow it to pass some tests.
        await presaleAirdrop.loadClaims([user1.address], [user1Airdrop] );

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
            const user = consolidatedData[i].address;
            const amount = consolidatedData[i].xgrail_airdrop_allocation;
            const ClaimInfo = await presaleAirdrop.getClaimInfo(user);
            expect(ClaimInfo.xGrailAmount).to.equal(amount);
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
        expect(getClaimAmount).to.be.eq(user1Airdrop);

        const block = await ethers.provider.getBlock();
        let ts = parseInt(block.timestamp);
        await expect(presaleAirdrop.connect(user1).claim()).to
            .emit(presaleAirdrop, 'Claim')
            .withArgs(user1.address, ++ts, user1Airdrop);

        // Check that the user's claim info has been updated
        const user1ClaimInfo = await presaleAirdrop.getClaimInfo(user1.address);
        expect(parseInt(user1ClaimInfo.claimedIn.toString())).to.be.gt(0);
        expect(user1ClaimInfo.claimedAmount.toString()).to.equal(user1Airdrop);
    });

});
