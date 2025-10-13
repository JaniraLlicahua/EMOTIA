# ia/model_tl.py
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.layers import GlobalAveragePooling2D, Dense, Dropout, Input
from tensorflow.keras.models import Model

def build_tl_model(input_shape=(96,96,3), n_classes=7, dropout_head=0.25):
    """
    MobileNetV2 pretrained on ImageNet as feature extractor.
    - input_shape: tamaño de entrada (h,w,3)
    - n_classes: nº de clases
    """
    base = MobileNetV2(weights="imagenet", include_top=False, input_shape=input_shape)
    base.trainable = False  # primera fase: congelado

    x = base.output
    x = GlobalAveragePooling2D()(x)
    x = Dense(256, activation="relu")(x)
    x = Dropout(dropout_head)(x)
    out = Dense(n_classes, activation="softmax")(x)

    model = Model(inputs=base.input, outputs=out)
    return model
