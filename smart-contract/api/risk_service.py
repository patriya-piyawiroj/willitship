"""
Risk Scoring Service - Calls the Risk Scoring API to get risk assessments.
"""
import os
import httpx
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Get Risk API URL from environment (with fallback)
# When running in Docker, use host.docker.internal to reach the host machine
if os.path.exists("/.dockerenv"):
    # Running in Docker - use host.docker.internal
    RISK_API_URL = os.getenv("RISK_API_URL", "http://host.docker.internal:8003")
    logger.info(f"Running in Docker, using Risk API URL: {RISK_API_URL}")
else:
    # Local development - use localhost
    RISK_API_URL = os.getenv("RISK_API_URL", "http://localhost:8003")


async def fetch_risk_score(shipment_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Call the Risk Scoring API to get a risk assessment for a shipment.
    
    Args:
        shipment_data: Dictionary containing shipment information
        
    Returns:
        Dictionary with risk score data or None if API call fails
    """
    try:
        # Build the request payload matching BillOfLadingInput schema
        payload = {
            "blNumber": shipment_data.get("bl_number") or shipment_data.get("blNumber", "UNKNOWN"),
            "shipper": {
                "name": shipment_data.get("shipper_name") or shipment_data.get("shipper", "Unknown Shipper"),
                "address": {
                    "city": shipment_data.get("port_of_loading", "Unknown"),
                    "country": "Unknown"
                }
            },
            "consignee": {
                "name": shipment_data.get("consignee_name") or shipment_data.get("consignee", "Unknown Consignee"),
                "address": {
                    "city": shipment_data.get("port_of_discharge", "Unknown"),
                    "country": "Unknown"
                }
            },
            "portOfLoading": shipment_data.get("port_of_loading", "Shanghai"),
            "portOfDischarge": shipment_data.get("port_of_discharge", "Rotterdam"),
            "vessel": shipment_data.get("vessel"),
            "voyageNo": shipment_data.get("voyage_no"),
            "simulatedEvents": []
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{RISK_API_URL}/api/v1/risk-assessments/",
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "score": data.get("overallScore") or data.get("overall_score", 75),
                    "rating": data.get("riskRating") or data.get("risk_rating", "BBB"),
                    "band": data.get("riskBand") or data.get("risk_band", "MEDIUM"),
                    "reasoning": data.get("riskRatingReasoning") or data.get("risk_rating_reasoning", "")
                }
            else:
                logger.warning(f"Risk API returned status {response.status_code}: {response.text}")
                return None
                
    except httpx.TimeoutException:
        logger.warning("Risk API request timed out")
        return None
    except httpx.RequestError as e:
        logger.warning(f"Risk API request failed: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error calling Risk API: {e}")
        return None


def fetch_risk_score_sync(shipment_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Synchronous version of fetch_risk_score for use in non-async contexts.
    
    Args:
        shipment_data: Dictionary containing shipment information
        
    Returns:
        Dictionary with risk score data or None if API call fails
    """
    try:
        # Build the request payload matching BillOfLadingInput schema
        payload = {
            "blNumber": shipment_data.get("bl_number") or shipment_data.get("blNumber", "UNKNOWN"),
            "shipper": {
                "name": shipment_data.get("shipper_name") or shipment_data.get("shipper", "Unknown Shipper"),
                "address": {
                    "city": shipment_data.get("port_of_loading", "Unknown"),
                    "country": "Unknown"
                }
            },
            "consignee": {
                "name": shipment_data.get("consignee_name") or shipment_data.get("consignee", "Unknown Consignee"),
                "address": {
                    "city": shipment_data.get("port_of_discharge", "Unknown"),
                    "country": "Unknown"
                }
            },
            "portOfLoading": shipment_data.get("port_of_loading", "Shanghai"),
            "portOfDischarge": shipment_data.get("port_of_discharge", "Rotterdam"),
            "vessel": shipment_data.get("vessel"),
            "voyageNo": shipment_data.get("voyage_no"),
            "simulatedEvents": []
        }
        
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"{RISK_API_URL}/api/v1/risk-assessments/",
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "score": data.get("overallScore") or data.get("overall_score", 75),
                    "rating": data.get("riskRating") or data.get("risk_rating", "BBB"),
                    "band": data.get("riskBand") or data.get("risk_band", "MEDIUM"),
                    "reasoning": data.get("riskRatingReasoning") or data.get("risk_rating_reasoning", "")
                }
            else:
                logger.warning(f"Risk API returned status {response.status_code}: {response.text}")
                return None
                
    except httpx.TimeoutException:
        logger.warning("Risk API request timed out")
        return None
    except httpx.RequestError as e:
        logger.warning(f"Risk API request failed: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error calling Risk API: {e}")
        return None
