function initQtBridgeIfAvailable() {
  if (typeof QWebChannel !== "undefined" && typeof qt !== "undefined") {
    try {
      new QWebChannel(qt.webChannelTransport, (channel) => {
        window.qtBridgeObj = channel.objects.qtBridgeObj;
        console.log("✅ Qt bridge inicializado");
      });
    } catch (e) {
      console.warn("⚠️ No se pudo inicializar QWebChannel:", e);
    }
  }
}

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
      // ✅ LOGIN
      const res = await fetch("http://127.0.0.1:8000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Error desconocido" }));
        errorMsg.textContent = err.detail || "Credenciales incorrectas";
        return;
      }

      const data = await res.json();
      console.log("✅ Login correcto:", data);

      const token = data.access_token;
      const role = data.role;
      const userId = data.user_id;

      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      localStorage.setItem("user_id", userId);

      // ✅ AHORA obtenemos el nombre REAL desde /users/{id}
      let fullName = "Usuario";

      try {
        const resUser = await fetch(`http://127.0.0.1:8000/users/${userId}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (resUser.ok) {
          const user = await resUser.json();
          fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
          if (!fullName) fullName = user.username;
        }
      } catch (e) {
        console.warn("⚠️ No se pudo obtener nombre real:", e);
      }

      localStorage.setItem("full_name", fullName);

      // ✅ ENVIAR A PYQT CON NOMBRE REAL
      if (window.qtBridgeObj) {
        window.qtBridgeObj.onLoginSuccess(
          token,
          role,
          userId,
          fullName
        );
      } else {
        // fallback para navegador
        if (role === "admin") {
          window.location.href = "../html/adminPacientes.html";
        } else if (role === "psychologist") {
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
