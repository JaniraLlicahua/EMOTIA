# ia/data_loader_images.py
from tensorflow.keras.preprocessing.image import ImageDataGenerator

def load_dataset(train_dir, test_dir, img_size=(96,96), batch_size=64):
    train_datagen = ImageDataGenerator(
        rescale=1./255,
        samplewise_center=True,
        samplewise_std_normalization=True,
        rotation_range=45,
        width_shift_range=0.3,
        height_shift_range=0.3,
        shear_range=0.25,
        zoom_range=0.3,
        horizontal_flip=True,
        brightness_range=[0.6, 1.4],
        validation_split=0.2
    )

    test_datagen = ImageDataGenerator(
        rescale=1./255,
        samplewise_center=True,
        samplewise_std_normalization=True
    )

    train_generator = train_datagen.flow_from_directory(
        train_dir,
        target_size=img_size,
        color_mode='rgb',           # <- RGB (3 canales) para MobileNetV2
        batch_size=batch_size,
        class_mode='categorical',
        subset='training'
    )

    val_generator = train_datagen.flow_from_directory(
        train_dir,
        target_size=img_size,
        color_mode='rgb',
        batch_size=batch_size,
        class_mode='categorical',
        subset='validation'
    )

    test_generator = test_datagen.flow_from_directory(
        test_dir,
        target_size=img_size,
        color_mode='rgb',
        batch_size=batch_size,
        class_mode='categorical',
        shuffle=False    # importante para reports y confusion matrix
    )

    return train_generator, val_generator, test_generator
