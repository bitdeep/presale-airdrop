// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

/**
 * @title PresaleAirdrop
 * @dev This is a claim airdrop contract that allow the amount to be claimed
 * be computed using %.
 * Admin loads the claim data once a time.
 *
 * Once user claim it's airdrop, it can't claim again.
 *
 *
 */
contract PresaleAirdrop is Ownable {

    using SafeERC20 for IERC20;

    /**
     * @dev claimPercentValue is immutable and set at constructor to a % to be paid
     * to the user, not allowing it's changes as it's value is used to compute
     * initial allowance in payment token.
     */

    uint public immutable claimPercentValue;

    /**
     * @dev the denominator used to compute the %.
     */
    uint private constant CLAIM_DENOMINATOR = 100;

    /**
     * @dev the address that contains payment funds to be transferred from this
     * wallet to the user.
     */
    address private TREASURE;

    /**
     * @dev the struct that hold all claim and claimed info from an user.
     */
    struct ClaimInfo {
        address user;
        uint contributedAmount;
        uint claimedAmount;
        uint claimedIn;
    }

    /**
     * @dev a map containing claim/claimed info of all users eligible to claim.
     */
    mapping(address => ClaimInfo) private claimData;

    /**
     * @dev the token used to pay the claim to the user, ex: USDC.
     */
    IERC20 private immutable paymentToken;

    /**
     * @dev allow users to claim the airdrop after admin set it to true.
     */
    bool public usersCanClaim = false;

    /**
     * @dev the total of addresses loaded into contract.
     */
    uint public totalUsers = 0;

    /**
     * @dev the total of addresses that already claimed.
     */
    uint public totalClaims = 0;

    /**
     * @dev the total of USDC already claimed.
     */
    uint public totalClaimsAmount = 0;

    error InitInvalidClaimValue();
    error InitInvalidTreasure();
    error LoadClaimAlreadySet();
    error UserAlreadyClaimed();
    error UserNotFound();
    error ClaimInsufficientTreasureAllowance();
    error ClaimInsufficientTreasureBalance();
    error claimNotOpenYet();
    error InvalidDataToLoad(uint addresses, uint amounts);

    /**
     * @dev Emitted when admin loads the claim data via hardhat loadClaimInfo task.
     *
     * - claims: the total of users that can claim.
     * - totalUsers: the total amount of addresses loaded into contract.
     */
    event LoadClaimInfo(uint claims, uint totalUsers);

    /**
     * @dev Emitted when user successful claim.
     *
     * - user: contains msg.sender that called claim().
     * - claimedIn: contains the timestamp of the claim.
     * - contributedAmount: set during initial load, contains amount of pre-sale contributed.
     * - claimedAmount: contains the amount sent to the user in paymentToken.
     */
    event Claim(address user, uint claimedIn, uint contributedAmount, uint claimedAmount);

    /**
     * @dev Emitted on any claim status change.
     */
    event ClaimOpenStatus(bool status);

    constructor(address _paymentToken, uint _claimPercentValue, address _TREASURE){

        /**
         * @dev the payment token, must be USDC or 6 decimal, to match airdrop data.
         */
        paymentToken = IERC20(_paymentToken);
        paymentToken.totalSupply();

        /**
         * @dev set and test if % is valid.
         */
        if( _claimPercentValue == 0 || _claimPercentValue > 100 ){
            revert InitInvalidClaimValue();
        }
        claimPercentValue = _claimPercentValue;

        /**
         * @dev set and test if TREASURE is valid, this is where
         * source funds are stored and this contract must have
         * allowance to transfer it to the user.
         */
        if( _TREASURE == address(0) ){
            revert InitInvalidTreasure();
        }
        TREASURE = _TREASURE;

    }

    /**
     * @dev Admin function that allow admin to open claim to users.
     */
    function setClaimOpenStatus( bool status ) external onlyOwner{
        usersCanClaim = status;
        emit ClaimOpenStatus(status);
    }

    /**
     * @dev contract admin can use this function to load all user claim data.
     * Once the data is loaded we prevent this function being called again.
     * During data processing we compute all allowance needed to be set in
     * the paymentToken contract at TREASURE user.
     */
    function loadClaims(address[] memory users, uint[] memory amounts) external onlyOwner{

        if( users.length != amounts.length ){
            revert InvalidDataToLoad(users.length, amounts.length);
        }

        /**
         * @dev set the claimData by user and compute the allowance needed.
         */
        for( uint i = 0 ; i < users.length; ++i){
            address user = users[i];
            uint contributedAmount = amounts[i];
            // allow admin to retry the upload if tx fail
            if( claimData[ user ].contributedAmount > 0 )
                continue;
            claimData[ user ].user = user;
            claimData[ user ].contributedAmount = contributedAmount;
        }

        /**
         * @dev Update the global number of address for stats.
         */
        totalUsers += users.length;

        /**
         * @dev admin can check for the event LoadClaimInfo to see how much users loaded.
         */
        emit LoadClaimInfo(users.length, totalUsers);

    }

    /**
     * @dev use to fetch information about a claim by user address.
     */
    function getClaimInfo(address user) public view returns(ClaimInfo memory){
        return claimData[user];
    }

    /**
     * @dev compute a token amount by user address.
     * if user already claimed return 0 otherwise return the % to ben sent.
     */
    function getClaimAmount(address user) public view returns(uint){

        ClaimInfo memory user = claimData[user];

        /**
         * @dev return 0 if user does not exist or already claimed.
         */
        if( user.claimedIn > 0 || user.contributedAmount == 0 ){
            return 0;
        }

        //the contributed and airdrop token are the same: USDC 6 decimals.
        return (user.contributedAmount * claimPercentValue ) / CLAIM_DENOMINATOR;

    }

    /**
     * @dev function that should be called only once by a user to claim a reward.
     */
    function claim() external {

        /**
         * @dev users can claim only after admin enable it.
         */
        if( usersCanClaim == false ){
            revert claimNotOpenYet();
        }

        /**
         * @dev use storage format to set the claimed info for this user.
         */
        ClaimInfo storage user = claimData[msg.sender];

        /**
         * @dev prevent user calling this function without a valid claim info.
         */
        if( user.contributedAmount == 0 ){
            revert UserNotFound();
        }

        /**
         * @dev revert if user already claimed.
         */
        if( user.claimedIn > 0 ){
            revert UserAlreadyClaimed();
        }

        /**
         * @dev set both timestamp and amount claimed.
         */
        user.claimedAmount = getClaimAmount(msg.sender);
        // set claimedIn or return value above will fail.
        user.claimedIn = block.timestamp;

        // set the number of address that already claimed.
        ++totalClaims;

        // set the amount of USDC already claimed.
        totalClaimsAmount += user.claimedAmount;

        /**
         * @dev revert if we don't have sufficient allowance on treasure
         * address to transfer funds from.
         */
        if( paymentToken.allowance(TREASURE, address(this)) < user.claimedAmount ){
            revert ClaimInsufficientTreasureAllowance();
        }

        /**
         * @dev revert if we don't have sufficient fundos on treasure
         * address to transfer funds from.
         */
        if( paymentToken.balanceOf(TREASURE) < user.claimedAmount ){
            revert ClaimInsufficientTreasureBalance();
        }

        /**
         * @dev do the token transfer from treasure address to msg.sender.
         */
        paymentToken.safeTransferFrom(TREASURE, msg.sender, user.claimedAmount);

        /**
         * @dev event with all claim info to allow future data processing.
         */
        emit Claim(msg.sender, user.claimedIn, user.contributedAmount, user.claimedAmount);

    }
}
