# AI Image Retrieval and OCR System

An AI-powered image retrieval system that allows users to search images using sketches and extract text from images using OCR. The system uses deep learning models, vector similarity search, and a FastAPI backend with frontend integration.

---

## Features

* Sketch-based Image Search using deep learning embeddings
* Optical Character Recognition (OCR) to extract text from images
* Fast vector similarity search using FAISS
* REST API built with FastAPI
* Frontend interface integration
* Real-time search and response
* Modular backend architecture
* Debugging and verification tools included

---

## System Architecture

Frontend → FastAPI Backend → AI Models → FAISS Vector Database → Results

Components:

* Frontend: User interface for image upload and search
* Backend: FastAPI server handling requests
* AI Models: Transformers and CNN models for feature extraction
* FAISS: Efficient similarity search engine
* OCR: EasyOCR for text extraction

---

## Tech Stack

Backend:

* FastAPI
* Python
* Uvicorn

AI / Machine Learning:

* PyTorch
* Transformers
* Sentence Transformers
* FAISS

Image Processing:

* OpenCV
* Pillow
* EasyOCR

Frontend:

* Streamlit / Web frontend

Utilities:

* NumPy
* Scikit-learn
* Matplotlib
* RapidFuzz

---

## Project Structure

```
project/
│
├── backend/
│   ├── main.py
│   ├── search/
│   ├── ocr/
│
├── frontend/
│
├── requirements.txt
├── run_project.bat
├── verify_servers.py
├── debug_tester.py
├── diagnose_startup.py
└── README.md
```

---


## Example Workflow

1. Start backend
2. Start frontend
3. Upload image or sketch
4. Backend extracts features
5. FAISS performs similarity search
6. Results returned to frontend

---

## Use Cases

* Image search using sketches
* Jewellery image retrieval
* Product search systems
* Visual similarity search
* OCR applications
* AI-powered search engines

---

## Future Improvements

* Improve model accuracy
* Add user authentication
* Deploy on cloud
* Add database storage
* Optimize search speed

---

## Author

Kirubashankar V
GitHub: https://github.com/kibu12
---
