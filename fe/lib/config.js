export const CONFIG = {
  RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545',
  API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004',
  OCR_URL: process.env.NEXT_PUBLIC_OCR_URL || 'http://localhost:8002',
};

export const ICONS = {
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  store: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  truck: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  'currency-dollar': 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  chevronDown: 'M19 9l-7 7-7-7',
  plus: 'M12 4v16m8-8H4',
  arrowLeft: 'M15 19l-7-7 7-7',
  arrowRight: 'M9 5l7 7-7 7',
  check: 'M5 13l4 4L19 7',
  upload: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
  spinner: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
};

export const SAMPLE_DATA = {
  shipper: {
    name: "Demo Shipper Company",
    address: {
      street: "One North, 1 Fusionopolis Way",
      country: "Singapore"
    }
  },
  consignee: {
    name: "Demo Consignee Company",
    blType: "TO_ORDER",
    toOrderOfText: "TO ORDER"
  },
  notifyParty: {
    name: "Demo Notify Party",
    note: "Notification only, no title to goods"
  },
  billOfLading: {
    blNumber: "BL-2024-1001",
    scac: "DEMO",
    carrierName: "Demo Carrier Shipping Line",
    onwardInlandRouting: "Via Singapore Port",
    vessel: "MV DEMO VESSEL",
    voyageNo: "V001",
    portOfLoading: "Singapore",
    portOfDischarge: "Los Angeles",
    placeOfReceipt: "Singapore Warehouse",
    placeOfDelivery: "Los Angeles Distribution Center"
  },
  issuingBlock: {
    carriersReceipt: "Received in apparent good order and condition",
    placeOfIssue: "Singapore",
    numberOfOriginalBL: "3",
    dateOfIssue: "2024-01-15",
    declaredValue: "100",
    shippedOnBoardDate: "2024-01-20",
    issuerSignature: "Demo Carrier Signature"
  }
};

