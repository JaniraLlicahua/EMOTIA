# app_desktop/main_app.py
import sys
import os

# Habilitar flags de chromium para WebEngine
os.environ.setdefault(
    'QTWEBENGINE_CHROMIUM_FLAGS',
    '--enable-usermedia --enable-media-stream'
)

from PyQt5.QtCore import QUrl, QObject, pyqtSignal, pyqtSlot
from PyQt5.QtWidgets import QApplication, QMainWindow, QMessageBox
from PyQt5.QtWebEngineWidgets import (
    QWebEngineView,
    QWebEngineSettings,
    QWebEngineProfile,
    QWebEnginePage
)
from PyQt5.QtWebChannel import QWebChannel
from PyQt5.QtGui import QIcon   # ✅ IMPORTANTE PARA EL ÍCONO


# ===================== BRIDGE =====================
class Bridge(QObject):
    loginSuccess = pyqtSignal(str, str, int, str)

    @pyqtSlot(str, str, int, str)
    def onLoginSuccess(self, token, role, user_id, full_name):
        print("✅ Bridge recibió:")
        print("  token:", token)
        print("  role:", role)
        print("  user_id:", user_id)
        print("  full_name:", full_name)

        js_store = f"""
            localStorage.setItem('token', '{token}');
            localStorage.setItem('role', '{role}');
            localStorage.setItem('user_id', '{user_id}');
            localStorage.setItem('full_name', '{full_name}');
        """

        try:
            self.parent().web_view.page().runJavaScript(js_store)
        except Exception as e:
            print("Error ejecutando JS desde Bridge:", e)

        self.loginSuccess.emit(token, role, user_id, full_name)

# ===================== VENTANA PRINCIPAL =====================
class WebWindow(QMainWindow):
    def __init__(self):
        super().__init__()

        # ✅ RUTA REAL DE TU LOGO
        icon_path = os.path.join(
            os.path.dirname(__file__),
            "views",
            "pictures",
            "Logo Emotia.png"
        )

        # ✅ APLICAR ICONO A LA VENTANA
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
            print("✅ Ícono cargado correctamente")
        else:
            print("❌ No se encontró el ícono en:", icon_path)

        self.setWindowTitle("EMOTIA")
        self.setGeometry(200, 100, 1280, 720)

        # Perfil persistente
        profile = QWebEngineProfile.defaultProfile()
        profile.setPersistentCookiesPolicy(QWebEngineProfile.ForcePersistentCookies)

        # Descargas
        profile.downloadRequested.connect(self.handle_download)

        self.web_view = QWebEngineView(self)
        self.bridge = Bridge()
        self.bridge.setParent(self)

        # Permitir JS y plugins
        self.web_view.settings().setAttribute(QWebEngineSettings.PluginsEnabled, True)
        self.web_view.settings().setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        self.web_view.settings().setAttribute(QWebEngineSettings.FullScreenSupportEnabled, True)

        try:
            self.web_view.settings().setAttribute(
                QWebEngineSettings.WebRTCPublicInterfacesEnabled, True
            )
        except Exception:
            pass

        self.web_view.page().featurePermissionRequested.connect(self.on_permission_request)

        # WebChannel
        self.channel = QWebChannel()
        self.channel.registerObject("qtBridgeObj", self.bridge)
        self.web_view.page().setWebChannel(self.channel)
        print("➡️ Canal QWebChannel listo (qtBridgeObj)")

        self.setCentralWidget(self.web_view)
        self.load_page("login.html")

        self.bridge.loginSuccess.connect(self.load_dashboard)
        self.web_view.page().javaScriptConsoleMessage = self.handle_js_console


    def on_permission_request(self, security_origin, feature):
        try:
            self.web_view.page().setFeaturePermission(
                security_origin,
                feature,
                QWebEnginePage.PermissionGrantedByUser
            )
        except Exception as e:
            print("Error al conceder permiso:", e)


    def handle_js_console(self, level, msg, line, sourceID):
        print(f"[JS] {msg}")


    def handle_download(self, download):
        download_path = os.path.join(os.path.expanduser("~"), "Downloads")
        file_path = os.path.join(download_path, download.downloadFileName())

        download.setPath(file_path)
        download.accept()

        print(f"✅ Archivo descargándose en: {file_path}")


    def load_page(self, filename):
        html_path = os.path.join(
            os.path.dirname(__file__),
            "views",
            "html",
            filename
        )
        abs_path = os.path.abspath(html_path)
        self.web_view.load(QUrl.fromLocalFile(abs_path))
        print(f"🌐 Cargando {filename}")


    def load_dashboard(self, token, role, user_id, full_name):

        if role == "admin":
            html = "adminPacientes.html"
        elif role == "psychologist":
            html = "psicoPacientes.html"
        elif role == "patient":
            html = "pacieCalendario.html"
        else:
            html = "login.html"

        self.load_page(html)

        # 🔒 Fallback seguro: si por alguna razón no llegó full_name
        if not full_name:
            def get_name_from_js(result):
                name = result if result else "Usuario"
                QMessageBox.information(
                    self,
                    "Login correcto",
                    f"Bienvenido, {name}"
                )

            self.web_view.page().runJavaScript(
                "localStorage.getItem('full_name');",
                get_name_from_js
            )
        else:
            QMessageBox.information(
                self,
                "Login correcto",
                f"Bienvenido, {full_name}"
            )

    def closeEvent(self, event):
        print("🧹 Cerrando aplicación y limpiando sesión...")
        self.web_view.page().runJavaScript("localStorage.clear();")
        event.accept()


# ===================== APP =====================
class EmotiaApp(QApplication):
    def __init__(self, args):
        super().__init__(args)

        # ✅ TAMBIÉN SE DEFINE ICONO PARA LA APP (NOTIFICACIONES / BARRA)
        icon_path = os.path.join(
            os.path.dirname(__file__),
            "views",
            "pictures",
            "Logo Emotia.png"
        )
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))

        self.window = WebWindow()
        self.window.show()


# ===================== MAIN =====================
if __name__ == "__main__":
    app = EmotiaApp(sys.argv)
    sys.exit(app.exec_())
