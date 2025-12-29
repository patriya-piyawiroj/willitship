import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { CONFIG, SAMPLE_DATA, ICONS } from '../lib/config';
import { getNestedValue, setNestedValue, formatAddress, parseBlockchainError } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { mapOCRToFormData, getFieldLabel } from '../lib/ocrMapper';

export default function Form() {
  const router = useRouter();
  const { addActivityLog } = useApp();
  const [formData, setFormData] = useState(SAMPLE_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [confidenceScores, setConfidenceScores] = useState({});
  const [lowConfidenceFields, setLowConfidenceFields] = useState([]);

  useEffect(() => {
    // Check if OCR data is passed via query params
    const { ocrData } = router.query;
    if (ocrData) {
      try {
        const parsed = JSON.parse(ocrData);
        populateFormFromOCR(parsed);
      } catch (e) {
        console.error('Error parsing OCR data:', e);
      }
    }
  }, [router.query]);

  // Map OCR response structure to form data structure
  const populateFormFromOCR = (ocrData) => {
    const { formData: newData, confidenceScores: newConfidence, lowConfidenceFields: lowConfFields } = mapOCRToFormData(ocrData, SAMPLE_DATA);
    setFormData(newData);
    setConfidenceScores(newConfidence);
    setLowConfidenceFields(lowConfFields);
  };

  const handleInputChange = (path, value) => {
    const newData = { ...formData };
    setNestedValue(newData, path, value);
    setFormData(newData);
    // Remove from low confidence list if user edits the field
    if (lowConfidenceFields.includes(path)) {
      setLowConfidenceFields(lowConfidenceFields.filter(f => f !== path));
      // Also remove from confidence scores
      const newScores = { ...confidenceScores };
      delete newScores[path];
      setConfidenceScores(newScores);
    }
  };

  // Get input style based on confidence score
  const getInputStyle = (path) => {
    const confidence = confidenceScores[path];
    if (confidence !== undefined && confidence < 90) {
      return {
        borderColor: '#ef4444',
        borderWidth: '2px'
      };
    }
    return {};
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Get PDF URL from sessionStorage (uploaded on previous page)
      const pdfUrl = sessionStorage.getItem('uploadedPdfUrl') || null;

      // Step 2: Create BoL contract on blockchain
      console.log('🔗 Creating BoL contract on blockchain...');

      // Get carrier private key
      const carrierPrivateKey = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
      const declaredValue = formData.issuingBlock?.declaredValue || '100';
      const blNumber = formData.billOfLading?.blNumber || '';

      // Prepare COMPLETE shipment data for hashing - recreate fresh every submit
      const shipmentDataForHash = {
        shipper: formData.shipper,
        consignee: formData.consignee,
        notifyParty: formData.notifyParty,
        billOfLading: formData.billOfLading,
        issuingBlock: formData.issuingBlock,
        pdfUrl: pdfUrl || null  // Include PDF URL if uploaded, null otherwise
      };

      console.log('🔐 Creating hash from complete form data:', shipmentDataForHash);

      // Create BoL contract on blockchain directly
      const { createBoL } = await import('../lib/blockchain.js');
      const contractResult = await createBoL({
        shipmentData: shipmentDataForHash,
        declaredValue,
        blNumber,
        carrierPrivateKey
      });

      console.log('✅ BoL contract created on blockchain:', contractResult);

      // Create optimistic shipment object for immediate display on home page
      const optimisticShipment = {
        id: `temp-${Date.now()}`, // Temporary ID until database assigns one
        bolHash: contractResult.bolHash,
        hash: contractResult.bolHash,
        billOfLadingAddress: contractResult.contractAddress,
        contractAddress: contractResult.contractAddress,
        blNumber: blNumber || '',
        shipperName: formData.shipper?.name || 'N/A',
        sellerName: formData.shipper?.name || 'N/A', // Shipper is the seller
        buyerName: formData.consignee?.name || 'N/A',
        carrierName: formData.billOfLading?.carrierName || 'N/A',
        placeOfReceipt: formData.billOfLading?.placeOfReceipt || 'N/A',
        placeOfDelivery: formData.billOfLading?.placeOfDelivery || 'N/A',
        declaredValue: declaredValue,
        totalFunded: '0',
        totalPaid: '0',
        totalClaimed: '0',
        isActive: false,
        fundingEnabled: false,
        claimsIssued: false,
        settled: false,
        mintedAt: new Date().toISOString(),
        fundingEnabledAt: null,
        arrivedAt: null,
        paidAt: null,
        settledAt: null,
        pdfUrl: pdfUrl || null
      };

      // Store optimistic shipment in sessionStorage for home page to pick up
      sessionStorage.setItem('newShipment', JSON.stringify(optimisticShipment));

      // Clear sessionStorage after successful submission
      sessionStorage.removeItem('uploadedPdfUrl');
      
      // Add success to activity log with full hash
      addActivityLog(
        'BoL created successfully on blockchain',
        `Hash: ${contractResult.bolHash}`
      );

      setModal({
        isOpen: true,
        title: 'Shipment Created',
        message: `BoL Hash: ${contractResult.bolHash}\nContract Address: ${contractResult.contractAddress}`,
        type: 'success',
        onConfirm: () => {
          // Navigate to home, preserving current account
          // Use replace instead of push to avoid adding to history
          router.replace('/');
        }
      });
    } catch (error) {
      console.error('Error creating BoL contract:', error);

      // Parse error message to get readable format
      const errorMessage = error?.message || String(error);
      const parsedError = parseBlockchainError(errorMessage);

      // Add failure to activity log with parsed error
      addActivityLog(
        'BoL creation failed',
        parsedError
      );

      setModal({
        isOpen: true,
        title: 'Error',
        message: parsedError,
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="form-page">
        <div className="page-header">
          <button className="back-btn" onClick={() => {
            // Navigate back to upload page - currentAccount from AppContext will be preserved
            router.push('/upload');
          }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={ICONS.arrowLeft} />
            </svg>
            Back
          </button>
          <h2 className="page-title">Shipment Details</h2>
        </div>

        {/* Low Confidence Warning */}
        {lowConfidenceFields.length > 0 && (
          <div className="confidence-warning" style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            backgroundColor: '#fee2e2',
            border: '2px solid #ef4444',
            borderRadius: '8px',
            color: '#991b1b'
          }}>
            <strong>⚠️ Warning:</strong> Some fields could not be read with high confidence. Please double check the highlighted fields below:
            <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
              {lowConfidenceFields.map(field => (
                <li key={field}>
                  {getFieldLabel(field)} (Confidence: {confidenceScores[field]?.toFixed(1) || 'N/A'}%)
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <form id="shipment-form" className="shipment-form" onSubmit={handleSubmit}>
          {/* Shipper and Consignee Sections - Side by Side */}
          <div className="form-sections-row">
            {/* Shipper Section */}
            <div className="form-section">
              <h3 className="form-section-title">Shipper</h3>
              <div className="form-group">
                <label htmlFor="shipper-name">Name</label>
                <input
                  type="text"
                  id="shipper-name"
                  value={getNestedValue(formData, 'shipper.name') || ''}
                  onChange={(e) => handleInputChange('shipper.name', e.target.value)}
                  required
                  style={getInputStyle('shipper.name')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="shipper-street">Street</label>
                <input
                  type="text"
                  id="shipper-street"
                  value={getNestedValue(formData, 'shipper.address.street') || ''}
                  onChange={(e) => handleInputChange('shipper.address.street', e.target.value)}
                  style={getInputStyle('shipper.address.street')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="shipper-country">Country</label>
                <input
                  type="text"
                  id="shipper-country"
                  value={getNestedValue(formData, 'shipper.address.country') || ''}
                  onChange={(e) => handleInputChange('shipper.address.country', e.target.value)}
                  style={getInputStyle('shipper.address.country')}
                />
              </div>
            </div>
            
            {/* Consignee Section */}
            <div className="form-section">
              <h3 className="form-section-title">Consignee</h3>
              <div className="form-group">
                <label htmlFor="consignee-name">Name</label>
                <input
                  type="text"
                  id="consignee-name"
                  value={getNestedValue(formData, 'consignee.name') || ''}
                  onChange={(e) => handleInputChange('consignee.name', e.target.value)}
                  style={getInputStyle('consignee.name')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="consignee-blType">BL Type</label>
                <input
                  type="text"
                  id="consignee-blType"
                  value={getNestedValue(formData, 'consignee.blType') || ''}
                  onChange={(e) => handleInputChange('consignee.blType', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="consignee-toOrderOfText">To Order Of Text</label>
                <input
                  type="text"
                  id="consignee-toOrderOfText"
                  value={getNestedValue(formData, 'consignee.toOrderOfText') || ''}
                  onChange={(e) => handleInputChange('consignee.toOrderOfText', e.target.value)}
                />
              </div>
            </div>
          </div>
          
          {/* Notify Party Section */}
          <div className="form-section">
            <h3 className="form-section-title">Notify Party</h3>
            <div className="form-group">
              <label htmlFor="notify-name">Name</label>
              <input
                type="text"
                id="notify-name"
                value={getNestedValue(formData, 'notifyParty.name') || ''}
                onChange={(e) => handleInputChange('notifyParty.name', e.target.value)}
                style={getInputStyle('notifyParty.name')}
              />
            </div>
            <div className="form-group">
              <label htmlFor="notify-note">Note</label>
              <textarea
                id="notify-note"
                rows="3"
                value={getNestedValue(formData, 'notifyParty.note') || ''}
                onChange={(e) => handleInputChange('notifyParty.note', e.target.value)}
                style={getInputStyle('notifyParty.note')}
              />
            </div>
          </div>
          
          {/* Bill of Lading Section */}
          <div className="form-section">
            <h3 className="form-section-title">Bill of Lading</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="bl-number">BL Number</label>
                <input
                  type="text"
                  id="bl-number"
                  value={getNestedValue(formData, 'billOfLading.blNumber') || ''}
                  onChange={(e) => handleInputChange('billOfLading.blNumber', e.target.value)}
                  style={getInputStyle('billOfLading.blNumber')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="bl-scac">SCAC</label>
                <input
                  type="text"
                  id="bl-scac"
                  value={getNestedValue(formData, 'billOfLading.scac') || ''}
                  onChange={(e) => handleInputChange('billOfLading.scac', e.target.value)}
                  style={getInputStyle('billOfLading.scac')}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="bl-carrierName">Carrier Name</label>
                <input
                  type="text"
                  id="bl-carrierName"
                  value={getNestedValue(formData, 'billOfLading.carrierName') || ''}
                  onChange={(e) => handleInputChange('billOfLading.carrierName', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="bl-onwardInlandRouting">Onward Inland Routing</label>
                <input
                  type="text"
                  id="bl-onwardInlandRouting"
                  value={getNestedValue(formData, 'billOfLading.onwardInlandRouting') || ''}
                  onChange={(e) => handleInputChange('billOfLading.onwardInlandRouting', e.target.value)}
                  style={getInputStyle('billOfLading.onwardInlandRouting')}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="bl-vessel">Vessel</label>
                <input
                  type="text"
                  id="bl-vessel"
                  value={getNestedValue(formData, 'billOfLading.vessel') || ''}
                  onChange={(e) => handleInputChange('billOfLading.vessel', e.target.value)}
                  style={getInputStyle('billOfLading.vessel')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="bl-voyageNo">Voyage No</label>
                <input
                  type="text"
                  id="bl-voyageNo"
                  value={getNestedValue(formData, 'billOfLading.voyageNo') || ''}
                  onChange={(e) => handleInputChange('billOfLading.voyageNo', e.target.value)}
                  style={getInputStyle('billOfLading.voyageNo')}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="bl-portOfLoading">Port of Loading</label>
                <input
                  type="text"
                  id="bl-portOfLoading"
                  value={getNestedValue(formData, 'billOfLading.portOfLoading') || ''}
                  onChange={(e) => handleInputChange('billOfLading.portOfLoading', e.target.value)}
                  style={getInputStyle('billOfLading.portOfLoading')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="bl-portOfDischarge">Port of Discharge</label>
                <input
                  type="text"
                  id="bl-portOfDischarge"
                  value={getNestedValue(formData, 'billOfLading.portOfDischarge') || ''}
                  onChange={(e) => handleInputChange('billOfLading.portOfDischarge', e.target.value)}
                  style={getInputStyle('billOfLading.portOfDischarge')}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="bl-placeOfReceipt">Place of Receipt</label>
                <input
                  type="text"
                  id="bl-placeOfReceipt"
                  value={getNestedValue(formData, 'billOfLading.placeOfReceipt') || ''}
                  onChange={(e) => handleInputChange('billOfLading.placeOfReceipt', e.target.value)}
                  style={getInputStyle('billOfLading.placeOfReceipt')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="bl-placeOfDelivery">Place of Delivery</label>
                <input
                  type="text"
                  id="bl-placeOfDelivery"
                  value={getNestedValue(formData, 'billOfLading.placeOfDelivery') || ''}
                  onChange={(e) => handleInputChange('billOfLading.placeOfDelivery', e.target.value)}
                  style={getInputStyle('billOfLading.placeOfDelivery')}
                />
              </div>
            </div>
          </div>
          
          {/* Issuing Block Section */}
          <div className="form-section">
            <h3 className="form-section-title">Issuing Block</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="issuing-carriersReceipt">Carrier's Receipt</label>
                <input
                  type="text"
                  id="issuing-carriersReceipt"
                  value={getNestedValue(formData, 'issuingBlock.carriersReceipt') || ''}
                  onChange={(e) => handleInputChange('issuingBlock.carriersReceipt', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="issuing-placeOfIssue">Place of Issue</label>
                <input
                  type="text"
                  id="issuing-placeOfIssue"
                  value={getNestedValue(formData, 'issuingBlock.placeOfIssue') || ''}
                  onChange={(e) => handleInputChange('issuingBlock.placeOfIssue', e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="issuing-numberOfOriginalBL">Number of Original BL</label>
                <input
                  type="text"
                  id="issuing-numberOfOriginalBL"
                  value={getNestedValue(formData, 'issuingBlock.numberOfOriginalBL') || ''}
                  onChange={(e) => handleInputChange('issuingBlock.numberOfOriginalBL', e.target.value)}
                  style={getInputStyle('issuingBlock.numberOfOriginalBL')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="issuing-dateOfIssue">Date of Issue</label>
                <input
                  type="text"
                  id="issuing-dateOfIssue"
                  value={getNestedValue(formData, 'issuingBlock.dateOfIssue') || ''}
                  onChange={(e) => handleInputChange('issuingBlock.dateOfIssue', e.target.value)}
                  style={getInputStyle('issuingBlock.dateOfIssue')}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="issuing-declaredValue">Declared Value *</label>
              <input
                type="text"
                id="issuing-declaredValue"
                value={getNestedValue(formData, 'issuingBlock.declaredValue') || ''}
                onChange={(e) => handleInputChange('issuingBlock.declaredValue', e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="issuing-shippedOnBoardDate">Shipped On Board Date</label>
                <input
                  type="text"
                  id="issuing-shippedOnBoardDate"
                  value={getNestedValue(formData, 'issuingBlock.shippedOnBoardDate') || ''}
                  onChange={(e) => handleInputChange('issuingBlock.shippedOnBoardDate', e.target.value)}
                  style={getInputStyle('issuingBlock.shippedOnBoardDate')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="issuing-issuerSignature">Issuer Signature</label>
                <input
                  type="text"
                  id="issuing-issuerSignature"
                  value={getNestedValue(formData, 'issuingBlock.issuerSignature') || ''}
                  onChange={(e) => handleInputChange('issuingBlock.issuerSignature', e.target.value)}
                />
              </div>
            </div>
          </div>
          
          <div className="form-actions">
            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
              <svg className="btn-icon-right" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={ICONS.check} />
              </svg>
            </button>
          </div>
        </form>
        <Modal
          isOpen={modal.isOpen}
          onClose={() => setModal({ ...modal, isOpen: false })}
          onConfirm={modal.onConfirm}
          title={modal.title}
          message={modal.message}
          type={modal.type}
        />
      </div>
    </Layout>
  );
}

