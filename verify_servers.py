import requests
import sys

def check_url(url, name):
    try:
        response = requests.get(url, timeout=5)
        print(f"✅ {name} is reachable at {url} (Status: {response.status_code})")
        return True
    except requests.exceptions.RequestException as e:
        print(f"❌ {name} is NOT reachable at {url}. Error: {e}")
        return False

def main():
    backend_url = "http://localhost:8000/docs"
    frontend_url = "http://localhost:5173"
    
    backend_ok = check_url(backend_url, "Backend")
    frontend_ok = check_url(frontend_url, "Frontend")
    
    if backend_ok and frontend_ok:
        print("\n🚀 Both Frontend and Backend are running perfectly!")
        sys.exit(0)
    else:
        print("\n⚠️  One or both services are down.")
        sys.exit(1)

if __name__ == "__main__":
    main()
