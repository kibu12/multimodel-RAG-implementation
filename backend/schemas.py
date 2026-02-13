from pydantic import BaseModel
from typing import List, Optional

class SearchResult(BaseModel):
    id: str
    image_path: str
    score: float
    category: str
    caption: Optional[str] = None
    interpretation: Optional[str] = None

class TextSearchRequest(BaseModel):
    query: str
    top_k: int = 30

class OCRResponse(BaseModel):
    raw_text: str
    cleaned_query: str
    detected_category: str

class TextSearchResponse(BaseModel):
    query: str
    refined_query: Optional[str] = None
    results: List[SearchResult]
