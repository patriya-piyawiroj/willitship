import { CONFIG } from '../lib/config';

/**
 * Calls the real Risk Scoring API to get a risk assessment
 * @param {Object} shipment - Shipment data from the smart contract API
 * @returns {Promise<{score: number, rating: string, band: string, breakdown: Array}>}
 */
export async function fetchRiskScore(shipment) {
    try {
        // Build the request payload matching BillOfLadingInput schema
        const payload = {
            blNumber: shipment.blNumber || 'UNKNOWN',
            shipper: {
                name: shipment.shipper || 'Unknown Shipper',
                address: {
                    city: shipment.logistics?.portOfLoading || 'Unknown',
                    country: 'Unknown'
                }
            },
            consignee: {
                name: shipment.consignee || 'Unknown Consignee',
                address: {
                    city: shipment.logistics?.portOfDischarge || 'Unknown',
                    country: 'Unknown'
                }
            },
            portOfLoading: shipment.logistics?.portOfLoading || 'Shanghai',
            portOfDischarge: shipment.logistics?.portOfDischarge || 'Rotterdam',
            vessel: shipment.logistics?.vessel || null,
            voyageNo: shipment.logistics?.voyageNo || null,
            incoterm: shipment.incoterm || null,
            freightPaymentTerms: shipment.freightPaymentTerms || null,
            simulatedEvents: []
        };

        const response = await fetch(`${CONFIG.RISK_API_URL}/api/v1/risk-assessments/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.warn(`Risk API error for ${shipment.blNumber}:`, response.status);
            // Fallback to mock calculation
            return calculateFallbackRiskScore(shipment);
        }

        const data = await response.json();

        return {
            score: data.overallScore || data.overall_score || 75,
            rating: data.riskRating || data.risk_rating || 'BBB',
            band: data.riskBand || data.risk_band || 'MEDIUM',
            breakdown: data.breakdown || [],
            reasoning: data.riskRatingReasoning || data.risk_rating_reasoning || ''
        };
    } catch (error) {
        console.warn(`Risk API call failed for ${shipment.blNumber}:`, error.message);
        // Fallback to mock calculation
        return calculateFallbackRiskScore(shipment);
    }
}

/**
 * Batch fetch risk scores for multiple shipments
 * @param {Array} shipments - Array of shipment objects
 * @returns {Promise<Map<string, Object>>} - Map of bolHash to risk data
 */
export async function fetchRiskScoresBatch(shipments) {
    const results = new Map();

    // Process in parallel with concurrency limit
    const BATCH_SIZE = 5;
    for (let i = 0; i < shipments.length; i += BATCH_SIZE) {
        const batch = shipments.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (shipment) => {
            const risk = await fetchRiskScore(shipment);
            return { bolHash: shipment.bolHash, risk };
        });

        const batchResults = await Promise.all(promises);
        batchResults.forEach(({ bolHash, risk }) => {
            results.set(bolHash, risk);
        });
    }

    return results;
}

/**
 * Fallback risk calculation when API is unavailable
 * Uses the same logic as the original calculateRiskScore
 */
function calculateFallbackRiskScore(shipment) {
    if (!shipment) return { score: 88, rating: 'A', band: 'LOW' };

    let riskVal = 80;
    const blNumber = shipment.blNumber || '';
    const idSum = blNumber.split('').reduce((a, b) => a + b.charCodeAt(0), 0);

    // Base deterministic variation favoring "Low Risk" (80-99)
    riskVal = 80 + (idSum % 20);

    // High risk trigger (ends in 666)
    if (shipment.declaredValue && String(shipment.declaredValue).endsWith('666')) {
        riskVal = 30 + (idSum % 30);
    }

    // Medium risk trigger (ends in 888)
    if (shipment.declaredValue && String(shipment.declaredValue).endsWith('888')) {
        riskVal = 60 + (idSum % 20);
    }

    riskVal = Math.min(riskVal, 100);

    return {
        score: riskVal,
        rating: getRiskRating(riskVal),
        band: getRiskBand(riskVal),
        breakdown: [],
        reasoning: 'Fallback calculation (API unavailable)'
    };
}

function getRiskBand(score) {
    if (score >= 80) return 'LOW';
    if (score >= 60) return 'MEDIUM';
    return 'HIGH';
}

function getRiskRating(score) {
    if (score >= 96) return 'AAA';
    if (score >= 90) return 'AA';
    if (score >= 83) return 'A';
    if (score >= 75) return 'BBB';
    if (score >= 65) return 'BB';
    if (score >= 50) return 'B';
    return 'C';
}

// Re-export the old function for backwards compatibility
export { calculateRiskScore, getRiskRating, getRiskColor, getRiskBand } from './riskLogic';
