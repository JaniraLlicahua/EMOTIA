# ia/check_mislabeled.py
import os, csv, json
from pathlib import Path
import numpy as np
import cv2
from tensorflow.keras.models import load_model

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "ia" / "models" / "best_model.keras"
CLASS_IDX_PATH = ROOT / "ia" / "models" / "class_indices.json"
DATA_TRAIN = ROOT / "data" / "train"

model = load_model(str(MODEL_PATH), compile=False)
with open(CLASS_IDX_PATH, 'r', encoding='utf-8') as f:
    class_indices = json.load(f)
class_names = [class_indices[str(i)] for i in range(len(class_indices))]

out_csv = ROOT / "ia" / "mislabeled_candidates.csv"
rows = []

for class_folder in DATA_TRAIN.iterdir():
    if not class_folder.is_dir(): continue
    true_label = class_folder.name
    for img_path in class_folder.glob("*.*"):
        img = cv2.imread(str(img_path))
        if img is None: continue
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img_res = cv2.resize(img_rgb, (96,96)).astype('float32')/255.0
        x = np.expand_dims(img_res, axis=0)
        preds = model.predict(x, verbose=0)[0]
        pred_idx = int(np.argmax(preds))
        pred_label = class_names[pred_idx]
        if pred_label != true_label:
            rows.append([str(img_path), true_label, pred_label, float(preds[pred_idx])])

with open(out_csv, 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(['path','true_label','pred_label','confidence'])
    writer.writerows(rows)

print("Hecho. Revisa:", out_csv)
