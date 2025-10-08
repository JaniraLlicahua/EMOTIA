# ia/test_local_predict.py
import sys, os, json
from pathlib import Path
import numpy as np
import cv2
from tensorflow.keras.models import load_model

ROOT = Path(__file__).resolve().parents[1]  # EMOTIA/
MODEL_PATH = ROOT / "ia" / "models" / "best_model.keras"
CLASS_IDX_PATH = ROOT / "ia" / "models" / "class_indices.json"

if not MODEL_PATH.exists():
    raise SystemExit(f"Modelo no encontrado en: {MODEL_PATH}")
model = load_model(str(MODEL_PATH), compile=False)

if CLASS_IDX_PATH.exists():
    with open(CLASS_IDX_PATH, "r", encoding="utf-8") as f:
        CLASS_NAMES = json.load(f)
else:
    CLASS_NAMES = ['angry','disgust','fear','happy','neutral','sad','surprise']

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def preprocess(img_path):
    img = cv2.imread(str(img_path))
    if img is None:
        raise ValueError("No se pudo leer la imagen.")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(30,30))
    if len(faces) > 0:
        x,y,w,h = faces[0]
        roi = gray[y:y+h, x:x+w]
    else:
        h_img, w_img = gray.shape
        m = min(h_img, w_img)
        sx = w_img//2 - m//2
        sy = h_img//2 - m//2
        roi = gray[sy:sy+m, sx:sx+m]
    roi = cv2.resize(roi, (48,48)).astype("float32") / 255.0
    roi = np.expand_dims(np.expand_dims(roi, -1), 0)  # (1,48,48,1)
    return roi

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python ia/test_local_predict.py ruta/a/imagen.jpg")
        sys.exit(1)
    p = Path(sys.argv[1])
    x = preprocess(p)
    preds = model.predict(x)[0]
    for i,prob in enumerate(preds):
        print(f"{CLASS_NAMES[i]:10s} : {prob:.4f}")
    idx = int(preds.argmax())
    print("\nPredicción final:", CLASS_NAMES[idx], "confianza:", float(preds[idx]))
