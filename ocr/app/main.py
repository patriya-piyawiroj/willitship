import os
import json
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from google.api_core.client_options import ClientOptions
from google.cloud import documentai
import vertexai
from vertexai.generative_models import GenerativeModel, Part

# --- CONFIGURATION ---
CREDENTIALS_FILE = "/app/service-account.json"
LOCATION = "us"  # Format is 'us' or 'eu'
# *** PASTE YOUR PROCESSOR ID BELOW ***
PROCESSOR_ID = "c051f0c71976639e" 

# 1. Load Project ID
with open(CREDENTIALS_FILE) as f:
    creds = json.load(f)
    PROJECT_ID = creds["project_id"]

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = CREDENTIALS_FILE

# 2. Initialize Vertex AI (Gemini)
vertexai.init(project=PROJECT_ID, location="us-central1")
model = GenerativeModel("gemini-2.0-flash-exp") 

app = FastAPI(title="OCR & LLM Service (DocAI)")

# Configure CORS to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins like ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods including OPTIONS
    allow_headers=["*"],
)

# --- STRICT PROMPT ---
SYSTEM_PROMPT = """
You are an expert Trade Document extraction AI. 

### INPUT DATA FORMAT:
You will receive "OCR TEXT" where every word is followed by its confidence score in brackets.

### CRITICAL RULES:
1. **NEVER AVERAGE SCORES.**
2. If a value comes from a single word, copy its score exactly.
3. If a value comes from multiple words use the **LOWEST SCORE**.
4. If the text is messy, the confidence MUST reflect the low numbers.

### DATA SCHEMA (JSON Only):
{
  "header": {
    "blNumber": { "value": "String", "confidence": "Number" },
    "bookingNumber": { "value": "String", "confidence": "Number" },
    "serviceContractNumber": { "value": "String", "confidence": "Number" },
    "exportReferences": { "value": "String", "confidence": "Number" },
    "lcNumber": { "value": "String", "confidence": "Number" }
  },
  "parties": {
    "shipper": {
      "name": { "value": "String", "confidence": "Number" },
      "address": { "value": "String", "confidence": "Number" },
      "contact": { "value": "String", "confidence": "Number" }
    },
    "consignee": {
      "name": { "value": "String", "confidence": "Number" },
      "address": { "value": "String", "confidence": "Number" },
      "contact": { "value": "String", "confidence": "Number" }
    },
    "notifyParty": {
      "name": { "value": "String", "confidence": "Number" },
      "address": { "value": "String", "confidence": "Number" },
      "contact": { "value": "String", "confidence": "Number" }
    }
  },
  "routing": {
    "vessel": { "value": "String", "confidence": "Number" },
    "voyageNo": { "value": "String", "confidence": "Number" },
    "placeOfReceipt": { "value": "String", "confidence": "Number" },
    "portOfLoading": { "value": "String", "confidence": "Number" },
    "portOfDischarge": { "value": "String", "confidence": "Number" },
    "placeOfDelivery": { "value": "String", "confidence": "Number" },
    "finalDestination": { "value": "String", "confidence": "Number" },
    "onwardInlandRouting": { "value": "String", "confidence": "Number" }
  },
  "cargo": {
    "goodsDescription": { "value": "String", "confidence": "Number" },
    "hsCode": { "value": "String", "confidence": "Number" },
    "iecCode": { "value": "String", "confidence": "Number" },
    "invoiceNumber": { "value": "String", "confidence": "Number" },
    "purchaseOrderNumber": { "value": "String", "confidence": "Number" },
    "packageCount": { "value": "Number", "confidence": "Number" },
    "packageType": { "value": "String", "confidence": "Number" },
    "grossWeight": { "value": "Number", "confidence": "Number" },
    "netWeight": { "value": "Number", "confidence": "Number" },
    "measurement": { "value": "Number", "confidence": "Number" },
    "containerSealList": [
      {
        "containerNumber": { "value": "String", "confidence": "Number" },
        "sealNumber": { "value": "String", "confidence": "Number" },
        "type": { "value": "String", "confidence": "Number" }
      }
    ]
  },
  "financials": {
    "freightPaymentTerm": { "value": "String", "confidence": "Number" },
    "freightPayableAt": { "value": "String", "confidence": "Number" },
    "charges": [
      {
        "description": { "value": "String", "confidence": "Number" },
        "amount": { "value": "Number", "confidence": "Number" },
        "currency": { "value": "String", "confidence": "Number" },
        "prepaidOrCollect": { "value": "String", "confidence": "Number" }
      }
    ]
  },
  "dates": {
    "shippedOnBoardDate": { "value": "Date", "confidence": "Number" },
    "dateOfIssue": { "value": "Date", "confidence": "Number" },
    "expiryDate": { "value": "Date", "confidence": "Number" }
  },
  "metadata": {
    "scac": { "value": "String", "confidence": "Number" },
    "numberOfOriginalBLs": { "value": "String", "confidence": "Number" }
  }
}
"""

@app.post("/process-document")
async def process_document(file: UploadFile = File(...)):
    print(f"Processing: {file.filename}")
    content = await file.read()
    
    # 1. GOOGLE DOCUMENT AI
    try:
        opts = ClientOptions(api_endpoint=f"{LOCATION}-documentai.googleapis.com")
        client = documentai.DocumentProcessorServiceClient(client_options=opts)
        name = client.processor_path(PROJECT_ID, LOCATION, PROCESSOR_ID)
        
        raw_document = documentai.RawDocument(content=content, mime_type=file.content_type)
        request = documentai.ProcessRequest(name=name, raw_document=raw_document)
        result = client.process_document(request=request)
        document = result.document

        # Extract Text & Quality using TOKENS (Flat structure)
        ocr_text_with_scores = ""
        total_conf = 0
        word_count = 0

        for page in document.pages:
            for token in page.tokens:
                # Get the text for this token (word)
                token_text = ""
                if token.layout.text_anchor.text_segments:
                    for segment in token.layout.text_anchor.text_segments:
                        start_index = int(segment.start_index)
                        end_index = int(segment.end_index)
                        token_text += document.text[start_index:end_index]
                
                # Clean up text
                token_text = token_text.strip().replace("\n", "")
                if not token_text:
                    continue

                # Get confidence (0.0 to 1.0 -> 0 to 100)
                conf = int(token.layout.confidence * 100)
                
                ocr_text_with_scores += f"{token_text}[{conf}] "
                total_conf += conf
                word_count += 1
            
            ocr_text_with_scores += "\n"

        overall_quality = round(total_conf / word_count, 2) if word_count > 0 else 0
        print(f"DEBUG: Document AI Quality Score: {overall_quality}%")

    except Exception as e:
        print(f"DocAI Error: {e}")
        return {"error": f"Document AI failed: {str(e)}"}

    # 2. GEMINI LLM
    try:
        image_part = Part.from_data(data=content, mime_type=file.content_type)
        full_prompt = [
            image_part,
            f"Here is the DocAI text with [confidence] scores:\n{ocr_text_with_scores}\n",
            SYSTEM_PROMPT
        ]
        
        response = model.generate_content(full_prompt)
        json_str = response.text.replace("```json", "").replace("```", "")
        data = json.loads(json_str)
        
        # Inject Overall Quality
        data["metadata"]["overall_document_quality"] = overall_quality
        return data

    except Exception as e:
        print(f"LLM Error: {e}")
        return {"error": f"LLM failed: {str(e)}"}