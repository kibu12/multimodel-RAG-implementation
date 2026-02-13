import torch
from transformers import CLIPProcessor, CLIPModel
from backend.config import DEVICE

model = None
processor = None

def load_clip():
    global model, processor
    if model is not None: return

    print(f"Loading CLIP on {DEVICE}...")
    try:
        # Try loading (will use cache if available, but checks for updates)
        model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(DEVICE)
        processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    except Exception as e:
        print(f"⚠️ Network error loading CLIP: {e}")
        print("🔄 Attempting to load from local cache (offline mode)...")
        try:
            model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32", local_files_only=True).to(DEVICE)
            processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32", local_files_only=True)
            print("✅ Loaded CLIP from local cache.")
        except Exception as e2:
            print(f"❌ Failed to load CLIP (Online & Offline): {e2}")
            # Re-raise the original error if local also fails, or e2
            raise e
            
    model.eval()

@torch.no_grad()
def get_image_embedding(image):
    load_clip()
    """Expects a PIL Image or list of PIL Images"""
    # Handle list vs single
    is_batch = isinstance(image, list)
    
    inputs = processor(images=image, return_tensors="pt", padding=True)
    pixel_values = inputs["pixel_values"].to(DEVICE)
    vision_outputs = model.vision_model(pixel_values=pixel_values)
    pooled_output = vision_outputs.pooler_output
    image_features = model.visual_projection(pooled_output)
    
    # Normalize (optional but good for consistency)
    image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)

    if is_batch:
        return image_features.cpu().numpy()
    else:
        return image_features[0].cpu().numpy()

@torch.no_grad()
def get_text_embedding(text):
    load_clip()
    """Expects a string or list of strings"""
    is_batch = isinstance(text, list)
    
    inputs = processor(text=text, return_tensors="pt", padding=True, truncation=True)
    inputs = {k: v.to(DEVICE) for k, v in inputs.items()}
    
    text_outputs = model.text_model(**inputs)
    pooled_output = text_outputs.pooler_output
    text_features = model.text_projection(pooled_output)
    text_features = text_features / text_features.norm(p=2, dim=-1, keepdim=True)
    
    if is_batch:
        return text_features.cpu().numpy()
    else:
        return text_features[0].cpu().numpy()