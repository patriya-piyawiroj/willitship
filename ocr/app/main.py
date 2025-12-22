from fastapi import FastAPI

app = FastAPI(title="ocr service")


@app.get("/test")
def test_endpoint():
    return {
        "service": "ocr",
        "status": "ok",
        "message": "hello from ocr service",
    }

