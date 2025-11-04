const API_URL = "http://127.0.0.1:8000";

document.addEventListener("DOMContentLoaded", async () => {
    const listaPacientes = document.getElementById("listaPacientes");
    const emocionesGrid = document.getElementById("emocionesGrid");
    const tituloEmociones = document.getElementById("tituloEmociones");
    const notasContainer = document.getElementById("notasContainer");
    const panelReportes = document.getElementById("panelReportes");

    const btnNuevoReporte = document.getElementById("btnNuevoReporte");
    const btnMostrarNuevoReporte = document.getElementById("btnMostrarNuevoReporte");
    const btnGuardarReporte = document.getElementById("btnGuardarReporte");
    const btnDescargarReporte = document.getElementById("btnDescargarReporte");

    const usernameEl = document.querySelector(".username");
    const avatarEl = document.querySelector(".avatar");
    const userMenuIcon = document.querySelector(".user i.fa-caret-down");

    const token = localStorage.getItem("token");
    const userId = parseInt(localStorage.getItem("user_id") || "0");

    if (!token || !userId) {
        alert("⚠️ Sesión expirada. Inicia sesión nuevamente.");
        window.location.href = "../html/login.html";
        return;
    }

    // =============================
    // 👤 Mostrar nombre y menú del usuario
    // =============================
    const userMenu = document.createElement("div");
    userMenu.className = "user-menu";
    userMenu.style.cssText = `
        position: absolute;
        top: 60px;
        right: 20px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 3px 8px rgba(0,0,0,0.1);
        display: none;
        flex-direction: column;
        min-width: 150px;
        z-index: 200;
    `;
    userMenu.innerHTML = `
        <button id="logoutBtn" style="padding:10px;border:none;background:none;text-align:left;cursor:pointer;font-size:0.9rem;">🚪 Cerrar sesión</button>
    `;
    document.body.appendChild(userMenu);

    userMenuIcon.addEventListener("click", () => {
        userMenu.style.display = userMenu.style.display === "flex" ? "none" : "flex";
    });

    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.clear();
        window.location.href = "../html/login.html";
    });

    // Mostrar datos del psicólogo logueado
    try {
        const res = await fetch(`${API_URL}/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
        const user = await res.json();
        usernameEl.textContent = user.first_name
            ? `${user.first_name} ${user.last_name || ""}`
            : user.username;
        if (user.photo_url) avatarEl.src = user.photo_url;
        }
    } catch (e) {
        console.warn("No se pudo cargar perfil:", e);
    }

    // =============================
    // 🧑‍🤝‍🧑 Cargar pacientes asignados
    // =============================
    async function loadPacientes() {
        try {
        const res = await fetch(`${API_URL}/psychologist/patients`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Error al cargar pacientes");
        const pacientes = await res.json();

        listaPacientes.innerHTML = "";
        if (pacientes.length === 0) {
            listaPacientes.innerHTML = "<li>No hay pacientes registrados.</li>";
            return;
        }

        pacientes.forEach((p) => {
            const li = document.createElement("li");
            li.classList.add("paciente");
            li.innerHTML = `
            <img src="../pictures/user.png" alt="paciente">
            <div>
                <h4>${p.first_name || ""} ${p.last_name || ""}</h4>
                <span>Registrado: ${p.created_at || "N/A"}</span>
            </div>
            `;
            li.addEventListener("click", () => selectPaciente(p.id, `${p.first_name} ${p.last_name}`, li));
            listaPacientes.appendChild(li);
        });
        } catch (err) {
        console.error(err);
        listaPacientes.innerHTML = `<li style="color:red;">Error al cargar pacientes</li>`;
        }
    }

    // =============================
    // 🎯 Seleccionar paciente
    // =============================
    let selectedPatientId = null;
    async function selectPaciente(id, nombre, liElement) {
        selectedPatientId = id;
        document.querySelectorAll(".paciente").forEach((el) => el.classList.remove("active"));
        liElement.classList.add("active");

        tituloEmociones.textContent = `Emociones Detectadas - ${nombre}`;
        notasContainer.style.display = "block";
        panelReportes.style.display = "none";

        await loadEmociones(id);
    }

    // =============================
    // 😊 Cargar emociones detectadas
    // =============================
    async function loadEmociones(patientId) {
        try {
        const res = await fetch(`${API_URL}/psychologist/emotions/${patientId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("No se pudieron cargar emociones");

        const data = await res.json();
        const emociones = data.summary || {};

        emocionesGrid.innerHTML = "";
        if (Object.keys(emociones).length === 0) {
            emocionesGrid.innerHTML = `<p style="color:#888;">Sin detecciones registradas.</p>`;
            return;
        }

        const labels = {
            happy: "Alegría",
            sad: "Tristeza",
            angry: "Enojo",
            neutral: "Calma",
            fear: "Miedo",
            disgust: "Disgusto",
            surprise: "Sorpresa",
        };

        Object.entries(emociones).forEach(([key, value]) => {
            const div = document.createElement("div");
            div.classList.add("emocion", key);
            div.innerHTML = `
            <i class="fa-regular ${
                key === "happy"
                ? "fa-face-smile"
                : key === "sad"
                ? "fa-face-sad-tear"
                : key === "angry"
                ? "fa-face-angry"
                : "fa-face-meh"
            }"></i>
            <p>${labels[key] || key}</p>
            <span>${value}%</span>
            `;
            emocionesGrid.appendChild(div);
        });
        } catch (err) {
        emocionesGrid.innerHTML = `<p style="color:red;">${err.message}</p>`;
        }
    }

    // =============================
    // 🧾 Guardar nuevo reporte
    // =============================
    btnGuardarReporte.addEventListener("click", async () => {
        if (!selectedPatientId) return alert("Selecciona un paciente primero");

        const body = {
        patient_id: selectedPatientId,
        motivo: document.getElementById("motivo").value.trim(),
        tecnica: document.getElementById("tecnica").value.trim(),
        observaciones: document.getElementById("observaciones").value.trim(),
        resultados: document.getElementById("resultados").value.trim(),
        conclusiones: document.getElementById("conclusiones").value.trim(),
        recomendaciones: document.getElementById("recomendaciones").value.trim(),
        };

        if (!body.motivo) return alert("⚠️ Completa el campo 'Motivo' antes de guardar.");

        try {
        const res = await fetch(`${API_URL}/psychologist/report`, {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Error al guardar el reporte");

        const data = await res.json();
        alert(`✅ ${data.message}`);
        } catch (err) {
        alert(`❌ ${err.message}`);
        }
    });

    // =============================
    // Mostrar / ocultar formulario
    // =============================
    btnNuevoReporte.addEventListener("click", () => {
        if (!selectedPatientId) return alert("Selecciona un paciente primero");
        panelReportes.style.display =
        panelReportes.style.display === "none" ? "block" : "none";
    });

    btnMostrarNuevoReporte.addEventListener("click", () => {
        const form = document.getElementById("nuevoReporteForm");
        form.style.display = form.style.display === "none" ? "block" : "none";
    });

    // =============================
    // Descargar reporte
    // =============================
    btnDescargarReporte.addEventListener("click", async () => {
        if (!selectedPatientId) return alert("Selecciona un paciente primero");

        const reportId = prompt("🔢 Ingresa el ID del reporte que deseas descargar:");
        if (!reportId) return;

        try {
        const res = await fetch(`${API_URL}/psychologist/reports/${reportId}/download`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Error al descargar el reporte");

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reporte_${reportId}.pdf`;
        a.click();
        } catch (err) {
        alert(`❌ ${err.message}`);
        }
    });

    // =============================
    // 🚀 Inicialización
    // =============================
    loadPacientes();
});
