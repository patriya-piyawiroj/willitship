import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import { CONFIG } from '../lib/config';
import Modal from '../components/Modal';
import { getWallet, getContract, getPrivateKey, waitForTransaction, parseBlockchainError, getDeployments, getProvider } from '../lib/blockchain';
import { parseBlockchainError as parseError } from '../lib/utils';

export default function ShipmentDetails() {
  const router = useRouter();
  const { selectedShipmentHash, currentAccount, addActivityLog, refreshWallets } = useApp();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fundAmount, setFundAmount] = useState('');
  const [claimTokenBalance, setClaimTokenBalance] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState('info');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    if (selectedShipmentHash) {
      fetchShipmentDetails();
    } else {
      // If no shipment selected, redirect to home
      router.push('/');
    }
  }, [selectedShipmentHash]);

  // Fetch claim token balance when account or shipment changes
  useEffect(() => {
    if (shipment?.billOfLadingAddress && (currentAccount === 'investor' || currentAccount === 'seller')) {
      fetchClaimTokenBalance(shipment.billOfLadingAddress);
    } else {
      setClaimTokenBalance(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount, shipment?.billOfLadingAddress]);

  const fetchShipmentDetails = async () => {
    if (!selectedShipmentHash) return;
    
    try {
      setLoading(true);
      const url = `${CONFIG.API_URL}/shipments/${selectedShipmentHash}`;
      console.log('Fetching shipment from:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`Failed to fetch shipment details: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setShipment(data);
      // Auto-set pay amount to declared value for buyer
      if (data.declaredValue) {
        // Pay amount is always the full declared value
        // No need to store it in state since it's always derived from shipment
      }
      
      // Fetch claim token balance if user is investor or seller
      if ((currentAccount === 'investor' || currentAccount === 'seller') && data.billOfLadingAddress) {
        await fetchClaimTokenBalance(data.billOfLadingAddress);
      }
    } catch (error) {
      console.error('Error fetching shipment details:', error);
      setModalTitle('Error');
      setModalMessage(`Failed to load shipment details: ${error.message}\n\nHash: ${selectedShipmentHash}\nAPI URL: ${CONFIG.API_URL}`);
      setModalType('error');
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.push('/');
  };

  const handleEnableFunding = async () => {
    if (!shipment?.billOfLadingAddress) {
      setModalTitle('Error');
      setModalMessage('Shipment contract address not found.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    try {
      setIsProcessing(true);
      addActivityLog('Enabling funding...');

      // Get private key for seller
      const privateKey = getPrivateKey('seller');
      const wallet = getWallet(privateKey);

      // Get contract instance
      const contract = await getContract(shipment.billOfLadingAddress, 'BillOfLading', wallet);

      // Call issueClaims()
      const tx = await contract.issueClaims();
      addActivityLog(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await waitForTransaction(tx);
      addActivityLog(`Funding enabled successfully! Tx: ${receipt.hash}`);

      setModalTitle('Success');
      setModalMessage(`Funding has been enabled for this shipment!\n\nTransaction Hash: ${receipt.hash}`);
      setModalType('success');
      setShowModal(true);

      // Refresh shipment details
      await fetchShipmentDetails();
    } catch (error) {
      console.error('Error enabling funding:', error);
      const errorMessage = parseError(error);
      addActivityLog(`Failed to enable funding: ${errorMessage}`, 'error');
      setModalTitle('Error');
      setModalMessage(`Failed to enable funding:\n${errorMessage}`);
      setModalType('error');
      setShowModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFund = async () => {
    if (!fundAmount || parseFloat(fundAmount) <= 0) {
      setModalTitle('Error');
      setModalMessage('Please enter a valid funding amount.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    if (!shipment?.billOfLadingAddress) {
      setModalTitle('Error');
      setModalMessage('Shipment contract address not found.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    try {
      setIsProcessing(true);
      addActivityLog(`Funding shipment with ${fundAmount}...`);

      // Get private key for investor
      const privateKey = getPrivateKey('investor');
      const wallet = getWallet(privateKey);

      // Check ETH balance for gas fees
      const provider = getProvider();
      const ethBalance = await provider.getBalance(wallet.address);
      const minEthRequired = ethers.parseEther('0.01'); // Minimum 0.01 ETH for gas
      
      if (ethBalance < minEthRequired) {
        const balanceEth = ethers.formatEther(ethBalance);
        throw new Error(`Insufficient ETH for gas fees. Current balance: ${balanceEth} ETH. Please ensure the investor wallet has ETH.`);
      }

      // Validate shipment data
      if (!shipment.billOfLadingAddress && !shipment.contractAddress) {
        throw new Error('BillOfLading contract address not found in shipment data');
      }
      
      const bolAddress = shipment.billOfLadingAddress || shipment.contractAddress;
      if (!ethers.isAddress(bolAddress)) {
        throw new Error(`Invalid BillOfLading contract address: ${bolAddress}`);
      }

      // Get deployments to find stablecoin address
      const deployments = await getDeployments();
      const stablecoinAddress = deployments.contracts?.ERC20Stablecoin;
      
      if (!stablecoinAddress) {
        throw new Error('Stablecoin address not found in deployments.json');
      }
      
      if (!ethers.isAddress(stablecoinAddress)) {
        throw new Error(`Invalid stablecoin address: ${stablecoinAddress}`);
      }

      // Verify contracts exist on-chain
      const bolCode = await provider.getCode(bolAddress);
      if (bolCode === '0x' || bolCode === '0x0') {
        throw new Error(`BillOfLading contract does not exist at address: ${bolAddress}`);
      }
      
      const stablecoinCode = await provider.getCode(stablecoinAddress);
      if (stablecoinCode === '0x' || stablecoinCode === '0x0') {
        throw new Error(`ERC20Stablecoin contract does not exist at address: ${stablecoinAddress}`);
      }

      // Get contract instances
      const bolContract = await getContract(bolAddress, 'BillOfLading', wallet);
      const stablecoinContract = await getContract(stablecoinAddress, 'ERC20Stablecoin', wallet);

      // Convert amount to wei (assuming 18 decimals for stablecoin)
      const amountWei = ethers.parseEther(fundAmount);

      // Check current allowance with error handling
      let currentAllowance;
      try {
        currentAllowance = await stablecoinContract.allowance(wallet.address, bolAddress);
      } catch (error) {
        console.error('Error checking allowance:', error);
        console.error('Stablecoin address:', stablecoinAddress);
        console.error('BoL address:', bolAddress);
        console.error('Wallet address:', wallet.address);
        throw new Error(`Failed to check allowance. Make sure contracts are deployed. Stablecoin: ${stablecoinAddress}, BoL: ${bolAddress}. Error: ${error.message}`);
      }
      
      // If allowance is insufficient, approve first
      if (currentAllowance < amountWei) {
        addActivityLog(`Approving stablecoin... (current allowance: ${ethers.formatEther(currentAllowance)})`);
        const approveTx = await stablecoinContract.approve(bolAddress, amountWei);
        await waitForTransaction(approveTx);
        addActivityLog(`Approval confirmed`);
      }

      // Call fund(amount)
      const tx = await bolContract.fund(amountWei);
      addActivityLog(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await waitForTransaction(tx);
      addActivityLog(`Funded successfully! Amount: ${fundAmount}, Tx: ${receipt.hash}`);

      setModalTitle('Success');
      setModalMessage(`Shipment funded successfully!\n\nAmount: ${fundAmount}\nTransaction Hash: ${receipt.hash}`);
      setModalType('success');
      setShowModal(true);

      // Clear fund amount and refresh
      setFundAmount('');
      await fetchShipmentDetails();
      
      // Refresh wallet balances to show updated stablecoin balance
      if (refreshWallets) {
        await refreshWallets();
      }
    } catch (error) {
      console.error('Error funding shipment:', error);
      const errorMessage = parseError(error);
      addActivityLog(`Failed to fund shipment: ${errorMessage}`, 'error');
      setModalTitle('Error');
      setModalMessage(`Failed to fund shipment:\n${errorMessage}`);
      setModalType('error');
      setShowModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkReceived = async () => {
    if (!shipment?.billOfLadingAddress) {
      setModalTitle('Error');
      setModalMessage('Shipment contract address not found.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    try {
      setIsProcessing(true);
      addActivityLog('Marking shipment as received...');

      // Get private key for buyer
      const privateKey = getPrivateKey('buyer');
      const wallet = getWallet(privateKey);

      // Get contract instance
      const bolAddress = shipment.billOfLadingAddress || shipment.contractAddress;
      if (!bolAddress || !ethers.isAddress(bolAddress)) {
        throw new Error(`Invalid BillOfLading contract address: ${bolAddress}`);
      }
      
      const contract = await getContract(bolAddress, 'BillOfLading', wallet);

      // Call surrender()
      const tx = await contract.surrender();
      addActivityLog(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await waitForTransaction(tx);
      addActivityLog(`Shipment marked as received! Tx: ${receipt.hash}`);

      setModalTitle('Success');
      setModalMessage(`Shipment has been marked as received!\n\nTransaction Hash: ${receipt.hash}`);
      setModalType('success');
      setShowModal(true);

      // Refresh shipment details and wallet balances
      await fetchShipmentDetails();
      if (refreshWallets) {
        await refreshWallets();
      }
    } catch (error) {
      console.error('Error marking shipment as received:', error);
      const errorMessage = parseError(error);
      addActivityLog(`Failed to mark shipment as received: ${errorMessage}`, 'error');
      setModalTitle('Error');
      setModalMessage(`Failed to mark shipment as received:\n${errorMessage}`);
      setModalType('error');
      setShowModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePay = async () => {
    if (!shipment?.billOfLadingAddress) {
      setModalTitle('Error');
      setModalMessage('Shipment contract address not found.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    if (!shipment?.declaredValue) {
      setModalTitle('Error');
      setModalMessage('Declared value not found.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    try {
      // Buyer must pay the full declared value
      const declaredValue = parseFloat(shipment.declaredValue);
      const formattedValue = formatValue(shipment.declaredValue);

      // Get buyer's wallet and stablecoin balance
      const privateKey = getPrivateKey('buyer');
      const wallet = getWallet(privateKey);
      
      // Get deployments to find stablecoin address
      const deployments = await getDeployments();
      const stablecoinAddress = deployments.contracts?.ERC20Stablecoin;
      
      if (!stablecoinAddress) {
        throw new Error('Stablecoin address not found');
      }

      // Get stablecoin contract to check balance
      const stablecoinContract = await getContract(stablecoinAddress, 'ERC20Stablecoin', wallet);
      const buyerBalance = await stablecoinContract.balanceOf(wallet.address);
      const balanceFormatted = ethers.formatEther(buyerBalance);
      
      // Convert declared value to wei for comparison
      const amountWei = ethers.parseEther(declaredValue.toString());
      
      // Calculate remaining balance
      const remainingBalance = buyerBalance >= amountWei 
        ? ethers.formatEther(buyerBalance - amountWei)
        : '0';

      // Show confirmation modal with balance details
      setModalTitle('Confirm Payment');
      setModalMessage(
        `Payment Details:\n\n` +
        `Current Balance: ${parseFloat(balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 2 })}\n` +
        `Payment Amount: ${formattedValue}\n` +
        `Remaining Balance: ${parseFloat(remainingBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}\n\n` +
        `This will transfer ${formattedValue} to the contract.`
      );
      setModalType('info');
      setPendingAction('pay');
      setShowConfirmModal(true);
    } catch (error) {
      console.error('Error preparing payment confirmation:', error);
      setModalTitle('Error');
      setModalMessage(`Failed to prepare payment confirmation:\n${error.message}`);
      setModalType('error');
      setShowModal(true);
    }
  };

  const handleConfirmPay = async () => {
    setShowConfirmModal(false);

    if (!shipment?.billOfLadingAddress) {
      setModalTitle('Error');
      setModalMessage('Shipment contract address not found.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    if (!shipment?.declaredValue) {
      setModalTitle('Error');
      setModalMessage('Declared value not found.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    try {
      setIsProcessing(true);
      // Buyer must pay the full declared value
      const declaredValue = parseFloat(shipment.declaredValue);
      const formattedValue = formatValue(shipment.declaredValue);
      addActivityLog(`Making payment of ${formattedValue} (full declared value)...`);

      // Get private key for buyer
      const privateKey = getPrivateKey('buyer');
      const wallet = getWallet(privateKey);

      // Get deployments to find stablecoin address
      const deployments = await getDeployments();
      const stablecoinAddress = deployments.contracts?.ERC20Stablecoin;
      
      if (!stablecoinAddress) {
        throw new Error('Stablecoin address not found in deployments.json');
      }
      
      if (!ethers.isAddress(stablecoinAddress)) {
        throw new Error(`Invalid stablecoin address: ${stablecoinAddress}`);
      }

      // Get contract instances
      const bolAddress = shipment.billOfLadingAddress || shipment.contractAddress;
      if (!bolAddress || !ethers.isAddress(bolAddress)) {
        throw new Error(`Invalid BillOfLading contract address: ${bolAddress}`);
      }
      
      const contract = await getContract(bolAddress, 'BillOfLading', wallet);
      const stablecoinContract = await getContract(stablecoinAddress, 'ERC20Stablecoin', wallet);

      // Convert declared value to wei (assuming 18 decimals for stablecoin)
      // declaredValue is already in human-readable format (e.g., "100")
      const amountWei = ethers.parseEther(declaredValue.toString());

      // Check buyer's stablecoin balance
      const buyerBalance = await stablecoinContract.balanceOf(wallet.address);
      if (buyerBalance < amountWei) {
        const balanceFormatted = ethers.formatEther(buyerBalance);
        throw new Error(`Insufficient stablecoin balance. Required: ${formattedValue}, Available: ${balanceFormatted}`);
      }

      // Check current allowance and approve if needed
      let currentAllowance;
      try {
        currentAllowance = await stablecoinContract.allowance(wallet.address, bolAddress);
      } catch (error) {
        console.error('Error checking allowance:', error);
        throw new Error(`Failed to check allowance. Error: ${error.message}`);
      }
      
      // If allowance is insufficient, approve first
      if (currentAllowance < amountWei) {
        addActivityLog(`Approving stablecoin for payment... (current allowance: ${ethers.formatEther(currentAllowance)})`);
        const approveTx = await stablecoinContract.approve(bolAddress, amountWei);
        await waitForTransaction(approveTx);
        addActivityLog(`Approval confirmed`);
      }

      // Call pay(amount)
      const tx = await contract.pay(amountWei);
      addActivityLog(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await waitForTransaction(tx);
      addActivityLog(`Payment successful! Amount: ${formattedValue}, Tx: ${receipt.hash}`);

      setModalTitle('Success');
      setModalMessage(`Payment completed successfully!\n\nAmount: ${formattedValue}\nTransaction Hash: ${receipt.hash}`);
      setModalType('success');
      setShowModal(true);

      // Refresh shipment details
      await fetchShipmentDetails();
      if (refreshWallets) {
        await refreshWallets();
      }
    } catch (error) {
      console.error('Error making payment:', error);
      const errorMessage = parseError(error);
      addActivityLog(`Failed to make payment: ${errorMessage}`, 'error');
      setModalTitle('Error');
      setModalMessage(`Failed to make payment:\n${errorMessage}`);
      setModalType('error');
      setShowModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRedeem = async () => {
    if (!shipment?.billOfLadingAddress) {
      setModalTitle('Error');
      setModalMessage('Shipment contract address not found.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    // Check if user has claim tokens
    if (!claimTokenBalance || claimTokenBalance === 0n) {
      setModalTitle('Error');
      setModalMessage('You do not own any claim tokens for this shipment.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    try {
      setIsProcessing(true);
      addActivityLog('Redeeming claim tokens...');

      // Get private key for current account (investor or buyer)
      const privateKey = getPrivateKey(currentAccount);
      const wallet = getWallet(privateKey);

      // Get contract instance
      const bolAddress = shipment.billOfLadingAddress || shipment.contractAddress;
      if (!bolAddress || !ethers.isAddress(bolAddress)) {
        throw new Error(`Invalid BillOfLading contract address: ${bolAddress}`);
      }
      
      const contract = await getContract(bolAddress, 'BillOfLading', wallet);

      // Pre-check: Verify contract has stablecoin balance
      const deployments = await getDeployments();
      const stablecoinAddress = deployments.contracts?.ERC20Stablecoin;
      if (stablecoinAddress) {
        const provider = getProvider();
        const stablecoinContract = new ethers.Contract(
          stablecoinAddress,
          ["function balanceOf(address owner) view returns (uint256)"],
          provider
        );
        const contractBalance = await stablecoinContract.balanceOf(bolAddress);
        if (contractBalance === 0n) {
          throw new Error('The contract has no stablecoin balance. The buyer must pay before you can redeem.');
        }
      }

      // Call redeem()
      const tx = await contract.redeem();
      addActivityLog(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await waitForTransaction(tx);
      addActivityLog(`Claim tokens redeemed successfully! Tx: ${receipt.hash}`);

      setModalTitle('Success');
      setModalMessage(`Claim tokens redeemed successfully!\n\nTransaction Hash: ${receipt.hash}`);
      setModalType('success');
      setShowModal(true);

      // Refresh shipment details and claim token balance
      await fetchShipmentDetails();
      if (refreshWallets) {
        await refreshWallets();
      }
    } catch (error) {
      console.error('Error redeeming claim tokens:', error);
      const errorMessage = parseError(error);
      
      // Handle specific error cases
      let userMessage = errorMessage;
      
      // Check for common redeem errors
      if (errorMessage.includes('no claim tokens to redeem') || 
          errorMessage.includes('nothing to redeem')) {
        userMessage = 'You have no claim tokens to redeem or have already redeemed all available tokens.';
      } else if (errorMessage.includes('no repayments available')) {
        userMessage = 'No payments have been made to this shipment yet. Redeem is only available after the buyer pays.';
      } else if (errorMessage.includes('trade is settled')) {
        userMessage = 'This shipment has already been settled. All claim tokens have been redeemed.';
      } else if (errorMessage.includes('SafeERC20FailedOperation') || 
                 errorMessage.includes('ERC20InsufficientBalance') ||
                 errorMessage.includes('execution reverted (unknown custom error)')) {
        // This could be a contract balance issue or burn amount issue
        userMessage = 'Unable to redeem. This may happen if:\n' +
                     '• The contract does not have enough stablecoin balance\n' +
                     '• You have already redeemed all your tokens\n' +
                     '• The redeemable amount calculation resulted in zero\n\n' +
                     'Please check that the buyer has paid and you have unredeemed claim tokens.';
      }
      
      addActivityLog(`Failed to redeem claim tokens: ${userMessage}`, 'error');
      setModalTitle('Error');
      setModalMessage(`Failed to redeem claim tokens:\n${userMessage}`);
      setModalType('error');
      setShowModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatAddress = (address) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const fetchClaimTokenBalance = async (bolAddress) => {
    if (!bolAddress || !ethers.isAddress(bolAddress)) {
      setClaimTokenBalance(null);
      return;
    }

    try {
      // Get wallet for current account
      const privateKey = getPrivateKey(currentAccount);
      const wallet = getWallet(privateKey);
      
      // Get BillOfLading contract
      const bolContract = await getContract(bolAddress, 'BillOfLading', wallet);
      
      // Get claim token address
      const claimTokenAddress = await bolContract.claimToken();
      
      if (!claimTokenAddress || claimTokenAddress === ethers.ZeroAddress) {
        setClaimTokenBalance(null);
        return;
      }
      
      // Load ClaimToken ABI (it's an ERC20, so we can use standard ERC20 ABI)
      // For now, we'll use a simple balanceOf call
      const provider = getProvider();
      const claimTokenContract = new ethers.Contract(
        claimTokenAddress,
        [
          "function balanceOf(address owner) view returns (uint256)",
          "function totalSupply() view returns (uint256)"
        ],
        provider
      );
      
      const balance = await claimTokenContract.balanceOf(wallet.address);
      setClaimTokenBalance(balance);
    } catch (error) {
      console.error('Error fetching claim token balance:', error);
      setClaimTokenBalance(null);
    }
  };

  const formatValue = (value) => {
    if (!value) return '0';
    try {
      // Convert from wei (assuming 18 decimals for stablecoin)
      // If value is a string representation of a large number (wei), convert it
      const valueBigInt = BigInt(value);
      const weiPerToken = BigInt(10 ** 18);
      // If it's larger than 10^15, assume it's in wei and convert
      if (valueBigInt > BigInt(10 ** 15)) {
        const tokens = Number(valueBigInt) / Number(weiPerToken);
        return tokens.toLocaleString(undefined, { maximumFractionDigits: 2 });
      } else {
        // Small number, treat as already in human-readable format
        const num = parseFloat(value);
        return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
      }
    } catch (e) {
      // Fallback to original behavior
      const num = parseFloat(value);
      return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="shipment-details">
          <div className="loading-state">Loading shipment details...</div>
        </div>
      </Layout>
    );
  }

  if (!shipment) {
    return (
      <Layout>
        <div className="shipment-details">
          <button className="back-btn" onClick={handleBack}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="error-state">Shipment not found</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="shipment-details">
        <button className="back-btn" onClick={handleBack}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="shipment-details-content">
          <h1 className="shipment-details-title">Shipment Details</h1>

          <div className="shipment-details-grid">
            <div className="detail-section">
              <h2 className="detail-section-title">Basic Information</h2>
              <div className="detail-item">
                <span className="detail-label">BL Number:</span>
                <span className="detail-value">{shipment.blNumber || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">BoL Hash:</span>
                <span className="detail-value detail-hash">{shipment.bolHash || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Contract Address:</span>
                <span className="detail-value detail-hash">{formatAddress(shipment.billOfLadingAddress || shipment.contractAddress)}</span>
              </div>
            </div>

            <div className="detail-section">
              <h2 className="detail-section-title">Parties</h2>
              <div className="detail-item">
                <span className="detail-label">Buyer:</span>
                <span className="detail-value detail-address">{formatAddress(shipment.buyer)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Seller (Shipper):</span>
                <span className="detail-value detail-address">{formatAddress(shipment.seller)}</span>
              </div>
            </div>

            <div className="detail-section">
              <h2 className="detail-section-title">Financial Information</h2>
              <div className="detail-item">
                <span className="detail-label">Declared Value:</span>
                <span className="detail-value">{formatValue(shipment.declaredValue)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Total Funded:</span>
                <span className="detail-value">{formatValue(shipment.totalFunded)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Total Paid:</span>
                <span className="detail-value">{formatValue(shipment.totalRepaid || shipment.totalPaid)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Total Claimed:</span>
                <span className="detail-value">{formatValue(shipment.totalClaimed)}</span>
              </div>
            </div>

            <div className="detail-section">
              <h2 className="detail-section-title">Status</h2>
              <div className="detail-item">
                <span className="detail-label">Active:</span>
                <span className="detail-value">{shipment.isActive || shipment.fundingEnabled ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Claims Issued:</span>
                <span className="detail-value">{shipment.claimsIssued ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Fully Funded:</span>
                <span className="detail-value">{shipment.isFull ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Settled:</span>
                <span className="detail-value">{shipment.isSettled || shipment.settled ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Role-specific action buttons */}
          <div className="action-buttons">
            {currentAccount === 'seller' && (
              <>
                <button
                  className="action-btn"
                  onClick={handleEnableFunding}
                  disabled={isProcessing || shipment.isActive || shipment.fundingEnabled}
                >
                  {isProcessing ? 'Processing...' : 'Enable Funding'}
                </button>
                <button
                  className="action-btn"
                  onClick={handleRedeem}
                  disabled={
                    isProcessing || 
                    !claimTokenBalance || 
                    claimTokenBalance === 0n ||
                    !shipment.totalRepaid || 
                    parseFloat(shipment.totalRepaid) === 0 ||
                    shipment.isSettled || 
                    shipment.settled
                  }
                >
                  {isProcessing ? 'Processing...' : 'Redeem'}
                </button>
              </>
            )}

            {currentAccount === 'investor' && (
              <>
                <div className="fund-input-group">
                  <input
                    type="number"
                    className="fund-input"
                    placeholder="Enter amount to fund"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    disabled={isProcessing || !shipment.isActive || !shipment.fundingEnabled}
                  />
                  <button
                    className="action-btn"
                    onClick={handleFund}
                    disabled={isProcessing || !fundAmount || !shipment.isActive || !shipment.fundingEnabled}
                  >
                    {isProcessing ? 'Processing...' : 'Fund'}
                  </button>
                </div>
                <button
                  className="action-btn"
                  onClick={handleRedeem}
                  disabled={
                    isProcessing || 
                    !claimTokenBalance || 
                    claimTokenBalance === 0n ||
                    !shipment.totalRepaid || 
                    parseFloat(shipment.totalRepaid) === 0 ||
                    shipment.isSettled || 
                    shipment.settled
                  }
                >
                  {isProcessing ? 'Processing...' : 'Redeem'}
                </button>
              </>
            )}

            {currentAccount === 'buyer' && (
              <>
                <button
                  className="action-btn"
                  onClick={handleMarkReceived}
                  disabled={isProcessing || shipment.isSettled || shipment.settled}
                >
                  {isProcessing ? 'Processing...' : 'Mark as Received'}
                </button>
                <button
                  className="action-btn"
                  onClick={handlePay}
                  disabled={isProcessing || !shipment?.declaredValue || shipment.isSettled || shipment.settled}
                >
                  {isProcessing ? 'Processing...' : `Pay ${formatValue(shipment.declaredValue)}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={modalTitle}
        message={modalMessage}
        type={modalType}
        onConfirm={() => {
          setShowModal(false);
          if (modalType === 'success') {
            // Refresh data after success
            fetchShipmentDetails();
          }
        }}
      />

      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title={modalTitle}
        message={modalMessage}
        type="info"
        onConfirm={handleConfirmPay}
        primaryActionLabel="Confirm"
        secondaryActionLabel="Cancel"
        secondaryActionOnClick={() => setShowConfirmModal(false)}
      />
    </Layout>
  );
}

