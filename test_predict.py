# test_predict.py  (guardar en la raíz EMOTIA/)
import requests
import sys
from pathlib import Path

if len(sys.argv) < 2:
    print("Uso: python test_predict.py ruta/a/imagen.jpg")
    sys.exit(1)

img_path = Path(sys.argv[1])
if not img_path.exists():
    print("No existe:", img_path)
    sys.exit(1)

url = "http://127.0.0.1:8000/predict"
with open(img_path, "rb") as f:
    files = {"file": (img_path.name, f, "image/jpeg")}
    r = requests.post(url, files=files)
print("HTTP", r.status_code)
try:
    print(r.json())
except Exception:
    print(r.text)
