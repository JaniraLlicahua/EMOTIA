document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const errorMsg = document.getElementById("error-message");

  errorMsg.textContent = "";

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("role", data.role);

      if (data.role === "admin") {
        window.location.href = "html/adminPacientes.html";
      } else if (data.role === "psychologist") {
        window.location.href = "html/psicoPacientes.html";
      } else {
        window.location.href = "html/predict.html";
      }
    } else {
      const err = await res.json();
      errorMsg.textContent = err.detail || "Credenciales incorrectas";
    }
  } catch (error) {
    errorMsg.textContent = "Error de conexión con el servidor";
  }
});
