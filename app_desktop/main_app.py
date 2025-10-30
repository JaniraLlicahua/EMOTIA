import sys, os
from PyQt5.QtCore import QUrl, QObject, pyqtSignal, pyqtSlot
from PyQt5.QtWidgets import QApplication, QMainWindow, QMessageBox
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtWebChannel import QWebChannel


class Bridge(QObject):
    # señal que recibe (token, rol, id)
    loginSuccess = pyqtSignal(str, str, int)

    @pyqtSlot(str, str, int)
    def onLoginSuccess(self, token, role, user_id):
        """Recibido desde login.js después del login correcto"""
        print(f"✅ Bridge → Login exitoso | Rol: {role}, ID: {user_id}")

        # Guardar variables dentro del navegador (localStorage)
        js_store = f"""
            localStorage.setItem('token', '{token}');
            localStorage.setItem('role', '{role}');
            localStorage.setItem('user_id', '{user_id}');
        """
        self.parent().web_view.page().runJavaScript(js_store)

        # Emitir señal para cambiar de pantalla
        self.loginSuccess.emit(token, role, user_id)


class WebWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("EMOTIA")
        self.setGeometry(200, 100, 1280, 720)

        self.web_view = QWebEngineView(self)
        self.bridge = Bridge()
        self.bridge.setParent(self)

        # Configurar canal de comunicación JS ↔ Python
        self.channel = QWebChannel()
        self.channel.registerObject("qtBridgeObj", self.bridge)
        self.web_view.page().setWebChannel(self.channel)
        print("➡️ QWebChannel registrado con objeto 'qtBridgeObj'")
        self.setCentralWidget(self.web_view)

        # Cargar siempre login.html al inicio
        self.load_page("login.html")

        # Conectar evento del Bridge
        self.bridge.loginSuccess.connect(self.load_dashboard)
        self.web_view.page().javaScriptConsoleMessage = self.handle_js_console

    def handle_js_console(self, level, msg, line, sourceID):
        print(f"[JS] {msg}")

    def load_page(self, filename):
        html_path = os.path.join(os.path.dirname(__file__), "views", "html", filename)
        abs_path = os.path.abspath(html_path)
        self.web_view.load(QUrl.fromLocalFile(abs_path))
        print(f"🌐 Cargando {filename}")

    def load_dashboard(self, token, role, user_id):
        """Cargar vista correspondiente según el rol"""
        if role == "admin":
            html = "adminPacientes.html"
        elif role == "psychologist":
            html = "psicoPacientes.html"
        elif role == "patient":
            html = "pacieCalendario.html"
        else:
            html = "login.html"

        self.load_page(html)
        QMessageBox.information(self, "Login correcto", f"Bienvenido ({role})")

    def closeEvent(self, event):
        """Limpiar sesión al cerrar app"""
        print("🧹 Cerrando aplicación y limpiando sesión...")
        js_clear = "localStorage.clear();"
        self.web_view.page().runJavaScript(js_clear)
        event.accept()


class EmotiaApp(QApplication):
    def __init__(self, args):
        super().__init__(args)
        self.window = WebWindow()
        self.window.show()


if __name__ == "__main__":
    app = EmotiaApp(sys.argv)
    sys.exit(app.exec_())
