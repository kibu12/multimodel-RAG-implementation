import base64
from io import BytesIO
from PIL import Image
from openai import OpenAI
from backend.config import API_KEY, BASE_URL, LLM_MODEL

# Initialize Client
client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

def encode_image(image: Image.Image):
    """Encodes a PIL image to base64 string"""
    buffered = BytesIO()
    # Convert to RGB if needed
    if image.mode != "RGB":
        image = image.convert("RGB")
    image.save(buffered, format="JPEG")
    return base64.b64encode(buffered.getvalue()).decode('utf-8')

from transformers import BlipProcessor, BlipForConditionalGeneration
import torch
from backend.config import DEVICE

# Lazy Load BLIP
blip_processor = None
blip_model = None

def load_blip():
    global blip_processor, blip_model
    if blip_model is not None: return
    
    print("⏳ Loading BLIP Captioning Model (Local)...")
    try:
        blip_processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
        blip_model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base").to(DEVICE)
        print("✅ BLIP Ready")
    except Exception as e:
        print(f"❌ Error loading BLIP: {e}")

def generate_caption(image: Image.Image, category_name: str = None) -> str:
    """
    Generates a visual description using local BLIP model (Free).
    """
    global blip_model, blip_processor
    try:
        load_blip()
        if blip_model is None: return f"A {category_name or 'jewellery'} piece."
        
        # Prepare image
        if image.mode != "RGB": image = image.convert("RGB")
        
        # Conditional Generation
        text_prompt = "a photograph of"
        if category_name: text_prompt += f" a {category_name},"
        
        inputs = blip_processor(image, text_prompt, return_tensors="pt").to(DEVICE)
        
        out = blip_model.generate(**inputs, max_new_tokens=50)
        caption = blip_processor.decode(out[0], skip_special_tokens=True)
        
        return caption
    except Exception as e:
        print(f"Caption Error: {e}")
        return f"A {category_name or 'jewellery'} piece."

def describe_sketch(image: Image.Image) -> str:
    """
    Generates a description for a hand-drawn sketch.
    Used for converting sketch -> text query.
    """
    try:
        base64_image = encode_image(image)
        
        prompt = """
        Analyze this sketch of a jewellery piece. 
        
        MANDATORY TASK: You MUST classify it as either a "Necklace" or a "Ring".
        
        1. Identify the object: ONLY "Necklace" or "Ring". If unclear, pick the most likely one.
        2. Describe the shape/design (Heart, Flower, Geometric) and visual features.
        
        Respond in JSON:
        {
            "type": "Ring" or "Necklace",
            "description": "visual search query string e.g. heart shaped diamond ring"
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
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            },
                        },
                    ],
                }
            ],
            max_tokens=100,
            timeout=20.0
        )
        content = response.choices[0].message.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1]
        return content.strip()
    except Exception as e:
        print(f"Sketch Description Error: {e}")
        return "sketch of jewellery"
