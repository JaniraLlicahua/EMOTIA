// app_desktop/views/js/psicoEmociones.js
const API_URL = "http://127.0.0.1:8000";

document.addEventListener("DOMContentLoaded", async () => {
    const listaPacientes = document.getElementById("listaPacientes");
    const emocionesGrid = document.getElementById("emocionesGrid");
    const tituloEmociones = document.getElementById("tituloEmociones");
    const notasContainer = document.getElementById("notasContainer");
    const panelReportes = document.getElementById("panelReportes");
    const listaNotas = document.getElementById("listaNotas");

    const btnNuevoReporte = document.getElementById("btnNuevoReporte");
    const btnDescargarReporte = document.getElementById("btnDescargarReporte");

    const selectorReportes = document.getElementById("selectorReportes");

    const usernameEl = document.querySelector(".username");
    const avatarEl = document.querySelector(".avatar");
    const userMenuIcon = document.querySelector(".user i.fa-caret-down");

    const token = localStorage.getItem("token");
    const userId = parseInt(localStorage.getItem("user_id") || "0");

    if (!token || !userId) {
        alert("⚠️ Sesión expirada.");
        window.location.href = "../html/login.html";
        return;
    }

    // =========================
    // PERFIL USUARIO
    // =========================
    try {
        const res = await fetch(`${API_URL}/users/${userId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            const user = await res.json();
            usernameEl.textContent = user.first_name
                ? `${user.first_name} ${user.last_name || ""}`
                : user.username;
            if (user.photo_url) avatarEl.src = user.photo_url;
        }
    } catch (e) {
        console.warn("Error perfil:", e);
    }

    // =========================
    // ✅ CARGAR PACIENTES (MISMO ENDPOINT QUE psicoPacientes.js)
    // =========================
    async function loadPacientes() {
        try {
            const res = await fetch(`${API_URL}/chat/contacts/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Error pacientes");

            const pacientes = await res.json();
            listaPacientes.innerHTML = "";

            if (pacientes.length === 0) {
                listaPacientes.innerHTML = "<li>No hay pacientes.</li>";
                return;
            }

            pacientes.forEach(p => {
                const li = document.createElement("li");
                li.classList.add("paciente");
                li.innerHTML = `
                    <img src="../pictures/user.png">
                    <div>
                        <h4>${p.first_name || ""} ${p.last_name || ""}</h4>
                        <span>${p.username}</span>
                    </div>
                `;
                li.addEventListener("click", () =>
                    selectPaciente(p.id, `${p.first_name} ${p.last_name}`, li)
                );
                listaPacientes.appendChild(li);
            });

        } catch (err) {
            console.error(err);
            listaPacientes.innerHTML = `<li style="color:red;">Error al cargar pacientes</li>`;
        }
    }

    let selectedPatientId = null;

    // =========================
    // SELECCIONAR PACIENTE
    // =========================
    async function selectPaciente(id, nombre, liElement) {
        selectedPatientId = id;

        document.querySelectorAll(".paciente").forEach(p => p.classList.remove("active"));
        liElement.classList.add("active");

        tituloEmociones.textContent = `Emociones Detectadas - ${nombre}`;
        panelReportes.style.display = "block";
        notasContainer.style.display = "block";

        // -------- EMOCIONES --------
        try {
            const res = await fetch(`${API_URL}/patients/${id}/emotions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();

            emocionesGrid.innerHTML = "";
            const emociones = Object.entries(data.summary);

            if (emociones.length === 0) {
                emocionesGrid.innerHTML = "<p>No hay emociones registradas.</p>";
                return;
            }

            emociones.forEach(([tipo, porcentaje]) => {
                const div = document.createElement("div");
                div.classList.add("emocion");
                div.innerHTML = `
                    <p>${tipo}</p>
                    <span>${porcentaje}%</span>
                `;
                emocionesGrid.appendChild(div);
            });
        } catch (err) {
            console.error(err);
            emocionesGrid.innerHTML = "<p style='color:red;'>Error emociones</p>";
        }

        // -------- REPORTES --------
        await cargarReportes(id);
    }

    // =========================
    // ✅ CARGAR REPORTES Y LLENAR SELECTOR
    // =========================
    async function cargarReportes(id) {
        try {
            const res = await fetch(`${API_URL}/patients/${id}/reports`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const reportes = await res.json();

            listaNotas.innerHTML = "";
            selectorReportes.innerHTML = `<option value="">Seleccione reporte</option>`;

            reportes.forEach(r => {
                const div = document.createElement("div");
                div.innerHTML = `<strong>${r.motivo}</strong><br>${r.observaciones}`;
                listaNotas.appendChild(div);

                const opt = document.createElement("option");
                opt.value = r.motivo;
                opt.textContent = r.motivo;
                selectorReportes.appendChild(opt);
            });

        } catch (err) {
            console.error(err);
        }
    }

    // =========================
    // ✅ DESCARGAR DESDE SELECTOR
    // =========================
    btnDescargarReporte.addEventListener("click", () => {
        const motivo = selectorReportes.value;
        if (!motivo || !selectedPatientId) {
            alert("Seleccione un reporte");
            return;
        }

        window.open(
            `${API_URL}/patients/${selectedPatientId}/reports/${encodeURIComponent(motivo)}/download`,
            "_blank"
        );
    });

    // =========================
    // INICIAR
    // =========================
    loadPacientes();
});
