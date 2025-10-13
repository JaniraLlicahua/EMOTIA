# ia/train_images.py
import os
import json
import numpy as np
import matplotlib.pyplot as plt
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import classification_report, confusion_matrix
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau

from data_loader_images import load_dataset
from model_tl import build_tl_model   # <-- nuevo
#from model import build_emotion_model  # fallback si quieres usar tu CNN

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
train_dir = os.path.join(BASE_DIR, "train")
test_dir = os.path.join(BASE_DIR, "test")

# 1) cargar datos
train_gen, val_gen, test_gen = load_dataset(train_dir, test_dir, img_size=(96,96), batch_size=64)

# 2) class weights
labels = train_gen.classes
class_weights_values = compute_class_weight(
    class_weight='balanced',
    classes=np.unique(labels),
    y=labels
)
class_weights = dict(enumerate(class_weights_values))
print("✅ Class weights:", class_weights)

# 3) build model (fase 1: feature extractor)
model = build_tl_model(input_shape=(96,96,3), n_classes=7)
model.compile(optimizer=Adam(1e-3), loss='categorical_crossentropy', metrics=['accuracy'])

callbacks = [
    ModelCheckpoint('ia/models/best_model_phase1.keras', save_best_only=True),
    EarlyStopping(patience=6, restore_best_weights=True),
    ReduceLROnPlateau(factor=0.5, patience=3, min_lr=1e-6)
]

# 4) train fase 1 (congelado)
print("▶ Entrenando fase 1 (base congelada)")
history1 = model.fit(
    train_gen,
    validation_data=val_gen,
    epochs=50,
    callbacks=callbacks,
    class_weight=class_weights
)

# 5) evaluar rápidamente
loss, acc = model.evaluate(test_gen, verbose=1)
print(f"Phase1 Test Loss: {loss:.4f} - Test Acc: {acc:.4f}")

# 6) desbloquear últimas capas para fine-tune
print("▶ Fine-tuning: descongelando últimas capas del backbone")
# descongela las últimas N capas
base = model.layers[0]
for layer in base.layers[:-30]:
    layer.trainable = False
for layer in base.layers[-30:]:
    layer.trainable = True

# opcional: hacer solo últimas N entrenables (más seguro)
#base = model.layers[0]   # si usas MobileNetV2 como base en index 0
#for layer in base.layers[:-30]:
#    layer.trainable = False

model.compile(optimizer=Adam(1e-6), loss='categorical_crossentropy', metrics=['accuracy'])

callbacks_ft = [
    ModelCheckpoint('ia/models/best_model.keras', save_best_only=True),
    EarlyStopping(patience=6, restore_best_weights=True),
    ReduceLROnPlateau(factor=0.5, patience=6, min_lr=1e-7)
]

history2 = model.fit(
    train_gen,
    validation_data=val_gen,
    epochs=200,
    callbacks=callbacks_ft,
    class_weight=class_weights
)

# 7) evaluación final
loss, acc = model.evaluate(test_gen, verbose=1)
print(f"Final Test Loss: {loss:.4f} - Test Acc: {acc:.4f}")

# 8) guardar modelo final (ya guardado por checkpoint, pero lo dejamos)
model.save('ia/models/final_model.keras')
print("✅ Modelo final guardado: models/final_model.keras")

# 9) classification report y confusion matrix
y_true = test_gen.classes
y_pred_proba = model.predict(test_gen, verbose=1)
y_pred = np.argmax(y_pred_proba, axis=1)

class_names = [k for k, v in sorted(train_gen.class_indices.items(), key=lambda x: x[1])]
print("\n📊 Classification Report:\n")
print(classification_report(y_true, y_pred, target_names=class_names))

cm = confusion_matrix(y_true, y_pred)
print("\nConfusion matrix:\n", cm)

# 10) guardar class_indices (index -> label)
inv = {str(v): k for k, v in train_gen.class_indices.items()}
os.makedirs('models', exist_ok=True)
with open('ia/models/class_indices.json', 'w', encoding='utf-8') as f:
    json.dump(inv, f, ensure_ascii=False, indent=2)

# 11) curvas
plt.figure(figsize=(12,5))
# accuracy (phase1+ft combined if available)
acc_all = []
val_acc_all = []
for h in (history1, history2):
    if 'accuracy' in h.history:
        acc_all += h.history['accuracy']
    if 'val_accuracy' in h.history:
        val_acc_all += h.history['val_accuracy']

plt.subplot(1,2,1)
plt.plot(acc_all, label='train acc')
plt.plot(val_acc_all, label='val acc')
plt.legend()
plt.title('Accuracy')

# loss
loss_all = []
val_loss_all = []
for h in (history1, history2):
    if 'loss' in h.history:
        loss_all += h.history['loss']
    if 'val_loss' in h.history:
        val_loss_all += h.history['val_loss']

plt.subplot(1,2,2)
plt.plot(loss_all, label='train loss')
plt.plot(val_loss_all, label='val loss')
plt.legend()
plt.title('Loss')

plt.tight_layout()
plt.savefig('training_curves.png')
plt.close()
print("📈 Curvas guardadas en training_curves.png")
