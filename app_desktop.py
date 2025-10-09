# app_desktop.py
import sys
import requests
import cv2
import asyncio
import base64
import json
import websockets

from PyQt5.QtCore import QThread, pyqtSignal
from PyQt5.QtWidgets import (
    QApplication, QWidget, QLabel, QLineEdit,
    QPushButton, QVBoxLayout, QMessageBox,
    QMainWindow, QVBoxLayout, QWidget
)

API_URL = "http://127.0.0.1:8000"  # Backend FastAPI
WS_URL = "ws://127.0.0.1:8000/ws/predict"  # WebSocket para IA

# =========================================================
# 🧠 Hilo de video + detección de emociones (OpenCV + WS)
# =========================================================
class VideoThread(QThread):
    prediction_signal = pyqtSignal(dict)

    def __init__(self, session_id: int):
        super().__init__()
        self.session_id = session_id
        self.running = True

    async def run_ws(self):
        uri = f"{WS_URL}/{self.session_id}"
        async with websockets.connect(uri) as ws:
            cap = cv2.VideoCapture(0)  # activar cámara
            while self.running:
                ret, frame = cap.read()
                if not ret:
                    continue

                # codificar frame a base64
                _, buffer = cv2.imencode('.jpg', frame)
                b64 = base64.b64encode(buffer).decode('utf-8')

                # enviar frame al backend
                await ws.send(json.dumps({"type": "frame", "data": b64}))

                # recibir predicción
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1)
                    data = json.loads(msg)
                    if data.get("type") == "prediction":
                        self.prediction_signal.emit(data)
                except asyncio.TimeoutError:
                    pass

            cap.release()

    def run(self):
        asyncio.run(self.run_ws())

    def stop(self):
        self.running = False


# =========================================================
# 🪄 Ventana de sesión (psicólogo)
# =========================================================
class SessionWindow(QMainWindow):
    def __init__(self, session_id):
        super().__init__()
        self.setWindowTitle(f"Sesión {session_id} - EMOTIA")
        self.setGeometry(200, 200, 500, 400)

        self.label = QLabel("Esperando detecciones...", self)
        layout = QVBoxLayout()
        layout.addWidget(self.label)

        container = QWidget()
        container.setLayout(layout)
        self.setCentralWidget(container)

        # iniciar hilo de video IA
        self.video_thread = VideoThread(session_id)
        self.video_thread.prediction_signal.connect(self.update_emotion)
        self.video_thread.start()

    def update_emotion(self, data):
        emotion = data.get("emotion")
        conf = data.get("confidence")
        self.label.setText(f"🎯 Emoción: {emotion} — Confianza: {conf:.2f}")

    def closeEvent(self, event):
        self.video_thread.stop()
        super().closeEvent(event)


# =========================================================
# 🔐 Ventana de Login
# =========================================================
class LoginWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("EMOTIA - Login")
        self.setGeometry(100, 100, 300, 200)

        self.username = QLineEdit(self)
        self.username.setPlaceholderText("Usuario")

        self.password = QLineEdit(self)
        self.password.setPlaceholderText("Contraseña")
        self.password.setEchoMode(QLineEdit.Password)

        self.login_btn = QPushButton("Iniciar sesión", self)
        self.login_btn.clicked.connect(self.login)

        layout = QVBoxLayout()
        layout.addWidget(QLabel("Bienvenido a EMOTIA"))
        layout.addWidget(self.username)
        layout.addWidget(self.password)
        layout.addWidget(self.login_btn)
        self.setLayout(layout)

    def login(self):
        user = self.username.text().strip()
        pwd = self.password.text().strip()

        if not user or not pwd:
            QMessageBox.warning(self, "Error", "Completa todos los campos")
            return

        try:
            r = requests.post(f"{API_URL}/login", json={"username": user, "password": pwd})
            if r.status_code == 200:
                data = r.json()
                token = data["access_token"]
                role = data["role"]
                QMessageBox.information(self, "OK", f"Bienvenido {role}")

                if role == "admin":
                    self.open_admin_window(token)
                elif role == "psychologist":
                    self.open_psychologist_window(token)
                else:
                    self.open_patient_window(token)
            else:
                QMessageBox.critical(self, "Error", "Credenciales inválidas")
        except Exception as e:
            QMessageBox.critical(self, "Error", str(e))

    def open_admin_window(self, token):
        QMessageBox.information(self, "Admin", f"Token: {token}")
        # Aquí puedes abrir la ventana de admin real más adelante

    def open_psychologist_window(self, token):
        try:
            headers = {"Authorization": f"Bearer {token}"}
            r = requests.post(f"{API_URL}/sessions", headers=headers)
            if r.status_code == 200:
                session_id = r.json()["session_id"]
                QMessageBox.information(self, "Sesión creada", f"Sesión ID: {session_id}")
                self.open_session_window(session_id)
            else:
                QMessageBox.critical(self, "Error", f"No se pudo crear sesión: {r.text}")
        except Exception as e:
            QMessageBox.critical(self, "Error", str(e))

    def open_session_window(self, session_id):
        from app_desktop import SessionWindow
        self.session_window = SessionWindow(session_id)
        self.session_window.show()

# =========================================================
# 🚀 Punto de entrada
# =========================================================
if __name__ == "__main__":
    app = QApplication(sys.argv)
    win = LoginWindow()
    win.show()
    sys.exit(app.exec_())
