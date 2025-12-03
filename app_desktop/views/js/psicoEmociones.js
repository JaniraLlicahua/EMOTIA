const API_URL = "http://127.0.0.1:8000";

document.addEventListener("DOMContentLoaded", async () => {
    const listaPacientes = document.getElementById("listaPacientes");
    const emocionesGrid = document.getElementById("emocionesGrid");
    const tituloEmociones = document.getElementById("tituloEmociones");
    const notasContainer = document.getElementById("notasContainer");
    const panelReportes = document.getElementById("panelReportes");
    const listaNotas = document.getElementById("listaNotas");

    const btnDescargarReporte = document.getElementById("btnDescargarReporte");
    const selectorReportes = document.getElementById("selectorReportes");

    const usernameEl = document.querySelector(".username");
    const avatarEl = document.querySelector(".avatar");

    const token = localStorage.getItem("token");
    const userId = parseInt(localStorage.getItem("user_id") || "0");

    if (!token || !userId) {
        alert("⚠️ Sesión expirada.");
        window.location.href = "../html/login.html";
        return;
    }

    // Emojis y mapa de colores (si necesitas usar color inline)
    const EMOJI = {
        feliz: "😄",
        triste: "😢",
        enojo: "😠",
        miedo: "😨",
        sorpresa: "😲",
        asco: "🤢",
        neutral: "😐",
        // soporta nombres en inglés también
        happy: "😄",
        sad: "😢",
        angry: "😠",
        fear: "😨",
        surprise: "😲",
        disgust: "🤢"
    };

    // --------------------------
    // PERFIL USUARIO
    // --------------------------
    try {
        const res = await fetch(`${API_URL}/users/${userId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            const user = await res.json();
            usernameEl.textContent = user.first_name
                ? `${user.first_name} ${user.last_name || ""}`
                : (user.username || "Usuario");
            if (user.photo_url) avatarEl.src = user.photo_url;
        }
    } catch (e) {
        console.warn("Error perfil:", e);
    }

    // --------------------------
    // CARGAR PACIENTES
    // --------------------------
    async function loadPacientes() {
        try {
            const res = await fetch(`${API_URL}/chat/contacts/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Error pacientes");

            const pacientes = await res.json();
            listaPacientes.innerHTML = "";

            if (!Array.isArray(pacientes) || pacientes.length === 0) {
                listaPacientes.innerHTML = "<li>No hay pacientes.</li>";
                return;
            }

            pacientes.forEach(p => {
                const li = document.createElement("li");
                li.classList.add("paciente");
                li.innerHTML = `
                    <img src="../pictures/user.png" alt="paciente">
                    <div>
                        <h4>${p.first_name || ""} ${p.last_name || ""}</h4>
                        <span>${p.username || ""}</span>
                    </div>
                `;
                li.addEventListener("click", () => {
                    const nombreCompleto = `${p.first_name || ""} ${p.last_name || ""}`.trim();
                    selectPaciente(p.id, nombreCompleto || p.username, li);
                });
                listaPacientes.appendChild(li);
            });

        } catch (err) {
            console.error(err);
            listaPacientes.innerHTML = `<li style="color:red;">Error al cargar pacientes</li>`;
        }
    }

    let selectedPatientId = null;

    // --------------------------
    // SELECCIONAR PACIENTE
    // --------------------------
    async function selectPaciente(id, nombre, liElement) {
        selectedPatientId = id;

        document.querySelectorAll(".paciente").forEach(p => p.classList.remove("active"));
        liElement.classList.add("active");

        tituloEmociones.textContent = `Emociones Detectadas - ${nombre}`;
        panelReportes.style.display = "block";
        notasContainer.style.display = "block";

        // Obtener emociones desde API
        try {
            const res = await fetch(`${API_URL}/psychologist/patients/${id}/emotions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Error al obtener emociones");
            const data = await res.json();

            emocionesGrid.innerHTML = "";
            const emociones = Object.entries(data.summary || {});

            if (emociones.length === 0) {
                emocionesGrid.innerHTML = "<p style='grid-column:1/-1;text-align:center;color:#666;'>No hay emociones registradas.</p>";
                return;
            }

            // Normaliza claves (si backend devuelve 'happy' u 'happy ' etc.)
            emociones.forEach(([rawTipo, porcentaje]) => {
                const tipo = String(rawTipo || "").trim().toLowerCase();
                const div = document.createElement("div");

                // asigna clase que coincide con CSS (.emocion.feliz / .emocion.triste / etc.)
                // mapeo rápido: english -> spanish
                const mapToSpanish = {
                    happy: "feliz",
                    sad: "triste",
                    angry: "enojo",
                    fear: "miedo",
                    surprise: "sorpresa",
                    disgust: "asco",
                    neutral: "neutral"
                };
                const tipoES = mapToSpanish[tipo] || tipo;

                div.className = `emocion ${tipoES}`;

                const emoji = EMOJI[tipo] || EMOJI[tipoES] || "🙂";
                const displayName = tipoES; // tu CSS hace text-transform:capitalize

                div.innerHTML = `
                    <h3 aria-hidden="true">${emoji}</h3>
                    <p>${displayName}</p>
                    <span>${porcentaje}%</span>
                `;

                emocionesGrid.appendChild(div);
            });

        } catch (err) {
            console.error(err);
            emocionesGrid.innerHTML = "<p style='color:red;'>Error emociones</p>";
        }

        // Cargar reportes asociados
        await cargarReportes(id);
    }

    // --------------------------
    // CARGAR REPORTES Y LLENAR SELECTOR
    // --------------------------
    async function cargarReportes(id) {
        try {
            const res = await fetch(`${API_URL}/psychologist/patients/${id}/reports`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Error reportes");
            const reportes = await res.json();

            listaNotas.innerHTML = "";
            if (selectorReportes) selectorReportes.innerHTML = `<option value="">Seleccione reporte</option>`;

            if (!Array.isArray(reportes) || reportes.length === 0) {
                if (listaNotas) listaNotas.innerHTML = "<p>No hay reportes.</p>";
                return;
            }

            reportes.forEach(r => {
                const div = document.createElement("div");
                div.innerHTML = `<strong>${r.motivo || "Reporte"}</strong><br>${r.observaciones || ""}`;
                listaNotas.appendChild(div);

                if (selectorReportes) {
                    const opt = document.createElement("option");
                    opt.value = r.id;
                    opt.textContent = r.motivo || `Reporte ${r.id}`;
                    selectorReportes.appendChild(opt);
                }
            });

        } catch (err) {
            console.error(err);
        }
    }

    // --------------------------
    // DESCARGAR REPORTE (BOTÓN)
    // --------------------------
    if (btnDescargarReporte) {
        btnDescargarReporte.addEventListener("click", () => {
            const reportId = selectorReportes ? selectorReportes.value : null;

            if (!reportId || !selectedPatientId) {
                alert("⚠️ Seleccione un reporte primero");
                return;
            }

            const url = `${API_URL}/psychologist/patients/${selectedPatientId}/reports/${reportId}/download`;

            // crear enlace para forzar descarga (funciona en PyQt WebEngine)
            const a = document.createElement("a");
            a.href = url;
            a.setAttribute("download", `reporte_${reportId}.pdf`);
            document.body.appendChild(a);

            // click y cleanup
            a.click();
            document.body.removeChild(a);

            // alerta al usuario (ligeramente retardada para dar tiempo al navegador)
            setTimeout(() => {
                alert("✅ El reporte se descargó correctamente");
            }, 600);
        });
    }

    // INICIAR
    loadPacientes();
});
