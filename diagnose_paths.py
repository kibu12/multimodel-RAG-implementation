import os
import sys
# add current dir to sys path
sys.path.append(os.getcwd())
import config

print(f"DATA_DIR: {config.DATA_DIR}")
print(f"Exists: {os.path.exists(config.DATA_DIR)}")

if os.path.exists(config.DATA_DIR):
    try:
        content = os.listdir(config.DATA_DIR)
        print(f"Content: {content}")
        
        for item in content:
            item_path = os.path.join(config.DATA_DIR, item)
            if os.path.isdir(item_path):
                files = os.listdir(item_path)
                print(f"Subdir '{item}': {len(files)} files. First 5: {[f for f in files[:5]]}")
                # Check path logic
                if files:
                    full_path = os.path.join(item_path, files[0])
                    rel_path = os.path.relpath(full_path, config.DATA_DIR).replace("\\", "/")
                    print(f"Sample URL: http://localhost:8000/data/{rel_path}")
    except Exception as e:
        print(f"Error: {e}")
