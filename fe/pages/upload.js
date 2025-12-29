import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { CONFIG, ICONS } from '../lib/config';
import { useApp } from '../contexts/AppContext';

export default function Upload() {
  const router = useRouter();
  const { addActivityLog } = useApp();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Basic validation
    if (!selectedFile.type.startsWith('image/') && selectedFile.type !== 'application/pdf') {
      setModal({
        isOpen: true,
        title: 'Invalid File Type',
        message: 'Please upload an image or PDF file.',
        type: 'error'
      });
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setModal({
        isOpen: true,
        title: 'File Too Large',
        message: 'File size exceeds 10MB limit.',
        type: 'error'
      });
      return;
    }

    setFile(selectedFile);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(selectedFile);
    } else if (selectedFile.type === 'application/pdf') {
      setPreview('https://via.placeholder.com/150?text=PDF+Preview');
    }
  };

  const handleRemove = () => {
    setFile(null);
    setPreview(null);
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    try {
      let ocrData = null;
      let pdfUrl = null;

      // Step 1: If file is uploaded, upload to GCP first
      if (file) {
        console.log('📤 Uploading file to GCP...');
        const uploadFormData = new FormData();
        uploadFormData.append('file', file);

        const uploadResponse = await fetch(`${CONFIG.API_URL}/shipments/upload`, {
          method: 'POST',
          body: uploadFormData
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(`Failed to upload file: ${errorText}`);
        }

        const uploadResult = await uploadResponse.json();
        pdfUrl = uploadResult.pdfUrl;
        console.log('✅ File uploaded to GCP:', pdfUrl);

        // Store PDF URL in sessionStorage for form page
        sessionStorage.setItem('uploadedPdfUrl', pdfUrl);
      }

      // Step 2: If file is uploaded, process it with OCR
      if (file) {
        console.log('🤖 Processing file with OCR...');
        const ocrFormData = new FormData();
        ocrFormData.append('file', file);

        const ocrResponse = await fetch(`${CONFIG.OCR_URL}/process-document`, {
          method: 'POST',
          body: ocrFormData
        });

        if (!ocrResponse.ok) {
          const error = await ocrResponse.json();
          throw new Error(error.error || 'OCR processing failed');
        }

        ocrData = await ocrResponse.json();

        if (ocrData.error) {
          throw new Error(ocrData.error);
        }
        console.log('✅ OCR processing completed');
      }

      // Navigate to form page with OCR data
      router.push({
        pathname: '/form',
        query: ocrData ? { ocrData: JSON.stringify(ocrData) } : {}
      });

    } catch (error) {
      console.error('Error submitting eBL:', error);
      // Don't log OCR errors to activity log (only blockchain transactions)
      setModal({
        isOpen: true,
        title: 'Submission Failed',
        message: error.message || 'Failed to submit eBL document. Please try again.',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="upload-page">
        <div className="page-header">
          <button className="back-btn" onClick={() => {
            // Navigate back to home page - currentAccount from AppContext will be preserved
            // Home page will automatically show the correct role content based on currentAccount
            router.push('/');
          }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={ICONS.arrowLeft} />
            </svg>
            Back
          </button>
          <h2 className="page-title">Upload eBL Document</h2>
        </div>

        <div className="upload-container">
          {!preview ? (
            <div className="upload-area" onClick={() => document.getElementById('file-input').click()}>
              <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={ICONS.upload} />
              </svg>
              <p className="upload-text">Click to upload or drag and drop</p>
              <p className="upload-hint">PNG, JPG, PDF up to 10MB</p>
              <input
                type="file"
                id="file-input"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <div className="preview-container">
              <img id="preview-image" src={preview} alt="Preview" />
              <button className="remove-btn" onClick={handleRemove}>Remove</button>
            </div>
          )}

          <div className="upload-actions">
            <button className="submit-btn" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit'}
              <svg className="btn-icon-right" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={ICONS.arrowRight} />
              </svg>
            </button>
          </div>
        </div>
        <Modal
          isOpen={modal.isOpen}
          onClose={() => setModal({ ...modal, isOpen: false })}
          title={modal.title}
          message={modal.message}
          type={modal.type}
        />
      </div>
    </Layout>
  );
}

