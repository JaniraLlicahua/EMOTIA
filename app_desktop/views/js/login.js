// app_desktop/views/js/login.js
// Inicialización del QWebChannel para PyQt (si se ejecuta dentro de la app)
function initQtBridgeIfAvailable() {
  if (typeof QWebChannel !== "undefined" && typeof qt !== "undefined") {
    try {
      new QWebChannel(qt.webChannelTransport, (channel) => {
        // 'qtBridgeObj' fue registrado desde Python: channel.objects.qtBridgeObj
        window.qtBridgeObj = channel.objects.qtBridgeObj;
        console.log("✅ Qt bridge inicializado (window.qtBridgeObj listo)");
      });
    } catch (e) {
      console.warn("⚠️ No se pudo inicializar QWebChannel:", e);
    }
  } else {
    // En navegador normal QWebChannel puede no existir -> modo navegador
    console.log("⚠️ QWebChannel no disponible (modo navegador)");
  }
}

// Llamamos lo antes posible
initQtBridgeIfAvailable();

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorMsg = document.getElementById("error-message");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMsg.textContent = "";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
      errorMsg.textContent = "Por favor, complete todos los campos.";
      return;
    }

    try {
      const res = await fetch("http://127.0.0.1:8000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(()=>({detail: "Error desconocido"}));
        errorMsg.textContent = err.detail || "Credenciales incorrectas";
        return;
      }

      const data = await res.json();
      console.log("✅ Login correcto:", data);

      // Guardar en localStorage (fallback navegador)
      try {
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("role", data.role);
        localStorage.setItem("user_id", data.user_id);
      } catch (e) { console.warn("No se pudo escribir localStorage:", e); }

      // Enviar al bridge PyQt si está disponible
      if (window.qtBridgeObj) {
        try {
          // Llamada al método registrado en Python (nombre: onLoginSuccess)
          window.qtBridgeObj.onLoginSuccess(data.access_token, data.role, data.user_id);
          console.log("📡 Datos enviados al bridge de PyQt");
        } catch (e) {
          console.warn("⚠️ Error llamando al bridge:", e);
        }
      } else if (window.qt && typeof QWebChannel !== "undefined") {
        // Edge case: qwebchannel existe pero la inicialización se hizo tarde -> reintento simple
        initQtBridgeIfAvailable();
        if (window.qtBridgeObj && window.qtBridgeObj.onLoginSuccess) {
          try {
            window.qtBridgeObj.onLoginSuccess(data.access_token, data.role, data.user_id);
            console.log("📡 Datos enviados al bridge tras reinit");
          } catch (e) {
            console.warn("⚠️ Error en reintento bridge:", e);
          }
        } else {
          console.warn("⚠️ Bridge no disponible aun (modo navegador)");
        }
      } else {
        // Modo navegador: redirección normal
        if (data.role === "admin") {
          window.location.href = "../html/adminPacientes.html";
        } else if (data.role === "psychologist") {
          window.location.href = "../html/psicoPacientes.html";
        } else {
          window.location.href = "../html/pacieCalendario.html";
        }
      }
    } catch (error) {
      console.error("Error de conexión:", error);
      errorMsg.textContent = "Error de conexión con el servidor.";
    }
  });
});
