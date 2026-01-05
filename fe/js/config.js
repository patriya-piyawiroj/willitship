/**
 * Application configuration
 */

export const CONFIG = {
    RPC_URL: 'http://localhost:8545',
    API_URL: 'http://localhost:8004',
};

export const ICONS = {
    user: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>',
    store: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>',
    truck: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>',
    'currency-dollar': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
    chevronDown: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>'
};

export const SAMPLE_DATA = {
    shipper: {
        name: "Demo Shipper",
        address: {
            street: "One North",
            country: "Singapore"
        }
    },
    consignee: {
        name: "Demo Consignee",
        blType: "TO_ORDER",
        toOrderOfText: "TO ORDER"
    },
    notifyParty: {
        name: "Demo Notify",
        note: "Notification only, no title to goods"
    },
    billOfLading: {
        blNumber: "1001",
        scac: "",
        carrierName: "",
        onwardInlandRouting: "",
        vessel: "",
        voyageNo: "",
        portOfLoading: "",
        portOfDischarge: "",
        placeOfReceipt: "",
        placeOfDelivery: ""
    },
    issuingBlock: {
        carriersReceipt: "",
        placeOfIssue: "",
        numberOfOriginalBL: "",
        dateOfIssue: "",
        declaredValue: "100",
        shippedOnBoardDate: "",
        issuerSignature: ""
    }
};

