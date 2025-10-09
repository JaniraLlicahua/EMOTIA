# ia/train_images.py
import os
import numpy as np
import matplotlib.pyplot as plt
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import classification_report
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau

from data_loader_images import load_dataset
from model import build_emotion_model

# 📁 Directorios base (ajusta si cambia)
BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
train_dir = os.path.join(BASE_DIR, "train")
test_dir = os.path.join(BASE_DIR, "test")

# 1️⃣ Cargar datasets
train_gen, val_gen, test_gen = load_dataset(train_dir, test_dir)

# 2️⃣ Calcular class weights para balancear clases minoritarias
labels = train_gen.classes
class_weights_values = compute_class_weight(
    class_weight='balanced',
    classes=np.unique(labels),
    y=labels
)
class_weights = dict(enumerate(class_weights_values))
print("✅ Class Weights Calculados:", class_weights)

# 3️⃣ Construir modelo
model = build_emotion_model(input_shape=(48, 48, 1), n_classes=7)
model.compile(optimizer=Adam(1e-3), loss='categorical_crossentropy', metrics=['accuracy'])

# 4️⃣ Callbacks
callbacks = [
    ModelCheckpoint('models/best_model.keras', save_best_only=True),
    EarlyStopping(patience=10, restore_best_weights=True),
    ReduceLROnPlateau(factor=0.5, patience=4, min_lr=1e-6)
]

# 5️⃣ Entrenamiento con class weights
history = model.fit(
    train_gen,
    validation_data=val_gen,
    epochs=180,
    callbacks=callbacks,
    class_weight=class_weights,  # 👈 Muy importante
)

# 6️⃣ Evaluar en test
loss, acc = model.evaluate(test_gen)
print(f"📊 Test Loss: {loss:.4f} - Test Accuracy: {acc:.4f}")

# 7️⃣ Guardar modelo final
model.save('models/final_model.keras')
print("✅ Modelo guardado en 'models/final_model.keras'")

# 8️⃣ Reporte de clasificación
y_true = test_gen.classes
y_pred = model.predict(test_gen)
y_pred_classes = np.argmax(y_pred, axis=1)

print("\n📊 Classification Report:\n")
print(classification_report(
    y_true,
    y_pred_classes,
    target_names=list(train_gen.class_indices.keys())
))

# 9️⃣ Curvas de entrenamiento
plt.figure(figsize=(10, 4))

# Accuracy
plt.subplot(1, 2, 1)
plt.plot(history.history['accuracy'], label='train acc')
plt.plot(history.history['val_accuracy'], label='val acc')
plt.title('Accuracy')
plt.legend()

# Loss
plt.subplot(1, 2, 2)
plt.plot(history.history['loss'], label='train loss')
plt.plot(history.history['val_loss'], label='val loss')
plt.title('Loss')
plt.legend()

plt.tight_layout()
plt.savefig('training_curves.png')
plt.close()
print("📈 Curvas de entrenamiento guardadas en training_curves.png")

import json
with open('models/class_indices.json', 'w', encoding='utf-8') as f:
    json.dump({v: k for k, v in train_gen.class_indices.items()}, f, ensure_ascii=False, indent=2)

#  🔥 Matriz de confusión visual
from sklearn.metrics import confusion_matrix
import scikitplot as skplt  # pip install scikit-plot
import matplotlib.pyplot as plt

cm = confusion_matrix(y_true, y_pred_classes)
class_names = list(train_gen.class_indices.keys())

plt.figure(figsize=(10,8))
skplt.metrics.plot_confusion_matrix(y_true, y_pred_classes, labels=class_names, normalize=True)
plt.title("📊 Matriz de Confusión Normalizada")
plt.savefig('confusion_matrix.png')
plt.close()

print("✅ Matriz de confusión guardada como 'confusion_matrix.png'")
