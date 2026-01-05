import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { CONFIG, SAMPLE_DATA, ICONS } from '../lib/config';
import { getNestedValue, setNestedValue, formatAddress, parseBlockchainError } from '../lib/utils';
import { useApp } from '../contexts/AppContext';

export default function Form() {
  const router = useRouter();
  const { addActivityLog } = useApp();
  const [formData, setFormData] = useState(SAMPLE_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    // Form is already initialized with SAMPLE_DATA
  }, []);

  const handleInputChange = (path, value) => {
    const newData = { ...formData };
    setNestedValue(newData, path, value);
    setFormData(newData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch(`${CONFIG.API_URL}/shipments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.detail || 'Failed to create shipment';
        const parsedError = parseBlockchainError(errorMessage);
        throw new Error(parsedError);
      }

      const result = await response.json();
      
      // Add success to activity log with full hash
      addActivityLog(
        'BoL created successfully',
        `Hash: ${result.bolHash}`
      );
      
      setModal({
        isOpen: true,
        title: 'Shipment Created',
        message: `BoL Hash: ${result.bolHash}`,
        type: 'success',
        onConfirm: () => {
          // Navigate to home, preserving current account
          // Use replace instead of push to avoid adding to history
          router.replace('/');
        }
      });
    } catch (error) {
      console.error('Error creating shipment:', error);
      
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
                />
              </div>
              <div className="form-group">
                <label htmlFor="shipper-street">Street</label>
                <input
                  type="text"
                  id="shipper-street"
                  value={getNestedValue(formData, 'shipper.address.street') || ''}
                  onChange={(e) => handleInputChange('shipper.address.street', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="shipper-country">Country</label>
                <input
                  type="text"
                  id="shipper-country"
                  value={getNestedValue(formData, 'shipper.address.country') || ''}
                  onChange={(e) => handleInputChange('shipper.address.country', e.target.value)}
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
              />
            </div>
            <div className="form-group">
              <label htmlFor="notify-note">Note</label>
              <textarea
                id="notify-note"
                rows="3"
                value={getNestedValue(formData, 'notifyParty.note') || ''}
                onChange={(e) => handleInputChange('notifyParty.note', e.target.value)}
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
                />
              </div>
              <div className="form-group">
                <label htmlFor="bl-scac">SCAC</label>
                <input
                  type="text"
                  id="bl-scac"
                  value={getNestedValue(formData, 'billOfLading.scac') || ''}
                  onChange={(e) => handleInputChange('billOfLading.scac', e.target.value)}
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
                />
              </div>
              <div className="form-group">
                <label htmlFor="bl-voyageNo">Voyage No</label>
                <input
                  type="text"
                  id="bl-voyageNo"
                  value={getNestedValue(formData, 'billOfLading.voyageNo') || ''}
                  onChange={(e) => handleInputChange('billOfLading.voyageNo', e.target.value)}
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
                />
              </div>
              <div className="form-group">
                <label htmlFor="bl-portOfDischarge">Port of Discharge</label>
                <input
                  type="text"
                  id="bl-portOfDischarge"
                  value={getNestedValue(formData, 'billOfLading.portOfDischarge') || ''}
                  onChange={(e) => handleInputChange('billOfLading.portOfDischarge', e.target.value)}
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
                />
              </div>
              <div className="form-group">
                <label htmlFor="bl-placeOfDelivery">Place of Delivery</label>
                <input
                  type="text"
                  id="bl-placeOfDelivery"
                  value={getNestedValue(formData, 'billOfLading.placeOfDelivery') || ''}
                  onChange={(e) => handleInputChange('billOfLading.placeOfDelivery', e.target.value)}
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
                />
              </div>
              <div className="form-group">
                <label htmlFor="issuing-dateOfIssue">Date of Issue</label>
                <input
                  type="text"
                  id="issuing-dateOfIssue"
                  value={getNestedValue(formData, 'issuingBlock.dateOfIssue') || ''}
                  onChange={(e) => handleInputChange('issuingBlock.dateOfIssue', e.target.value)}
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

