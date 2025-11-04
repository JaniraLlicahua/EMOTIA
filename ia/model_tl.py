from tensorflow.keras.applications import EfficientNetB0
from tensorflow.keras.layers import GlobalAveragePooling2D, Dense, Dropout, Input
from tensorflow.keras.models import Model

def build_tl_model(input_shape=(96,96,3), n_classes=7, dropout_head=0.3):
    base = EfficientNetB0(weights="imagenet", include_top=False, input_shape=input_shape)
    base.trainable = False

    x = base.output
    x = GlobalAveragePooling2D()(x)
    x = Dense(256, activation="relu")(x)
    x = Dropout(dropout_head)(x)
    out = Dense(n_classes, activation="softmax")(x)

    model = Model(inputs=base.input, outputs=out)
    return model
