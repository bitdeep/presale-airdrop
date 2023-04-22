// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// import "hardhat/console.sol";

/**
 * @title PresaleAirdrop
 * @dev This is a claim airdrop contract that allow the amount to be claimed
 * be computed using %.
 * Admin loads the claim data once a time.
 *
 * Once user claim it's airdrop, it can't claim again.
 *
 * @author: bitdeep
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
     * @dev control variable to prevent loadClaims admin function being called twice.
     */
    bool private LoadClaimInitialized;

    error InitInvalidClaimValue();
    error InitInvalidTreasure();
    error LoadClaimAlreadySet();
    error ClaimDataNotLoaded();
    error UserAlreadyClaimed();
    error UserNotFound();
    error ClaimInsufficientTreasureAllowance();
    error ClaimInsufficientTreasureBalance();

    /**
     * @dev Emitted when admin loads the claim data via hardhat loadClaimInfo task.
     *
     * - claims: the total of users that can claim.
     * - allowanceNeeded: the total allowance needed in TREASURE address in paymentToken TOKEN.
     */
    event LoadClaimInfo(uint claims, uint allowanceNeeded);

    /**
     * @dev Emitted when user successful claim.
     *
     * - user: contains msg.sender that called claim().
     * - claimedIn: contains the timestamp of the claim.
     * - contributedAmount: set during initial load, contains amount of pre-sale contributed.
     * - claimedAmount: contains the amount sent to the user in paymentToken.
     */
    event Claim(address user, uint claimedIn, uint contributedAmount, uint claimedAmount);

    constructor(address _paymentToken, uint _claimPercentValue, address _TREASURE){

        /**
         * @dev we set and test if the ERC20 token is a valid token.
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
     * @dev contract admin can use this function to load all user claim data.
     * Once the data is loaded we prevent this function being called again.
     * During data processing we compute all allowance needed to be set in
     * the paymentToken contract at TREASURE user.
     */
    function loadClaims(ClaimInfo[] memory _claimData) external onlyOwner{

        /**
         * @dev make sure we call this function only once.
         */
        if( LoadClaimInitialized )
            revert LoadClaimAlreadySet();

        LoadClaimInitialized = true;

        /**
         * @dev used to store the amount of tokens needed for allowance.
         */
        uint allowanceNeeded = 0;

        /**
         * @dev set the claimData by user and compute the allowance needed.
         */
        for( uint i = 0 ; i < _claimData.length; ++i){
            address user = _claimData[i].user;
            claimData[ user ] = _claimData[i];
            allowanceNeeded += getClaimAmount(user);
        }

        /**
         * @dev admin can check for the event LoadClaimInfo to know the allowance needed.
         */
        emit LoadClaimInfo(_claimData.length, allowanceNeeded);

    }

    /**
     * @dev use to fetch information about a claim by user address.
     */
    function getClaimInfo(address user) public view returns(ClaimInfo){
        return claimData[user];
    }

    /**
     * @dev compute a token amount by user address.
     * if user already claimed return 0 otherwise return the % to ben sent.
     */
    function getClaimAmount(address user){

        ClaimInfo memory user = claimData[user];

        /**
         * @dev return 0 if user does not exist or already claimed.
         */
        if( user.claimedIn > 0 || user.contributedAmount == 0 ){
            return 0;
        }

        //TODO: review the formula and consider decimals between tokens.
        return (user.contributedAmount * claimPercentValue ) / CLAIM_DENOMINATOR;

    }

    /**
     * @dev function that should be called only once by a user to claim a reward.
     */
    function claim() external {

        /**
         * @dev prevent a call of this function before admin set the data.
         */
        if( LoadClaimInitialized == false ){
            revert ClaimDataNotLoaded();
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
        user.claimedIn = block.timestamp;
        user.claimedAmount = getClaimAmount(msg.sender);

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
