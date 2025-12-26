/**
 * Maps OCR response structure to form data structure and tracks confidence scores
 */

export function mapOCRToFormData(ocrData, sampleData) {
  const formData = { ...sampleData };
  const confidenceScores = {};
  const lowConfidenceFields = [];

  // Helper to set value and track confidence
  const setValueWithConfidence = (path, value, confidence) => {
    if (value !== undefined && value !== null && value !== '') {
      setNestedValue(formData, path, value);
      confidenceScores[path] = confidence || 0;
      if (confidence < 90) {
        lowConfidenceFields.push(path);
      }
    }
  };

  // Helper to set nested value
  const setNestedValue = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  };

  // Map OCR data to form structure
  if (ocrData.header) {
    setValueWithConfidence('billOfLading.blNumber', ocrData.header.blNumber?.value, ocrData.header.blNumber?.confidence || 0);
  }

  if (ocrData.parties) {
    if (ocrData.parties.shipper) {
      setValueWithConfidence('shipper.name', ocrData.parties.shipper.name?.value, ocrData.parties.shipper.name?.confidence || 0);
      setValueWithConfidence('shipper.address.street', ocrData.parties.shipper.address?.value, ocrData.parties.shipper.address?.confidence || 0);
    }
    if (ocrData.parties.consignee) {
      setValueWithConfidence('consignee.name', ocrData.parties.consignee.name?.value, ocrData.parties.consignee.name?.confidence || 0);
    }
    if (ocrData.parties.notifyParty) {
      setValueWithConfidence('notifyParty.name', ocrData.parties.notifyParty.name?.value, ocrData.parties.notifyParty.name?.confidence || 0);
      setValueWithConfidence('notifyParty.note', ocrData.parties.notifyParty.address?.value, ocrData.parties.notifyParty.address?.confidence || 0);
    }
  }

  if (ocrData.routing) {
    setValueWithConfidence('billOfLading.vessel', ocrData.routing.vessel?.value, ocrData.routing.vessel?.confidence || 0);
    setValueWithConfidence('billOfLading.voyageNo', ocrData.routing.voyageNo?.value, ocrData.routing.voyageNo?.confidence || 0);
    setValueWithConfidence('billOfLading.placeOfReceipt', ocrData.routing.placeOfReceipt?.value, ocrData.routing.placeOfReceipt?.confidence || 0);
    setValueWithConfidence('billOfLading.portOfLoading', ocrData.routing.portOfLoading?.value, ocrData.routing.portOfLoading?.confidence || 0);
    setValueWithConfidence('billOfLading.portOfDischarge', ocrData.routing.portOfDischarge?.value, ocrData.routing.portOfDischarge?.confidence || 0);
    setValueWithConfidence('billOfLading.placeOfDelivery', ocrData.routing.placeOfDelivery?.value, ocrData.routing.placeOfDelivery?.confidence || 0);
    setValueWithConfidence('billOfLading.onwardInlandRouting', ocrData.routing.onwardInlandRouting?.value, ocrData.routing.onwardInlandRouting?.confidence || 0);
  }

  if (ocrData.metadata) {
    setValueWithConfidence('billOfLading.scac', ocrData.metadata.scac?.value, ocrData.metadata.scac?.confidence || 0);
    setValueWithConfidence('issuingBlock.numberOfOriginalBL', ocrData.metadata.numberOfOriginalBLs?.value, ocrData.metadata.numberOfOriginalBLs?.confidence || 0);
  }

  if (ocrData.dates) {
    setValueWithConfidence('issuingBlock.dateOfIssue', ocrData.dates.dateOfIssue?.value, ocrData.dates.dateOfIssue?.confidence || 0);
    setValueWithConfidence('issuingBlock.shippedOnBoardDate', ocrData.dates.shippedOnBoardDate?.value, ocrData.dates.shippedOnBoardDate?.confidence || 0);
  }

  return { formData, confidenceScores, lowConfidenceFields };
}

export function getFieldLabel(path) {
  const labels = {
    'shipper.name': 'Shipper Name',
    'shipper.address.street': 'Shipper Street',
    'shipper.address.country': 'Shipper Country',
    'consignee.name': 'Consignee Name',
    'consignee.address': 'Consignee Address',
    'notifyParty.name': 'Notify Party Name',
    'notifyParty.note': 'Notify Party Note',
    'billOfLading.blNumber': 'BL Number',
    'billOfLading.scac': 'SCAC',
    'billOfLading.vessel': 'Vessel',
    'billOfLading.voyageNo': 'Voyage No',
    'billOfLading.placeOfReceipt': 'Place of Receipt',
    'billOfLading.portOfLoading': 'Port of Loading',
    'billOfLading.portOfDischarge': 'Port of Discharge',
    'billOfLading.placeOfDelivery': 'Place of Delivery',
    'billOfLading.onwardInlandRouting': 'Onward Inland Routing',
    'issuingBlock.numberOfOriginalBL': 'Number of Original BL',
    'issuingBlock.dateOfIssue': 'Date of Issue',
    'issuingBlock.shippedOnBoardDate': 'Shipped On Board Date',
  };
  return labels[path] || path;
}

