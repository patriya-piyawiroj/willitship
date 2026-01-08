"""
Google Cloud Storage upload utilities.
"""
import os
import logging
from datetime import datetime
from pathlib import Path
from google.cloud import storage
from google.oauth2 import service_account

logger = logging.getLogger(__name__)


def get_gcs_client():
    """Get GCS client using service account credentials."""
    # Check for GCS-specific service account path (for different GCP project/account)
    gcs_credentials_path = os.getenv("GCS_SERVICE_ACCOUNT_PATH")
    
    if gcs_credentials_path:
        credentials_path = Path(gcs_credentials_path)
    else:
        # Default to gcs-service-account.json, fallback to service-account.json
        credentials_path = Path("/app/gcs-service-account.json")
        if not credentials_path.exists():
            credentials_path = Path("gcs-service-account.json")
        if not credentials_path.exists():
            # Fallback to the OCR service account (for backward compatibility)
            credentials_path = Path("/app/service-account.json")
            if not credentials_path.exists():
                credentials_path = Path("service-account.json")
    
    if not credentials_path.exists():
        raise FileNotFoundError(
            f"GCS service account credentials not found. "
            "Please either:\n"
            "1. Set GCS_SERVICE_ACCOUNT_PATH environment variable, or\n"
            "2. Mount gcs-service-account.json in docker-compose.yaml, or\n"
            "3. Use service-account.json (for backward compatibility)\n"
            f"Tried paths: {gcs_credentials_path if gcs_credentials_path else '/app/gcs-service-account.json, /app/service-account.json'}"
        )
    
    logger.info(f"Using GCS service account from: {credentials_path}")
    
    credentials = service_account.Credentials.from_service_account_file(
        str(credentials_path),
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    
    return storage.Client(credentials=credentials, project=credentials.project_id)


def upload_file_to_gcs(
    file_content: bytes,
    file_name: str,
    content_type: str = None,
    bucket_name: str = None
) -> str:
    """
    Upload a file to Google Cloud Storage.
    
    Args:
        file_content: The file content as bytes
        file_name: The original file name
        content_type: MIME type of the file (e.g., 'application/pdf', 'image/png')
        bucket_name: GCS bucket name (from env var GCS_BUCKET_NAME)
    
    Returns:
        Public URL of the uploaded file
    """
    if bucket_name is None:
        bucket_name = os.getenv("GCS_BUCKET_NAME")
        if not bucket_name:
            raise ValueError("GCS_BUCKET_NAME environment variable is not set")
    
    client = get_gcs_client()
    bucket = client.bucket(bucket_name)
    
    # If file_name is already a hash (64 hex characters), use it directly
    # Otherwise, use timestamp prefix for uniqueness
    if len(file_name) == 64 and all(c in '0123456789abcdef' for c in file_name.lower()):
        # File name is a hash, use it directly
        blob_name = f"ebl/{file_name}"
    else:
        # Generate a unique file path: ebl/{timestamp}-{original_filename}
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        # Sanitize filename
        safe_filename = "".join(c for c in file_name if c.isalnum() or c in ".-_")
        blob_name = f"ebl/{timestamp}-{safe_filename}"
    
    blob = bucket.blob(blob_name)
    
    # Set content type if provided
    if content_type:
        blob.content_type = content_type
    
    # Upload file
    blob.upload_from_string(file_content, content_type=content_type)
    
    # Make the blob publicly readable
    blob.make_public()
    
    # Return public URL
    public_url = blob.public_url
    
    logger.info(f"Uploaded file to GCS: {public_url}")
    
    return public_url

