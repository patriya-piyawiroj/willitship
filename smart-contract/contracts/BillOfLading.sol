// SPDX-License-Identifier: MIT
// Updated: 2024-12-22 - surrender() now allows buyer to call
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BillOfLading
 * @notice BillOfLading contract for managing a single bill-of-lading trade finance transaction
 * @dev One BillOfLading contract per BoL, deployed by BillOfLadingFactory
 */
contract BillOfLading is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Trade state structure
    struct TradeState {
        bytes32 bolHash;
        address buyer;
        address seller;
        address stablecoin;
        uint256 declaredValue;
        uint256 totalFunded; // Tracks claim tokens issued (amount + interest)
        uint256 totalPaid; // Tracks actual stablecoin payments made
        uint256 totalRepaid;
        bool settled;
        bool claimsIssued;
        bool fundingEnabled;
        bool nftMinted;
    }

    // Metadata structure for names and locations
    struct Metadata {
        string sellerName;
        string carrierName;
        string buyerName;
        string placeOfReceipt;
        string placeOfDelivery;
    }
    
    // Claim token contract
    ClaimToken public claimToken;

    // Trade state
    TradeState public tradeState;

    // Metadata (names and locations)
    Metadata public metadata;
    
    // Mapping to track offers (offerId => Offer struct)
    struct OfferStruct {
        address investor;
        uint256 amount;
        uint256 interestRateBps;
        bool accepted;
    }
    mapping(uint256 => OfferStruct) public offers;
    uint256 public nextOfferId;
    
    // BoL number (stored as string)
    string public blNumber;
    
    // BoL NFT token ID (always 1, since we only mint one)
    uint256 public constant BOL_TOKEN_ID = 1;
    
    // Events
    event Created(
        address indexed buyer,
        address indexed seller,
        uint256 declaredValue,
        string blNumber,
        string sellerName,
        string carrierName,
        string buyerName,
        string placeOfReceipt,
        string placeOfDelivery
    );
    event Active();
    event Offer(address indexed investor, uint256 amount, uint256 interestRateBps, uint256 offerId);
    event OfferAccepted(address indexed investor, uint256 amount, uint256 claimTokens, uint256 interestRateBps, uint256 offerId);
    event OfferCancelled(uint256 indexed offerId, address indexed investor, uint256 amount);
    event Funded(address indexed investor, uint256 amount, uint256 claimTokens, uint256 interestRateBps);
    event Full();
    event Inactive();
    event Paid(address indexed buyer, uint256 amount);
    event Claimed(address indexed holder, uint256 amount, uint256 claimTokensBurned);
    event Refunded(address indexed buyer, uint256 amount);
    event Settled();
    
    /**
     * @notice Initialize a new BillOfLading contract
     * @param bolHash The hash of the bill-of-lading
     * @param seller The seller's address (shipper)
     * @param buyer The buyer's address
     * @param declaredValue The declared value of the trade
     * @param _blNumber The bill of lading number
     */
    constructor(
        bytes32 bolHash,
        address seller,
        address buyer,
        uint256 declaredValue,
        string memory _blNumber,
        string memory _sellerName,
        string memory _carrierName,
        string memory _buyerName,
        string memory _placeOfReceipt,
        string memory _placeOfDelivery
    ) ERC721("Bill of Lading", "BOL") Ownable(msg.sender) {
        require(seller != address(0), "BillOfLading: seller cannot be zero address");
        require(buyer != address(0), "BillOfLading: buyer cannot be zero address");
        require(declaredValue > 0, "BillOfLading: declared value must be greater than zero");

        tradeState = TradeState({
            bolHash: bolHash,
            buyer: buyer,
            seller: seller,
            stablecoin: address(0), // Will be set later
            declaredValue: declaredValue,
            totalFunded: 0,
            totalPaid: 0,
            totalRepaid: 0,
            settled: false,
            claimsIssued: false,
            fundingEnabled: false,
            nftMinted: false
        });

        // Initialize metadata
        metadata = Metadata({
            sellerName: _sellerName,
            carrierName: _carrierName,
            buyerName: _buyerName,
            placeOfReceipt: _placeOfReceipt,
            placeOfDelivery: _placeOfDelivery
        });

        // Store blNumber
        blNumber = _blNumber;

        // Deploy the claim token contract
        claimToken = new ClaimToken(address(this), declaredValue);

        // Emit Created event with all metadata
        emit Created(
            buyer,
            seller,
            declaredValue,
            _blNumber,
            _sellerName,
            _carrierName,
            _buyerName,
            _placeOfReceipt,
            _placeOfDelivery
        );
    }
    
    /**
     * @notice Set the stablecoin address (can only be called once)
     * @param stablecoin The address of the stablecoin token contract
     */
    function setStablecoin(address stablecoin) external onlyOwner {
        require(tradeState.stablecoin == address(0), "BillOfLading: stablecoin already set");
        require(stablecoin != address(0), "BillOfLading: stablecoin cannot be zero address");
        tradeState.stablecoin = stablecoin;
    }
    
    /**
     * @notice Mint the BoL NFT (can only be called once)
     * @param buyer The buyer's address
     * @param seller The seller's address
     * @param declaredValue The declared value
     */
    function mint(address buyer, address seller, uint256 declaredValue) external {
        require(!tradeState.nftMinted, "BillOfLading: NFT already minted");
        require(buyer == tradeState.buyer, "BillOfLading: buyer mismatch");
        require(seller == tradeState.seller, "BillOfLading: seller mismatch");
        require(declaredValue == tradeState.declaredValue, "BillOfLading: declaredValue mismatch");
        require(tradeState.stablecoin != address(0), "BillOfLading: stablecoin not set");
        
        // Mint the BoL NFT to this contract (owned by BillOfLading contract)
        _mint(address(this), BOL_TOKEN_ID);

        tradeState.nftMinted = true;
    }
    
    /**
     * @notice Issue claim tokens and enable funding (can only be called once)
     * @dev Mints all claim tokens to seller and enables funding, emits "Active" event
     */
    function issueClaims() external {
        require(tradeState.nftMinted, "BillOfLading: NFT must be minted first");
        require(!tradeState.claimsIssued, "BillOfLading: claims already issued");
        require(!tradeState.settled, "BillOfLading: trade is settled");
        
        // Mint all claim tokens to seller (they own all tokens initially)
        claimToken.mint(tradeState.seller, tradeState.declaredValue);
        
        tradeState.claimsIssued = true;
        tradeState.fundingEnabled = true;
        
        emit Active();
    }
    
    /**
     * @notice Create an offer to fund the trade (called by investor/bank)
     * @param amount The amount of stablecoin to fund (actual payment)
     * @param interestRateBps Interest rate in basis points (100 = 1%, 1000 = 10%)
     * @dev Creates an offer that can be accepted by the seller
     * Example: offer 10 with 1% interest (100 bps) = pay 10, get 10.1 claim tokens
     * @return offerId The ID of the created offer
     */
    function offer(uint256 amount, uint256 interestRateBps) external returns (uint256) {
        require(tradeState.fundingEnabled, "BillOfLading: funding not enabled");
        require(!tradeState.settled, "BillOfLading: trade is settled");
        require(amount > 0, "BillOfLading: amount must be greater than zero");
        require(tradeState.stablecoin != address(0), "BillOfLading: stablecoin not set");
        
        // Calculate claim tokens with interest: amount + (amount * interestRateBps) / 10000
        // Using fixed-point arithmetic to avoid precision loss
        // Example: 10 with 1% (100 bps) = 10 + (10 * 100) / 10000 = 10 + 0.1 = 10.1
        uint256 claimTokens = amount + (amount * interestRateBps) / 10000;
        
        // Check that total funded (including interest) doesn't exceed declared value
        require(
            tradeState.totalFunded + claimTokens <= tradeState.declaredValue,
            "BillOfLading: offer with interest would exceed declared value"
        );
        
        // Transfer tokens from investor to this contract (escrow pattern)
        IERC20 stablecoin = IERC20(tradeState.stablecoin);
        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
        
        // Create offer
        uint256 offerId = nextOfferId++;
        offers[offerId] = OfferStruct({
            investor: msg.sender,
            amount: amount,
            interestRateBps: interestRateBps,
            accepted: false
        });
        
        emit Offer(msg.sender, amount, interestRateBps, offerId);
        
        return offerId;
    }
    
    /**
     * @notice Accept an offer and fund the trade (called by seller)
     * @param offerId The ID of the offer to accept
     * @dev Transfers money, mints claim tokens, and updates state
     */
    function acceptOffer(uint256 offerId) external nonReentrant {
        require(msg.sender == tradeState.seller, "BillOfLading: only seller can accept offers");
        require(tradeState.fundingEnabled, "BillOfLading: funding not enabled");
        require(!tradeState.settled, "BillOfLading: trade is settled");
        require(tradeState.stablecoin != address(0), "BillOfLading: stablecoin not set");
        
        OfferStruct storage offerData = offers[offerId];
        require(offerData.investor != address(0), "BillOfLading: offer does not exist");
        require(!offerData.accepted, "BillOfLading: offer already accepted");
        
        uint256 amount = offerData.amount;
        uint256 interestRateBps = offerData.interestRateBps;
        
        // Calculate claim tokens with interest: amount + (amount * interestRateBps) / 10000
        uint256 claimTokens = amount + (amount * interestRateBps) / 10000;
        
        // Double-check that total funded (including interest) doesn't exceed declared value
        require(
            tradeState.totalFunded + claimTokens <= tradeState.declaredValue,
            "BillOfLading: accepting offer would exceed declared value"
        );
        
        IERC20 stablecoin = IERC20(tradeState.stablecoin);
        
        // Transfer stablecoin from contract to seller (tokens already in escrow)
        // Only the actual amount, not including interest
        stablecoin.safeTransfer(tradeState.seller, amount);
        
        // Transfer claim tokens from seller to investor (amount + interest)
        // Seller already owns all claim tokens from issueClaims(), we transfer them here
        claimToken.transferFromOwner(tradeState.seller, offerData.investor, claimTokens);
        
        // Update state: totalFunded tracks claim tokens (includes interest), totalPaid tracks actual payments
        tradeState.totalFunded += claimTokens;
        tradeState.totalPaid += amount;
        
        // Mark offer as accepted
        offerData.accepted = true;
        
        emit OfferAccepted(offerData.investor, amount, claimTokens, interestRateBps, offerId);
        
        // Check if fully funded
        if (tradeState.totalFunded == tradeState.declaredValue) {
            emit Full();
        }
    }
    
    /**
     * @notice Cancel an offer and refund tokens to investor (called by investor)
     * @param offerId The ID of the offer to cancel
     * @dev Refunds the escrowed tokens back to the investor
     */
    function cancelOffer(uint256 offerId) external nonReentrant {
        require(tradeState.stablecoin != address(0), "BillOfLading: stablecoin not set");
        
        OfferStruct storage offerData = offers[offerId];
        require(offerData.investor != address(0), "BillOfLading: offer does not exist");
        require(msg.sender == offerData.investor, "BillOfLading: only investor can cancel their offer");
        require(!offerData.accepted, "BillOfLading: offer already accepted");
        
        uint256 amount = offerData.amount;
        
        // Refund tokens back to investor
        IERC20 stablecoin = IERC20(tradeState.stablecoin);
        stablecoin.safeTransfer(offerData.investor, amount);
        
        // Delete offer
        delete offers[offerId];
        
        emit OfferCancelled(offerId, offerData.investor, amount);
    }
    
    /**
     * @notice Surrender the trade (disables funding)
     * @dev Disables funding and emits "Inactive" event
     * @notice Only the buyer can surrender the trade
     */
    function surrender() external {
        require(msg.sender == tradeState.buyer, "BillOfLading: only buyer can surrender");
        require(tradeState.fundingEnabled, "BillOfLading: funding is not enabled");
        require(!tradeState.settled, "BillOfLading: trade is settled");
        
        tradeState.fundingEnabled = false;
        
        emit Inactive();
    }
    
    /**
     * @notice Pay stablecoin to escrow (called by buyer)
     * @param amount The amount of stablecoin to pay
     */
    function pay(uint256 amount) external nonReentrant {
        require(msg.sender == tradeState.buyer, "BillOfLading: only buyer can pay");
        require(!tradeState.settled, "BillOfLading: trade is settled");
        require(amount > 0, "BillOfLading: amount must be greater than zero");
        require(tradeState.stablecoin != address(0), "BillOfLading: stablecoin not set");
        
        IERC20 stablecoin = IERC20(tradeState.stablecoin);
        
        // Transfer stablecoin from buyer to this contract (escrow)
        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
        
        tradeState.totalRepaid += amount;
        
        emit Paid(msg.sender, amount);
    }
    
    /**
     * @notice Redeem claim tokens for stablecoin (called by claim holder)
     * @dev Transfers money to claim token owner from contract
     * - Funded tokens (transferred to investors): redeem 1:1 from totalFunded pool
     * - Unfunded tokens (held by seller): redeem 1:1 from (totalRepaid - totalPaid) pool
     * When all tokens have been claimed, calls _settle which burns the NFT and emits "Settled"
     */
    function redeem() external nonReentrant {
        require(!tradeState.settled, "BillOfLading: trade is settled");
        require(tradeState.totalRepaid > 0, "BillOfLading: no repayments available");
        require(tradeState.stablecoin != address(0), "BillOfLading: stablecoin not set");
        require(tradeState.claimsIssued, "BillOfLading: claims not issued");
        
        uint256 holderBalance = claimToken.balanceOf(msg.sender);
        require(holderBalance > 0, "BillOfLading: no claim tokens to redeem");
        
        uint256 totalSupply = claimToken.totalSupply();
        require(totalSupply > 0, "BillOfLading: no claim tokens in circulation");
        
        uint256 redeemableAmount = 0;
        uint256 unfundedTokens = tradeState.declaredValue - tradeState.totalFunded;
        
        // Simple logic: seller has unfunded tokens, investors have funded tokens
        // If holder is seller, they have unfunded tokens (1:1 redemption from buyer payment)
        // If holder is investor, they have funded tokens (1:1 redemption from totalFunded)
        
        // Check if holder is seller (seller owns unfunded tokens)
        if (msg.sender == tradeState.seller && unfundedTokens > 0) {
            // Seller redeems unfunded tokens 1:1 from (totalRepaid - totalPaid)
            // Cap at available unfunded payment
            uint256 availableUnfundedPayment = tradeState.totalRepaid > tradeState.totalPaid 
                ? tradeState.totalRepaid - tradeState.totalPaid 
                : 0;
            // Seller can redeem up to their unfunded tokens (which equals unfundedTokens)
            uint256 sellerRedeemable = holderBalance <= availableUnfundedPayment 
                ? holderBalance 
                : availableUnfundedPayment;
            redeemableAmount = sellerRedeemable;
        } else {
            // Investor redeems funded tokens 1:1 from totalFunded
            // Each funded token is worth 1 stablecoin from totalFunded pool
            // Check how much they've already redeemed
            uint256 alreadyRedeemed = redeemedAmounts[msg.sender];
            if (holderBalance > alreadyRedeemed) {
                // Redeem 1:1 (each token = 1 stablecoin from totalFunded)
                redeemableAmount = holderBalance - alreadyRedeemed;
            }
        }
        
        require(redeemableAmount > 0, "BillOfLading: nothing to redeem");
        
        // Burn all claim tokens held by this user
        uint256 tokensToBurn = holderBalance;
        
        // Update redeemed tracking (for investors only, track their funded redemption)
        if (msg.sender != tradeState.seller && tradeState.totalFunded > 0) {
            redeemedAmounts[msg.sender] = holderBalance; // Mark all as redeemed
        }
        
        // Transfer stablecoin from escrow to holder
        IERC20 stablecoin = IERC20(tradeState.stablecoin);
        stablecoin.safeTransfer(msg.sender, redeemableAmount);
        
        // Burn claim tokens
        claimToken.burn(msg.sender, tokensToBurn);
        
        emit Claimed(msg.sender, redeemableAmount, tokensToBurn);
        
        // Check if all claim tokens are burned
        if (claimToken.totalSupply() == 0) {
            _settle();
        }
    }
    
    /**
     * @notice Refund excess payment to buyer (called by buyer after all investors redeem)
     * @dev Returns the difference between what was paid and what was funded
     * Can only be called after all claim tokens are burned (all investors have redeemed)
     */
    function refundBuyer() external nonReentrant {
        require(msg.sender == tradeState.buyer, "BillOfLading: only buyer can refund");
        require(!tradeState.settled, "BillOfLading: trade is settled");
        require(tradeState.totalRepaid > 0, "BillOfLading: no payments made");
        require(claimToken.totalSupply() == 0, "BillOfLading: all claim tokens must be redeemed first");
        require(tradeState.stablecoin != address(0), "BillOfLading: stablecoin not set");
        
        // Calculate excess: what was paid minus what was actually paid by investors (totalPaid)
        // Note: totalFunded includes interest, so we use totalPaid for the refund calculation
        uint256 excess = tradeState.totalRepaid > tradeState.totalPaid 
            ? tradeState.totalRepaid - tradeState.totalPaid 
            : 0;
        
        require(excess > 0, "BillOfLading: no excess to refund");
        
        // Transfer excess back to buyer
        IERC20 stablecoin = IERC20(tradeState.stablecoin);
        stablecoin.safeTransfer(msg.sender, excess);
        
        // Update totalRepaid to reflect the refund
        tradeState.totalRepaid -= excess;
        
        emit Refunded(msg.sender, excess);
        
        // Now settle the trade
        _settle();
    }
    
    /**
     * @notice Internal function to settle the trade
     * @dev Burns the BoL NFT and marks trade as settled, emits "Settled" event
     */
    function _settle() internal {
        require(!tradeState.settled, "BillOfLading: already settled");
        
        tradeState.settled = true;
        
        // Burn the BoL NFT
        _burn(BOL_TOKEN_ID);
        
        emit Settled();
    }
    
    // Mapping to track redeemed amounts per claim holder
    mapping(address => uint256) public redeemedAmounts;
    
    /**
     * @notice Get the current state of the trade
     * @return state The trade state struct
     */
    function getTradeState() external view returns (TradeState memory state) {
        return tradeState;
    }
    
    // Note: The BoL NFT is owned by this contract and will not be transferred
    // since the contract is the owner. When settled, it is burned via _burn().
}

