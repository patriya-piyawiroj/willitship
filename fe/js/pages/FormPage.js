/**
 * Form Page Component
 */

import { state } from '../state.js';
import { CONFIG, SAMPLE_DATA } from '../config.js';
import { formatAddress } from '../utils.js';

export class FormPage {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.init();
    }
    
    init() {
        if (!this.container) return;
        
        this.render();
        this.autofillForm();
        this.setupEventListeners();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="form-page">
                <div class="page-header">
                    <button class="back-btn" id="form-back-btn">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                        Back
                    </button>
                    <h2 class="page-title">Shipment Details</h2>
                </div>
                
                <form id="shipment-form" class="shipment-form">
                    <!-- Shipper Section -->
                    <div class="form-section">
                        <h3 class="form-section-title">Shipper</h3>
                        <div class="form-group">
                            <label for="shipper-name">Name</label>
                            <input type="text" id="shipper-name" data-path="shipper.name" required>
                        </div>
                        <div class="form-group">
                            <label for="shipper-street">Street</label>
                            <input type="text" id="shipper-street" data-path="shipper.address.street">
                        </div>
                        <div class="form-group">
                            <label for="shipper-country">Country</label>
                            <input type="text" id="shipper-country" data-path="shipper.address.country">
                        </div>
                    </div>
                    
                    <!-- Consignee Section -->
                    <div class="form-section">
                        <h3 class="form-section-title">Consignee</h3>
                        <div class="form-group">
                            <label for="consignee-name">Name</label>
                            <input type="text" id="consignee-name" data-path="consignee.name">
                        </div>
                        <div class="form-group">
                            <label for="consignee-blType">BL Type</label>
                            <input type="text" id="consignee-blType" data-path="consignee.blType">
                        </div>
                        <div class="form-group">
                            <label for="consignee-toOrderOfText">To Order Of Text</label>
                            <input type="text" id="consignee-toOrderOfText" data-path="consignee.toOrderOfText">
                        </div>
                    </div>
                    
                    <!-- Notify Party Section -->
                    <div class="form-section">
                        <h3 class="form-section-title">Notify Party</h3>
                        <div class="form-group">
                            <label for="notify-name">Name</label>
                            <input type="text" id="notify-name" data-path="notifyParty.name">
                        </div>
                        <div class="form-group">
                            <label for="notify-note">Note</label>
                            <textarea id="notify-note" data-path="notifyParty.note" rows="3"></textarea>
                        </div>
                    </div>
                    
                    <!-- Bill of Lading Section -->
                    <div class="form-section">
                        <h3 class="form-section-title">Bill of Lading</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="bl-number">BL Number</label>
                                <input type="text" id="bl-number" data-path="billOfLading.blNumber">
                            </div>
                            <div class="form-group">
                                <label for="bl-scac">SCAC</label>
                                <input type="text" id="bl-scac" data-path="billOfLading.scac">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="bl-carrierName">Carrier Name</label>
                                <input type="text" id="bl-carrierName" data-path="billOfLading.carrierName">
                            </div>
                            <div class="form-group">
                                <label for="bl-onwardInlandRouting">Onward Inland Routing</label>
                                <input type="text" id="bl-onwardInlandRouting" data-path="billOfLading.onwardInlandRouting">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="bl-vessel">Vessel</label>
                                <input type="text" id="bl-vessel" data-path="billOfLading.vessel">
                            </div>
                            <div class="form-group">
                                <label for="bl-voyageNo">Voyage No</label>
                                <input type="text" id="bl-voyageNo" data-path="billOfLading.voyageNo">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="bl-portOfLoading">Port of Loading</label>
                                <input type="text" id="bl-portOfLoading" data-path="billOfLading.portOfLoading">
                            </div>
                            <div class="form-group">
                                <label for="bl-portOfDischarge">Port of Discharge</label>
                                <input type="text" id="bl-portOfDischarge" data-path="billOfLading.portOfDischarge">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="bl-placeOfReceipt">Place of Receipt</label>
                                <input type="text" id="bl-placeOfReceipt" data-path="billOfLading.placeOfReceipt">
                            </div>
                            <div class="form-group">
                                <label for="bl-placeOfDelivery">Place of Delivery</label>
                                <input type="text" id="bl-placeOfDelivery" data-path="billOfLading.placeOfDelivery">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Issuing Block Section -->
                    <div class="form-section">
                        <h3 class="form-section-title">Issuing Block</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="issuing-carriersReceipt">Carrier's Receipt</label>
                                <input type="text" id="issuing-carriersReceipt" data-path="issuingBlock.carriersReceipt">
                            </div>
                            <div class="form-group">
                                <label for="issuing-placeOfIssue">Place of Issue</label>
                                <input type="text" id="issuing-placeOfIssue" data-path="issuingBlock.placeOfIssue">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="issuing-numberOfOriginalBL">Number of Original BL</label>
                                <input type="text" id="issuing-numberOfOriginalBL" data-path="issuingBlock.numberOfOriginalBL">
                            </div>
                            <div class="form-group">
                                <label for="issuing-dateOfIssue">Date of Issue</label>
                                <input type="text" id="issuing-dateOfIssue" data-path="issuingBlock.dateOfIssue">
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="issuing-declaredValue">Declared Value *</label>
                            <input type="text" id="issuing-declaredValue" data-path="issuingBlock.declaredValue" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="issuing-shippedOnBoardDate">Shipped On Board Date</label>
                                <input type="text" id="issuing-shippedOnBoardDate" data-path="issuingBlock.shippedOnBoardDate">
                            </div>
                            <div class="form-group">
                                <label for="issuing-issuerSignature">Issuer Signature</label>
                                <input type="text" id="issuing-issuerSignature" data-path="issuingBlock.issuerSignature">
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="submit" class="submit-btn" id="form-submit-btn">
                            Submit Shipment
                            <svg class="btn-icon-right" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </button>
                    </div>
                </form>
            </div>
        `;
    }
    
    autofillForm() {
        const data = SAMPLE_DATA;
        
        // Helper to set value by ID
        const setValue = (id, value) => {
            const field = document.getElementById(id);
            if (field) field.value = value || '';
        };
        
        setValue('shipper-name', data.shipper.name);
        setValue('shipper-street', data.shipper.address.street);
        setValue('shipper-country', data.shipper.address.country);
        
        setValue('consignee-name', data.consignee.name);
        setValue('consignee-blType', data.consignee.blType);
        setValue('consignee-toOrderOfText', data.consignee.toOrderOfText);
        
        setValue('notify-name', data.notifyParty.name);
        setValue('notify-note', data.notifyParty.note);
        
        setValue('bl-number', data.billOfLading.blNumber);
        setValue('bl-scac', data.billOfLading.scac);
        setValue('bl-carrierName', data.billOfLading.carrierName);
        setValue('bl-onwardInlandRouting', data.billOfLading.onwardInlandRouting);
        setValue('bl-vessel', data.billOfLading.vessel);
        setValue('bl-voyageNo', data.billOfLading.voyageNo);
        setValue('bl-portOfLoading', data.billOfLading.portOfLoading);
        setValue('bl-portOfDischarge', data.billOfLading.portOfDischarge);
        setValue('bl-placeOfReceipt', data.billOfLading.placeOfReceipt);
        setValue('bl-placeOfDelivery', data.billOfLading.placeOfDelivery);
        
        setValue('issuing-carriersReceipt', data.issuingBlock.carriersReceipt);
        setValue('issuing-placeOfIssue', data.issuingBlock.placeOfIssue);
        setValue('issuing-numberOfOriginalBL', data.issuingBlock.numberOfOriginalBL);
        setValue('issuing-dateOfIssue', data.issuingBlock.dateOfIssue);
        setValue('issuing-declaredValue', data.issuingBlock.declaredValue);
        setValue('issuing-shippedOnBoardDate', data.issuingBlock.shippedOnBoardDate);
        setValue('issuing-issuerSignature', data.issuingBlock.issuerSignature);
    }
    
    setupEventListeners() {
        const form = document.getElementById('shipment-form');
        const backBtn = document.getElementById('form-back-btn');
        
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
        
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                state.set('currentRoute', 'home');
            });
        }
    }
    
    async handleSubmit(e) {
        e.preventDefault();
        
        const form = e.target;
        const inputs = form.querySelectorAll('[data-path]');
        
        // Build nested object from form fields
        const requestBody = {
            shipper: {
                name: '',
                address: { street: '', country: '' }
            },
            consignee: {
                name: '',
                blType: '',
                toOrderOfText: ''
            },
            notifyParty: {
                name: '',
                note: ''
            },
            billOfLading: {
                blNumber: '',
                scac: '',
                carrierName: '',
                onwardInlandRouting: '',
                vessel: '',
                voyageNo: '',
                portOfLoading: '',
                portOfDischarge: '',
                placeOfReceipt: '',
                placeOfDelivery: ''
            },
            issuingBlock: {
                carriersReceipt: '',
                placeOfIssue: '',
                numberOfOriginalBL: '',
                dateOfIssue: '',
                declaredValue: '',
                shippedOnBoardDate: '',
                issuerSignature: ''
            }
        };
        
        // Populate from form fields
        inputs.forEach(input => {
            const path = input.getAttribute('data-path');
            const value = input.value || '';
            
            // Set nested value
            const parts = path.split('.');
            let obj = requestBody;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!obj[parts[i]]) {
                    obj[parts[i]] = {};
                }
                obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = value;
        });
        
        const submitBtn = document.getElementById('form-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Submitting...';
        }
        
        try {
            const response = await fetch(`${CONFIG.API_URL}/shipments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to create shipment');
            }
            
            const result = await response.json();
            
            // Dispatch custom event for activity log
            window.dispatchEvent(new CustomEvent('activity', {
                detail: {
                    message: 'Shipment created',
                    details: `BoL: ${formatAddress(result.bolHash)}`
                }
            }));
            
            alert(`Shipment created successfully!\n\nBoL Hash: ${result.bolHash}\nTransaction: ${result.transactionHash}`);
            state.set('currentRoute', 'home');
            
        } catch (error) {
            console.error('Error creating shipment:', error);
            alert(`Error: ${error.message}`);
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Submit Shipment <svg class="btn-icon-right" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
            }
        }
    }
    
    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
