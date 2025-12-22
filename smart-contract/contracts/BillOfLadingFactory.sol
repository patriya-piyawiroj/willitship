// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BillOfLading.sol";

/**
 * @title BillOfLadingFactory
 * @notice Factory contract that enforces global uniqueness for each bill-of-lading (BoL)
 * and deploys per-BoL BillOfLading contracts.
 */
contract BillOfLadingFactory {
    // Mapping from BoL hash to BillOfLading contract address
    mapping(bytes32 => address) public bolRegistry;
    
    // Default stablecoin address (can be set by owner)
    address public defaultStablecoin;
    
    /**
     * @notice Set the default stablecoin address
     * @param stablecoin The address of the stablecoin token contract
     */
    function setDefaultStablecoin(address stablecoin) external {
        require(stablecoin != address(0), "BillOfLadingFactory: stablecoin cannot be zero address");
        defaultStablecoin = stablecoin;
    }
    
    /**
     * @notice Creates a new trade for a unique BoL hash
     * @param bolHash The hash of the bill-of-lading (must be unique)
     * @param declaredValue The declared value of the trade
     * @param shipper The shipper's wallet address
     * @param buyer The buyer's wallet address
     * @return billOfLadingAddress The address of the newly deployed BillOfLading contract
     */
    function createBoL(
        bytes32 bolHash,
        uint256 declaredValue,
        address shipper,
        address buyer,
        string memory blNumber
    ) external returns (address billOfLadingAddress) {
        // Require that this BoL hash hasn't been used before
        require(bolRegistry[bolHash] == address(0), "BillOfLadingFactory: BoL hash already exists");
        
        // Deploy a new BillOfLading contract
        BillOfLading billOfLading = new BillOfLading(
            bolHash,
            shipper,
            buyer,
            declaredValue,
            blNumber
        );
        
        billOfLadingAddress = address(billOfLading);
        bolRegistry[bolHash] = billOfLadingAddress;
        
        // Set stablecoin if default is set
        if (defaultStablecoin != address(0)) {
            billOfLading.setStablecoin(defaultStablecoin);
        }
        
        return billOfLadingAddress;
    }
    
    /**
     * @notice Check if a BoL hash has been registered
     * @param bolHash The BoL hash to check
     * @return exists Whether the BoL hash exists
     * @return billOfLadingAddress The address of the BillOfLading contract if it exists
     */
    function getBoLByHash(bytes32 bolHash) external view returns (bool exists, address billOfLadingAddress) {
        billOfLadingAddress = bolRegistry[bolHash];
        exists = billOfLadingAddress != address(0);
    }
}

