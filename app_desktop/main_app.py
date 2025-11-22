# app_desktop/main_app.py
import sys
import os

# Habilitar flags de chromium para WebEngine (mejora soporte getUserMedia)
# Nota: si pones '--use-fake-ui-for-media-stream' te saltas el permiso de UI (solo para tests).
os.environ.setdefault('QTWEBENGINE_CHROMIUM_FLAGS',
                        '--enable-usermedia --enable-media-stream')

from PyQt5.QtCore import QUrl, QObject, pyqtSignal, pyqtSlot
from PyQt5.QtWidgets import QApplication, QMainWindow, QMessageBox
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEngineSettings, QWebEngineProfile, QWebEnginePage
from PyQt5.QtWebChannel import QWebChannel

class Bridge(QObject):
    loginSuccess = pyqtSignal(str, str, int)

    @pyqtSlot(str, str, int)
    def onLoginSuccess(self, token, role, user_id):
        print(f"✅ Bridge → Login exitoso | Rol: {role}, ID: {user_id}")
        js_store = f"""
            localStorage.setItem('token', '{token}');
            localStorage.setItem('role', '{role}');
            localStorage.setItem('user_id', '{user_id}');
        """
        # Ejecuta JS para guardar token y demás
        try:
            self.parent().web_view.page().runJavaScript(js_store)
        except Exception as e:
            print("Error ejecutando JS desde Bridge:", e)
        self.loginSuccess.emit(token, role, user_id)

class WebWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("EMOTIA")
        self.setGeometry(200, 100, 1280, 720)

        # Forzar perfil persistente para evitar problemas de cache en entornos Windows con permisos
        profile = QWebEngineProfile.defaultProfile()
        profile.setPersistentCookiesPolicy(QWebEngineProfile.ForcePersistentCookies)
        # (opcional) ajustar carpeta cache si tienes problemas de permiso:
        # profile.setCachePath("C:/temp/emotia_cache")
        # profile.setPersistentStoragePath("C:/temp/emotia_storage")

        self.web_view = QWebEngineView(self)
        self.bridge = Bridge()
        self.bridge.setParent(self)

        # Permitir JS y plugins
        self.web_view.settings().setAttribute(QWebEngineSettings.PluginsEnabled, True)
        self.web_view.settings().setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        self.web_view.settings().setAttribute(QWebEngineSettings.FullScreenSupportEnabled, True)
        # Activar WebRTC-related attribute si está disponible
        try:
            self.web_view.settings().setAttribute(QWebEngineSettings.WebAttribute( QWebEngineSettings.WebRTCPublicInterfacesEnabled ), True)
        except Exception:
            # Algunas versiones no exponen ese atributo; no romper si no existe.
            pass

        # Conectar petición de permisos (cámara/micrófono)
        self.web_view.page().featurePermissionRequested.connect(self.on_permission_request)

        # Canal PyQt5 <-> JS
        self.channel = QWebChannel()
        self.channel.registerObject("qtBridgeObj", self.bridge)
        self.web_view.page().setWebChannel(self.channel)
        print("➡️ Canal QWebChannel listo (qtBridgeObj)")

        self.setCentralWidget(self.web_view)
        self.load_page("login.html")

        self.bridge.loginSuccess.connect(self.load_dashboard)
        # imprimir consola JS en Python
        self.web_view.page().javaScriptConsoleMessage = self.handle_js_console

    def on_permission_request(self, security_origin, feature):
        """
        Permitir automáticamente cámara y micrófono.
        security_origin: QUrl, feature: QWebEnginePage.Feature
        """
        try:
            # conceder permiso
            self.web_view.page().setFeaturePermission(security_origin, feature, QWebEnginePage.PermissionGrantedByUser)
            print(f"Permiso concedido para {feature} desde {security_origin.toString()}")
        except Exception as e:
            print("Error al conceder permiso:", e)

    def handle_js_console(self, level, msg, line, sourceID):
        print(f"[JS] {msg}")

    def load_page(self, filename):
        html_path = os.path.join(os.path.dirname(__file__), "views", "html", filename)
        abs_path = os.path.abspath(html_path)
        self.web_view.load(QUrl.fromLocalFile(abs_path))
        print(f"🌐 Cargando {filename}")

    def load_dashboard(self, token, role, user_id):
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
