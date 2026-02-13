from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from PIL import Image
import torch
from openai import OpenAI
from backend.config import DEVICE, API_KEY, BASE_URL, LLM_MODEL
import base64
from io import BytesIO

# 1. SETUP TrOCR (Lazy Load)
MODEL_ID = "microsoft/trocr-base-handwritten"
processor = None
model = None

def load_trocr():
    global processor, model
    if model is not None: return
    
    print(f"⏳ Loading TrOCR Model ({MODEL_ID})...")
    try:
        processor = TrOCRProcessor.from_pretrained(MODEL_ID)
        model = VisionEncoderDecoderModel.from_pretrained(MODEL_ID).to(DEVICE)
        print("✅ TrOCR (Handwriting) Model Ready")
    except Exception as e:
        print(f"⚠️ Error loading TrOCR: {e}")
        processor = None
        model = None

# 2. SETUP LLM (The "Brain" - Excellent for Logic)
client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

def extract_text_from_image(image_path):
    """
    Step 1: Read the image using TrOCR.
    """
    global model, processor
    load_trocr()
    if model is None: return ""
    
    try:
        from PIL import ImageOps, ImageEnhance
        image = Image.open(image_path).convert("RGB")
        
        # Preprocessing: Grayscale + Contrast
        # TrOCR works better on high contrast images
        image = ImageOps.grayscale(image)
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(2.0) # Double contrast
        image = image.convert("RGB")
        
        pixel_values = processor(images=image, return_tensors="pt").pixel_values.to(DEVICE)
        
        generated_ids = model.generate(pixel_values)
        generated_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        
        # Memory Cleanup Removed for Performance
        # We keep the model loaded so the next request is fast.
        # if torch.cuda.is_available(): torch.cuda.empty_cache()
        
        return generated_text
    except Exception as e:
        print(f"OCR Error: {e}")
        return ""

def llm_refine_ocr_text(ocr_text):
    """
    Step 2: Understand the text using LLM.
    Fixes typos, extracts specific jewelry terms, and ignores junk.
    """
    if not ocr_text: return {"cleaned_query": "", "product_type": "jewellery"}

    prompt = f"""
    You are a jewellery search assistant. 
    The user provided this raw text read from a handwritten note: "{ocr_text}"
    
    TASK: Clean up the text for a search engine.
    CRITICAL RULE: YOU MUST KEEP THE PRODUCT TYPE (Ring, Necklace, Earring, etc) if it appears in the text.
    
    Example:
    Input: "secret shaped ring"
    Output: "secret shaped ring" (Keep 'ring')
    
    Input: "gold neckace" (typo)
    Output: "gold necklace" (Fix typo, Keep 'necklace')

    Respond in JSON:
    {{
        "product_type": "ring" or "necklace" or "jewellery", 
        "cleaned_query": "visual keywords + product type"
    }}
    """
    print(f"DEBUG: Sending prompt to LLM for text: {ocr_text}") # Debug print to prove new code is running
    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0, 
            max_tokens=80,
            timeout=5.0 # Fails fast if internet is bad (5s)
        )
        # Safe JSON parsing
        import json
        content = response.choices[0].message.content
        # Ensure we get just the JSON part if the LLM chats too much
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1]
            
        try:
            result = json.loads(content)
        except:
            # Fallback if invalid JSON
            print(f"⚠️ LLM returned invalid JSON: {content}")
            result = eval(content) # Last resort try python eval
        
        # --- ROBUST GUARDRAIL ---
        known_types = ["ring", "necklace", "earring", "bracelet", "bangle", "pendant", "chain", "mangalsutra", "anklet", "nose pin"]
        
        raw_lower = ocr_text.lower()
        cleaned_lower = result.get("cleaned_query", "").lower()
        
        print(f"DEBUG GUARDRAIL: Raw='{raw_lower}' | Cleaned='{cleaned_lower}'")

        for p_type in known_types:
            # If product type is in raw text...
            if p_type in raw_lower:
                # ...but NOT in the cleaned query...
                if p_type not in cleaned_lower:
                    print(f"🛡️ GUARDRAIL: Force-adding '{p_type}' to query.")
                    result["cleaned_query"] = result["cleaned_query"].strip() + " " + p_type
                    cleaned_lower = result["cleaned_query"].lower() # Update for next check
                    
        return result

    except Exception as e:
        print(f"LLM Refine Error: {e}")
        # Fallback to simple python logic if LLM fails
        return {
            "cleaned_query": ocr_text, 
            "product_type": "jewellery"
        }

def extract_text_with_llm_vision(image_path):
    """
    Directly uses the Vision LLM to extract text and intent.
    Slower but smarter than TrOCR.
    """
    try:
        print(f"👁️ VISION OCR: Processing {image_path}...")
        
        # Encode image
        with open(image_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            
        prompt = """
        You are an expert handwriting OCR assistant for a jewellery store.
        
        TASK:
        1. Read EVERYTHING written in the image.
        2. Identify if there is a specific product type mentioned (Ring, Necklace, Earring, etc).
        3. Format the output for a search engine.
        
        Examples:
        - Image says "Gold Ring with Ruby" -> Output: {"product_type": "ring", "cleaned_query": "Gold Ring with Ruby"}
        - Image says "Gift for mom" -> Output: {"product_type": "jewellery", "cleaned_query": "Gift for mom"}
        
        Respond in strict JSON:
        {
            "product_type": "string",
            "cleaned_query": "string"
        }
        """
        
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {
                    "role": "user", 
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{encoded_string}"}
                        }
                    ]
                }
            ],
            max_tokens=300,
            temperature=0
        )
        
        content = response.choices[0].message.content
        
        # Clean JSON markdown
        import json
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1]
            
        result = json.loads(content)
        return result
        
    except Exception as e:
        print(f"❌ VISION OCR ERROR: {e}")
        # Fallback to standard
        print("Falling back to TrOCR...")
        raw_text = extract_text_from_image(image_path)
        return llm_refine_ocr_text(raw_text)