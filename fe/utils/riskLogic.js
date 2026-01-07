export const calculateRiskScore = (shipment) => {
    if (!shipment) return { score: 88, rating: 'A', color: '#10b981', band: 'Low Risk' };

    let riskVal = 80;
    const blNumber = shipment.blNumber || '';
    const idSum = blNumber.split('').reduce((a, b) => a + b.charCodeAt(0), 0);

    // Base deterministic variation favoring "Low Risk" (80-99)
    riskVal = 80 + (idSum % 20);

    // High risk trigger (ends in 666) -> Score < 60 (Band: High)
    if (shipment.declaredValue && String(shipment.declaredValue).endsWith('666')) {
        riskVal = 30 + (idSum % 30); // 30-59
    }

    // Medium risk trigger (ends in 888) -> Score 60-79 (Band: Medium)
    if (shipment.declaredValue && String(shipment.declaredValue).endsWith('888')) {
        riskVal = 60 + (idSum % 20); // 60-79
    }

    // Cap at 100
    riskVal = Math.min(riskVal, 100);

    return {
        score: riskVal,
        rating: getRiskRating(riskVal),
        color: getRiskColor(riskVal),
        band: getRiskBand(riskVal)
    };
};

export const getRiskBand = (score) => {
    if (score >= 80) return 'Low Risk';
    if (score >= 60) return 'Medium Risk';
    return 'High Risk';
};

export const getRiskRating = (score) => {
    if (score >= 96) return 'AAA';
    if (score >= 90) return 'AA';
    if (score >= 83) return 'A';
    if (score >= 75) return 'BBB';
    if (score >= 65) return 'BB';
    if (score >= 50) return 'B';
    return 'C';
};

export const getRiskColor = (score) => {
    if (score >= 80) return '#10b981'; // Green (Low Risk)
    if (score >= 60) return '#f59e0b'; // Yellow (Medium Risk)
    return '#ef4444'; // Red (High Risk)
};