/**
 * @title ClaimToken
 * @notice ERC20 token representing claims on a trade
 * @dev Fixed supply equal to declared value, minted during funding, burned during redemption
 */
contract ClaimToken is ERC20, Ownable {
    uint256 public immutable maxSupply;
    
    constructor(address billOfLadingContract, uint256 _maxSupply) ERC20("Trade Claim Token", "CLAIM") Ownable(billOfLadingContract) {
        maxSupply = _maxSupply;
    }
    
    /**
     * @notice Mint claim tokens (only callable by BillOfLading contract)
     * @param to Address to mint tokens to
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= maxSupply, "ClaimToken: exceeds max supply");
        _mint(to, amount);
    }
    
    /**
     * @notice Burn claim tokens (only callable by BillOfLading contract)
     * @param from Address to burn tokens from
     * @param amount Amount to burn
     */
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
    
    /**
     * @notice Transfer claim tokens on behalf of a holder (only callable by BillOfLading contract)
     * @param from Address to transfer tokens from
     * @param to Address to transfer tokens to
     * @param amount Amount to transfer
     * @dev Allows the BillOfLading contract to transfer tokens without requiring approval
     */
    function transferFromOwner(address from, address to, uint256 amount) external onlyOwner {
        _transfer(from, to, amount);
    }
}
