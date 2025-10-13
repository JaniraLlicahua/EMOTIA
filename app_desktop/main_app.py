# app_desktop/main_app.py
import sys
import os
import requests
from PyQt5.QtCore import QUrl
from PyQt5.QtWidgets import QApplication, QMainWindow, QMessageBox
from PyQt5.QtWebEngineWidgets import QWebEngineView

API_URL = "http://127.0.0.1:8000"  # Backend FastAPI local


class WebWindow(QMainWindow):
    """Ventana que muestra una vista HTML como interfaz."""

    def __init__(self, html_file):
        super().__init__()
        self.setWindowTitle("EMOTIA")
        self.setGeometry(200, 100, 1280, 720)

        # Crear vista del navegador interno
        self.web_view = QWebEngineView(self)
        html_path = os.path.join(os.path.dirname(__file__), "views", "html", html_file)
        self.web_view.load(QUrl.fromLocalFile(os.path.abspath(html_path)))
        self.setCentralWidget(self.web_view)

        # Exponer funciones JS → Python más adelante (login, IA, etc.)
        self.web_view.page().javaScriptConsoleMessage = self.handle_js_console

    def handle_js_console(self, level, msg, line, sourceID):
        """Captura mensajes desde console.log en JS (útil para debug)."""
        print(f"[JS] {msg}")


class EmotiaApp(QApplication):
    """App principal que maneja ventanas y lógica."""

    def __init__(self, args):
        super().__init__(args)
        self.main_window = WebWindow("login.html")
        self.main_window.show()


if __name__ == "__main__":
    app = EmotiaApp(sys.argv)
    sys.exit(app.exec_())
