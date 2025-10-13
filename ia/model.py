# ia/model.py
from tensorflow.keras.models import Model
from tensorflow.keras.layers import (
    Input, Conv2D, MaxPooling2D, BatchNormalization,
    Dropout, Flatten, Dense, GlobalAveragePooling2D, ReLU
)
from tensorflow.keras import regularizers

def conv_block(x, filters, kernel=(3,3), pool=True, drop=0.25):
    x = Conv2D(filters, kernel, padding="same", kernel_regularizer=regularizers.l2(1e-4))(x)
    x = BatchNormalization()(x)
    x = ReLU()(x)
    x = Conv2D(filters, kernel, padding="same", kernel_regularizer=regularizers.l2(1e-4))(x)
    x = BatchNormalization()(x)
    x = ReLU()(x)
    if pool:
        x = MaxPooling2D((2,2))(x)
    if drop and drop>0:
        x = Dropout(drop)(x)
    return x

def build_emotion_model(input_shape=(48,48,1), n_classes=7):
    i = Input(shape=input_shape)

    x = conv_block(i, 32, drop=0.2)
    x = conv_block(x, 64, drop=0.25)
    x = conv_block(x, 128, drop=0.3)
    x = conv_block(x, 256, pool=True, drop=0.4)

    x = GlobalAveragePooling2D()(x)
    x = Dense(256, activation="relu")(x)
    x = Dropout(0.5)(x)
    out = Dense(n_classes, activation="softmax")(x)

    model = Model(i, out, name="emotion_cnn")
    return model
