import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import { CONFIG } from '../lib/config';
import Modal from '../components/Modal';
import { getWallet, getContract, getPrivateKey, waitForTransaction, parseBlockchainError, getDeployments, getProvider, loadContractABI } from '../lib/blockchain';
import { parseBlockchainError as parseError } from '../lib/utils';

export default function ShipmentDetails() {
  const router = useRouter();
  const { selectedShipmentHash, currentAccount, addActivityLog, refreshWallets, wallets } = useApp();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fundAmount, setFundAmount] = useState('');
  const [claimTokenBalance, setClaimTokenBalance] = useState(null);
  const [offers, setOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCreateOfferModal, setShowCreateOfferModal] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerInterestRate, setOfferInterestRate] = useState('');
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

  // Fetch offers when account or shipment changes (seller or investor)
  useEffect(() => {
    if ((currentAccount === 'seller' || currentAccount === 'investor') && selectedShipmentHash) {
      fetchOffers(selectedShipmentHash);
    } else {
      setOffers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount, selectedShipmentHash]);

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

  const handleCreateOffer = async () => {
    if (!shipment?.billOfLadingAddress) {
      setModalTitle('Error');
      setModalMessage('Shipment contract address not found.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    if (!offerAmount || !offerInterestRate) {
      setModalTitle('Error');
      setModalMessage('Please enter both amount and interest rate.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    try {
      setIsProcessing(true);
      addActivityLog('Creating offer...');

      // Get private key for investor
      const privateKey = getPrivateKey('investor');
      const wallet = getWallet(privateKey);

      // Get contract instance
      const bolAddress = shipment.billOfLadingAddress || shipment.contractAddress;
      if (!bolAddress || !ethers.isAddress(bolAddress)) {
        throw new Error(`Invalid BillOfLading contract address: ${bolAddress}`);
      }

      const contract = await getContract(bolAddress, 'BillOfLading', wallet);

      // Convert amount to wei (assuming 18 decimals for stablecoin)
      const amountWei = ethers.parseEther(offerAmount);

      // Convert interest rate percentage to basis points
      // e.g., 1% = 100 basis points, 1.5% = 150 basis points
      const interestRateBps = BigInt(Math.round(parseFloat(offerInterestRate) * 100));

      // Get stablecoin address and approve the contract to spend the amount
      const deployments = await getDeployments();
      const stablecoinAddress = deployments.contracts?.ERC20Stablecoin;
      
      console.log('Creating offer - approval check:', {
        stablecoinAddress,
        bolAddress,
        investorAddress: wallet.address,
        amountWei: amountWei.toString(),
        amountFormatted: ethers.formatEther(amountWei)
      });
      
      if (stablecoinAddress) {
        const stablecoinContract = await getContract(stablecoinAddress, 'ERC20Stablecoin', wallet);
        
        // Check current allowance
        const currentAllowance = await stablecoinContract.allowance(wallet.address, bolAddress);
        console.log('Current allowance:', {
          current: ethers.formatEther(currentAllowance),
          required: ethers.formatEther(amountWei),
          needsApproval: currentAllowance < amountWei
        });
        
        // If allowance is less than amount, approve
        if (currentAllowance < amountWei) {
          addActivityLog('Approving stablecoin transfer...');
          console.log('Approving contract to spend', ethers.formatEther(amountWei), 'stablecoins');
          const approveTx = await stablecoinContract.approve(bolAddress, amountWei);
          console.log('Approval transaction submitted:', approveTx.hash);
          await waitForTransaction(approveTx);
          console.log('Approval transaction confirmed');
          
          // Verify approval was successful
          const newAllowance = await stablecoinContract.allowance(wallet.address, bolAddress);
          console.log('New allowance after approval:', ethers.formatEther(newAllowance));
          addActivityLog('Stablecoin approval confirmed');
        } else {
          console.log('Sufficient allowance already exists, skipping approval');
        }
      } else {
        console.error('Stablecoin address not found in deployments!');
      }

      // Call offer(amount, interestRateBps)
      // Add a small delay after approval to avoid nonce issues
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('Calling contract.offer with:', {
        amountWei: amountWei.toString(),
        interestRateBps: interestRateBps.toString()
      });
      
      const tx = await contract.offer(amountWei, interestRateBps);
      console.log('Offer transaction submitted:', tx.hash);
      addActivityLog(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await waitForTransaction(tx);
      console.log('Offer transaction confirmed:', receipt.hash);
      
      // Verify the offer was created by checking the event
      const offerCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed && parsed.name === 'Offer';
        } catch {
          return false;
        }
      });
      
      if (offerCreatedEvent) {
        const parsed = contract.interface.parseLog(offerCreatedEvent);
        const offerId = parsed.args.offerId;
        console.log('Offer created with ID:', offerId.toString());
        addActivityLog(`Offer created successfully! Offer ID: ${offerId}, Amount: ${offerAmount}, Interest: ${offerInterestRate}%, Tx: ${receipt.hash}`);
      } else {
        console.warn('Offer event not found in receipt, but transaction succeeded');
        addActivityLog(`Offer created successfully! Amount: ${offerAmount}, Interest: ${offerInterestRate}%, Tx: ${receipt.hash}`);
      }

      setModalTitle('Success');
      setModalMessage(`Offer created successfully!\n\nAmount: ${offerAmount}\nInterest Rate: ${offerInterestRate}%\nTransaction Hash: ${receipt.hash}`);
      setModalType('success');
      setShowModal(true);

      // Clear form and close popup
      setOfferAmount('');
      setOfferInterestRate('');
      setShowCreateOfferModal(false);

      // Refresh offers and shipment details
      await fetchOffers(selectedShipmentHash);
      await fetchShipmentDetails();
      
      // Refresh wallet balances
      if (refreshWallets) {
        await refreshWallets();
      }
    } catch (error) {
      console.error('Error creating offer:', error);
      const errorMessage = parseBlockchainError(error);
      const messageString = typeof errorMessage === 'string' ? errorMessage : String(errorMessage || 'Unknown error');
      addActivityLog(`Failed to create offer: ${messageString}`, 'error');
      setModalTitle('Error');
      setModalMessage(`Failed to create offer:\n${messageString}`);
      setModalType('error');
      setShowModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAcceptOffer = async (offerId) => {
    if (!shipment || !shipment.billOfLadingAddress) {
      setModalTitle('Error');
      setModalMessage('Shipment contract address not found.');
      setModalType('error');
      setShowModal(true);
      return;
    }

    try {
      setIsProcessing(true);
      addActivityLog(`Accepting offer ${offerId}...`);

      // Get private key for seller (only seller can accept offers)
      const privateKey = getPrivateKey('seller');
      const wallet = getWallet(privateKey);

      // Get contract instance
      const bolAddress = shipment.billOfLadingAddress || shipment.contractAddress;
      if (!bolAddress || !ethers.isAddress(bolAddress)) {
        throw new Error(`Invalid BillOfLading contract address: ${bolAddress}`);
      }

      const contract = await getContract(bolAddress, 'BillOfLading', wallet);

      // Check contract state first
      const tradeState = await contract.tradeState();
      // Check if funding has occurred (totalFunded > 0 means funding is enabled)
      if (tradeState.totalFunded === BigInt(0)) {
        throw new Error('Funding is not enabled for this shipment. Please enable funding first.');
      }
      if (tradeState.settled) {
        throw new Error('This trade has already been settled.');
      }

      // Get the offer details to validate before accepting
      console.log('Fetching offer data for offerId:', offerId);
      let offerData;
      try {
        offerData = await contract.offers(offerId);
      } catch (error) {
        console.error('Error fetching offer from contract:', error);
        throw new Error(`Failed to fetch offer ${offerId}. It may not exist. Error: ${error.message}`);
      }
      
      const offerAmount = offerData.amount;
      const investorAddress = offerData.investor;
      const isAccepted = offerData.accepted;
      const interestRateBps = offerData.interestRateBps;

      console.log('Accepting offer - offer data:', {
        offerId,
        investor: investorAddress,
        amount: ethers.formatEther(offerAmount),
        amountWei: offerAmount.toString(),
        interestRateBps: interestRateBps.toString(),
        isAccepted,
        offerDataRaw: {
          amount: offerData.amount?.toString(),
          investor: offerData.investor,
          interestRateBps: offerData.interestRateBps?.toString(),
          accepted: offerData.accepted
        }
      });

      // Validate offer exists and is not already accepted
      if (!investorAddress || investorAddress === ethers.ZeroAddress) {
        throw new Error('This offer does not exist.');
      }
      if (isAccepted) {
        throw new Error('This offer has already been accepted.');
      }

      // Calculate claim tokens to check if it would exceed declared value
      const claimTokens = offerAmount + (offerAmount * interestRateBps) / BigInt(10000);
      const totalFundedAfter = tradeState.totalFunded + claimTokens;
      console.log('Funding check:', {
        currentFunded: ethers.formatEther(tradeState.totalFunded),
        claimTokens: ethers.formatEther(claimTokens),
        totalAfter: ethers.formatEther(totalFundedAfter),
        declaredValue: ethers.formatEther(tradeState.declaredValue),
        wouldExceed: totalFundedAfter > tradeState.declaredValue
      });
      if (totalFundedAfter > tradeState.declaredValue) {
        throw new Error(`Accepting this offer would exceed the declared value. Current funded: ${ethers.formatEther(tradeState.totalFunded)}, Offer would add: ${ethers.formatEther(claimTokens)}, Declared value: ${ethers.formatEther(tradeState.declaredValue)}.`);
      }

      // Get stablecoin address and check allowance and balance
      const deployments = await getDeployments();
      const stablecoinAddress = deployments.contracts?.ERC20Stablecoin;
      
      console.log('Accepting offer - stablecoin check:', {
        stablecoinAddress,
        bolAddress,
        investorAddress
      });
      
      if (!stablecoinAddress) {
        throw new Error('Stablecoin address not found. Please ensure contracts are deployed.');
      }

      if (investorAddress) {
        // Use a read-only provider to check investor's balance and allowance
        // (we don't need the seller's wallet for this)
        const provider = getProvider();
        const stablecoinABI = await loadContractABI('ERC20Stablecoin');
        const readOnlyStablecoin = new ethers.Contract(
          stablecoinAddress,
          stablecoinABI,
          provider
        );
        
        // Check investor's balance
        const investorBalance = await readOnlyStablecoin.balanceOf(investorAddress);
        console.log('Investor balance check:', {
          address: investorAddress,
          required: ethers.formatEther(offerAmount),
          requiredWei: offerAmount.toString(),
          available: ethers.formatEther(investorBalance),
          availableWei: investorBalance.toString(),
          sufficient: investorBalance >= offerAmount
        });
        if (investorBalance < offerAmount) {
          throw new Error(`Investor does not have enough stablecoins. Required: ${ethers.formatEther(offerAmount)}, Available: ${ethers.formatEther(investorBalance)}.`);
        }
        
        // Check allowance - investor must have approved the BoL contract
        const allowance = await readOnlyStablecoin.allowance(investorAddress, bolAddress);
        console.log('Investor allowance check:', {
          investor: investorAddress,
          contract: bolAddress,
          required: ethers.formatEther(offerAmount),
          requiredWei: offerAmount.toString(),
          approved: ethers.formatEther(allowance),
          approvedWei: allowance.toString(),
          sufficient: allowance >= offerAmount,
          shortfall: allowance < offerAmount ? ethers.formatEther(offerAmount - allowance) : '0'
        });
        if (allowance < offerAmount) {
          throw new Error(`Investor has not approved enough stablecoins. Required: ${ethers.formatEther(offerAmount)}, Approved: ${ethers.formatEther(allowance)}. The investor needs to approve the contract before you can accept this offer.`);
        }
      }

      console.log('All validations passed, calling acceptOffer...');

      // Call acceptOffer(offerId)
      const tx = await contract.acceptOffer(offerId);
      addActivityLog(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await waitForTransaction(tx);
      addActivityLog(`Offer ${offerId} accepted successfully! Tx: ${receipt.hash}`);
      
      // Refresh offers and shipment details
      await fetchOffers(selectedShipmentHash);
      await fetchShipmentDetails();
      await refreshWallets();

      setModalTitle('Success');
      setModalMessage(`Offer ${offerId} accepted successfully!\n\nTransaction Hash: ${receipt.hash}`);
      setModalType('success');
      setShowModal(true);
    } catch (error) {
      console.error('Error accepting offer:', error);
      const errorMessage = parseBlockchainError(error);
      const messageString = typeof errorMessage === 'string' ? errorMessage : String(errorMessage || 'Unknown error');
      addActivityLog(`Failed to accept offer: ${messageString}`, 'error');
      setModalTitle('Error');
      setModalMessage(`Failed to accept offer:\n${messageString}`);
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

    // For sellers, they don't have actual claim tokens - they receive funding directly
    // So only investors can redeem claim tokens
    if (currentAccount === 'seller') {
      setModalTitle('Info');
      setModalMessage('Sellers receive funding directly from investors. Claim tokens are for investors who funded the shipment.');
      setModalType('info');
      setShowModal(true);
      return;
    }

    // Check if user has claim tokens (for investors)
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

  const fetchOffers = async (bolHash) => {
    if (!bolHash) return;
    
    try {
      setOffersLoading(true);
      const response = await fetch(`${CONFIG.API_URL}/offers?hash=${bolHash}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch offers: ${response.status}`);
      }
      
      const data = await response.json();
      // Show all offers for both seller and investor (same view)
      setOffers(data || []);
    } catch (error) {
      console.error('Error fetching offers:', error);
      addActivityLog('Failed to fetch offers', error.message, true);
      setOffers([]);
    } finally {
      setOffersLoading(false);
    }
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

  const getFundingPercentage = (shipment) => {
    if (!shipment.declaredValue || parseFloat(shipment.declaredValue) === 0) return 0;
    const funded = parseFloat(shipment.totalFunded || 0);
    const declared = parseFloat(shipment.declaredValue);
    return Math.min(100, Math.round((funded / declared) * 100));
  };

  const getCurrentState = (shipment) => {
    // States: minted, funding_enabled, arrived, paid, settled
    // Use date fields to determine state, not amounts (amounts can change with offers)
    if (shipment.settledAt) return 'settled';
    if (shipment.paidAt) return 'paid'; // Only set when buyer calls pay()
    if (shipment.arrivedAt) return 'arrived'; // Only set when buyer calls surrender()
    if (shipment.fundingEnabledAt) return 'funding_enabled';
    if (shipment.mintedAt) return 'minted';
    return 'minted'; // Default: just minted
  };

  const getProgressStates = (shipment) => {
    const currentState = getCurrentState(shipment);
    const states = [
      { name: 'minted', date: shipment.mintedAt },
      { name: 'funding_enabled', date: shipment.fundingEnabledAt },
      { name: 'arrived', date: shipment.arrivedAt },
      { name: 'paid', date: shipment.paidAt },
      { name: 'settled', date: shipment.settledAt }
    ];
    return states.map((state, index) => {
      const stateNames = states.map(s => s.name);
      const currentIndex = stateNames.indexOf(currentState);
      return {
        name: state.name,
        date: state.date,
        completed: index <= currentIndex,
        current: state.name === currentState
      };
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return null;
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
          
          <div className="shipment-details-header-info">
            <div className="detail-item-inline">
              <span className="detail-label">BL Number:</span>
              <span className="detail-value">{shipment.blNumber || 'N/A'}</span>
            </div>
            <div className="detail-item-inline">
              <span className="detail-label">BoL Hash:</span>
              <span className="detail-value detail-hash">{shipment.bolHash || 'N/A'}</span>
            </div>
            <div className="detail-item-inline">
              <span className="detail-label">Contract Address:</span>
              <span className="detail-value detail-hash">{shipment.billOfLadingAddress || shipment.contractAddress || 'N/A'}</span>
            </div>
          </div>

          <div className="shipment-details-layout">
            {/* Vertical Progress Bar on Left */}
            <div className="shipment-progress-vertical">
              {getProgressStates(shipment).map((state, index) => {
                let roleName = null;
                if (state.name === 'minted') {
                  roleName = shipment.carrierName || 'N/A';
                } else if (state.name === 'funding_enabled') {
                  roleName = shipment.shipperName || 'N/A';
                } else if (['arrived', 'paid', 'settled'].includes(state.name)) {
                  roleName = shipment.buyerName || 'N/A';
                }
                
                return (
                  <div key={state.name} className="progress-marker-group-vertical">
                    {roleName && (
                      <div className={`progress-role-name-vertical ${state.completed ? 'completed' : 'pending'}`}>
                        {roleName}
                      </div>
                    )}
                    <div className="progress-marker-wrapper-vertical">
                      <div className={`progress-marker-vertical ${state.completed ? 'completed' : ''} ${state.current ? 'current' : ''}`}>
                        {state.completed && (
                          <svg className="progress-check" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      {index < getProgressStates(shipment).length - 1 && (
                        <div className={`progress-line-vertical ${state.completed && getProgressStates(shipment)[index + 1].completed ? 'completed' : ''} ${index === getProgressStates(shipment).length - 2 && getProgressStates(shipment)[getProgressStates(shipment).length - 1].completed ? 'last-segment' : ''}`} />
                      )}
                    </div>
                    <div className="progress-label-container-vertical">
                      <div className={`progress-label-vertical ${state.completed ? 'completed' : 'pending'}`}>
                        {state.name.replace('_', ' ')}
                      </div>
                      <div className="progress-date-vertical">
                        {state.date ? formatDate(state.date) : '\u00A0'}
                      </div>
                      {state.name === 'minted' && shipment.placeOfReceipt && shipment.placeOfReceipt !== 'N/A' && (
                        <div className={`progress-location-chip-vertical ${state.completed ? 'completed' : 'pending'}`}>
                          <svg className="location-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>{shipment.placeOfReceipt}</span>
                        </div>
                      )}
                      {state.name === 'arrived' && shipment.placeOfDelivery && shipment.placeOfDelivery !== 'N/A' && (
                        <div className={`progress-location-chip-vertical ${state.completed ? 'completed' : 'pending'}`}>
                          <svg className="location-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>{shipment.placeOfDelivery}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Side Content */}
            <div className="shipment-details-right">
              {/* Funding Progress Section */}
              <div className="funding-progress-section">
                <h2 className="funding-section-title">Funding Details</h2>
                {parseFloat(shipment.totalFunded || 0) > 0 ? (
                  <div className="funding-progress-bar-full">
                    <div 
                      className="funding-progress-fill-full" 
                      style={{ 
                        width: `${getFundingPercentage(shipment)}%`,
                        opacity: 1
                      }}
                    />
                    <div className="funding-progress-text">
                      <div className="funding-progress-label-full">
                        {formatValue(shipment.totalFunded)} / {formatValue(shipment.declaredValue)} ({getFundingPercentage(shipment)}%)
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="funding-disabled-container">
                    <div className="funding-disabled-text">
                      Funding is not enabled by the seller
                    </div>
                    {currentAccount === 'seller' && (
                      <button
                        className="enable-funding-btn-inline"
                        onClick={handleEnableFunding}
                        disabled={isProcessing || shipment.isActive || parseFloat(shipment.totalFunded || 0) > 0}
                      >
                        {isProcessing ? 'Processing...' : 'Enable Funding'}
                      </button>
                    )}
                  </div>
                )}

                {/* Claim Tokens Section (Sellers and Investors) */}
                {(currentAccount === 'seller' || currentAccount === 'investor') && (
                  <div className="claim-tokens-section">
                    {currentAccount === 'seller' ? (
                      <>
                        <div className="claim-tokens-info">
                          <span className="claim-tokens-label">Claim Tokens Funded:</span>
                          <span className="claim-tokens-value">
                            {formatValue(shipment.totalFunded || 0)}
                          </span>
                        </div>
                        <div className="claim-tokens-info">
                          <span className="claim-tokens-label">Amount Paid to You:</span>
                          <span className="claim-tokens-value">
                            {formatValue(shipment.totalPaid || 0)}
                          </span>
                        </div>
                        <div className="claim-tokens-info">
                          <span className="claim-tokens-label">Remaining Unfunded:</span>
                          <span className="claim-tokens-value">
                            {formatValue(
                              Math.max(0, parseFloat(shipment.declaredValue || 0) - parseFloat(shipment.totalFunded || 0))
                            )}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="claim-tokens-info">
                          <span className="claim-tokens-label">Your Claim Tokens:</span>
                          <span className="claim-tokens-value">
                            {claimTokenBalance !== null && claimTokenBalance !== undefined
                              ? formatValue(ethers.formatEther(claimTokenBalance))
                              : 'Loading...'
                            }
                          </span>
                        </div>
                        {claimTokenBalance !== null && 
                          claimTokenBalance !== undefined && 
                          claimTokenBalance > 0n && (
                            <button
                              className="action-btn redeem-btn-inline"
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
                          )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Offers Section (Seller and Investor) */}
              {(currentAccount === 'seller' || currentAccount === 'investor') && (
                <div className="offers-section">
                  <div className="offers-section-header">
                    <h2 className="offers-section-title">Funding Offers</h2>
                    {currentAccount === 'investor' && (
                      <button
                        className="action-btn create-offer-btn"
                        onClick={() => setShowCreateOfferModal(true)}
                        disabled={isProcessing || !shipment.isActive || parseFloat(shipment.totalFunded || 0) === 0}
                      >
                        Create Offer
                      </button>
                    )}
                  </div>
                  {offersLoading ? (
                    <div className="offers-loading-state">Loading funding offers...</div>
                  ) : offers.length === 0 ? (
                    <div className="offers-empty-state">
                      {currentAccount === 'investor' 
                        ? 'No funding offers have been submitted. Submit an offer to participate in this trade.' 
                        : 'No funding offers have been received for this shipment.'}
                    </div>
                  ) : (
                    <div className="offers-list">
                      {offers.map((offer) => (
                        <div key={offer.offer_id || offer.offerId || offer.id} className="offer-item">
                          <div className="offer-header-row">
                            <div className="offer-id">Offer #{offer.offer_id || offer.offerId || offer.id}</div>
                            <div className={`offer-status-badge ${offer.accepted ? 'accepted' : 'pending'}`}>
                              {offer.accepted ? 'Accepted' : 'Pending Review'}
                            </div>
                          </div>
                          <div className="offer-details-row">
                            <div className="offer-detail-item">
                              <span className="offer-detail-label">Funding Amount</span>
                              <span className="offer-detail-value">{formatValue(offer.amount)}</span>
                            </div>
                            <div className="offer-detail-item">
                              <span className="offer-detail-label">Interest Rate</span>
                              <span className="offer-detail-value">{(parseFloat(offer.interestRateBps || offer.interest_rate_bps || 0) / 100).toFixed(2)}%</span>
                            </div>
                            {offer.claimTokens || offer.claim_tokens ? (
                              <div className="offer-detail-item">
                                <span className="offer-detail-label">Claim Tokens</span>
                                <span className="offer-detail-value">{formatValue(offer.claimTokens || offer.claim_tokens)}</span>
                              </div>
                            ) : null}
                          </div>
                          {currentAccount === 'seller' && !offer.accepted && (
                            <div className="offer-actions-bottom">
                              <button
                                className="action-btn accept-offer-btn"
                                onClick={() => handleAcceptOffer(offer.offer_id || offer.offerId || offer.id)}
                                disabled={isProcessing}
                              >
                                {isProcessing ? 'Processing...' : 'Accept Offer'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Role-specific action buttons */}
          {shipment.pdfUrl && (
            <div className="action-buttons" style={{ marginBottom: 'var(--spacing-md)' }}>
              <button
                className="action-btn"
                onClick={() => window.open(shipment.pdfUrl, '_blank')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ width: '20px', height: '20px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                View PDF
              </button>
            </div>
          )}
          <div className="action-buttons">
            {currentAccount === 'seller' && (
              <>
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
                  disabled={
                    isProcessing || 
                    !shipment?.declaredValue || 
                    shipment.isSettled || 
                    shipment.settled ||
                    shipment.isActive ||
                    parseFloat(shipment.totalFunded || 0) === 0
                  }
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

      {/* Create Offer Modal */}
      <Modal
        isOpen={showCreateOfferModal}
        onClose={() => {
          setShowCreateOfferModal(false);
          setOfferAmount('');
          setOfferInterestRate('');
        }}
        title="Create Offer"
        message={
          <div className="create-offer-form">
            <div className="form-group">
              <label htmlFor="offer-amount">Amount (stablecoins)</label>
              <input
                id="offer-amount"
                type="number"
                step="0.01"
                min="0"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                placeholder="Enter amount"
                disabled={isProcessing}
              />
            </div>
            <div className="form-group">
              <label htmlFor="offer-interest">Interest Rate (%)</label>
              <input
                id="offer-interest"
                type="number"
                step="0.01"
                min="0"
                value={offerInterestRate}
                onChange={(e) => setOfferInterestRate(e.target.value)}
                placeholder="Enter interest rate (e.g., 1 for 1%)"
                disabled={isProcessing}
              />
            </div>
            {shipment && (
              <div className="offer-info-text">
                {(() => {
                  const total = parseFloat(shipment.declaredValue || 0);
                  const available = parseFloat(shipment.declaredValue || 0) - parseFloat(shipment.totalFunded || 0);
                  return (
                    <p><strong>Amount Available:</strong> {formatValue(available.toString())} of {formatValue(total.toString())}</p>
                  );
                })()}
                {offerAmount && offerInterestRate && (
                  <>
                    <p><strong>Amount You Will Fund:</strong> {formatValue(offerAmount)}</p>
                    {(() => {
                      try {
                        const amount = parseFloat(offerAmount);
                        const interestRate = parseFloat(offerInterestRate);
                        const claimTokens = amount * (1 + interestRate / 100);
                        return (
                          <p><strong>Claim Tokens You Will Receive:</strong> {formatValue(claimTokens.toFixed(2))}</p>
                        );
                      } catch (e) {
                        return null;
                      }
                    })()}
                  </>
                )}
              </div>
            )}
          </div>
        }
        type="info"
        onConfirm={handleCreateOffer}
        primaryActionLabel={isProcessing ? 'Creating...' : 'Create Offer'}
        secondaryActionLabel="Cancel"
        secondaryActionOnClick={() => {
          setShowCreateOfferModal(false);
          setOfferAmount('');
          setOfferInterestRate('');
        }}
      />
    </Layout>
  );
}

