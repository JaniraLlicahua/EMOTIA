// app_desktop/views/js/psicoReuniones.js
const API_URL = "http://127.0.0.1:8000";

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token");
    const sessionsContainer = document.getElementById("sessionsContainer");
    const modal = document.getElementById("modalReunion");
    const btnAddMeeting = document.getElementById("btnAddMeeting");
    const btnGuardar = document.getElementById("btnGuardar");
    const btnCancelar = document.getElementById("btnCancelar");

    const detPaciente = document.getElementById("detPaciente");
    const detHora = document.getElementById("detHora");
    const detFecha = document.getElementById("detFecha");
    const detTema = document.getElementById("detTema");
    const btnIniciar = document.getElementById("btnIniciar");

    btnAddMeeting.addEventListener("click", () => { modal.style.display = "block"; });
    btnCancelar.addEventListener("click", () => { modal.style.display = "none"; });

    async function loadMeetings() {
        try {
            const res = await fetch(`${API_URL}/meetings`, {
                headers: { "Authorization": token ? `Bearer ${token}` : "" },
            });

            if (!res.ok) {
                // intentamos parsear JSON de error, si no, mostramos texto
                let errBody;
                try { errBody = await res.json(); } catch (e) { errBody = await res.text(); }
                console.error("Error cargando reuniones:", errBody);
                // mostrar alerta con detalle si está disponible
                if (errBody && errBody.detail) {
                    alert("Error cargando reuniones: " + errBody.detail);
                } else {
                    alert("Error cargando reuniones: " + JSON.stringify(errBody));
                }
                return;
            }

            const data = await res.json();
            if (!Array.isArray(data)) {
                console.warn("Respuesta inesperada de reuniones:", data);
                return;
            }
            renderMeetings(data);
        } catch (err) {
            console.error("Error cargando reuniones:", err);
            alert("Error cargando reuniones: " + err.message);
        }
    }

    function renderMeetings(data) {
        sessionsContainer.innerHTML = "";
        const grouped = [[], [], [], [], []]; // Lunes a Viernes

        data.forEach(m => {
            const d = new Date(m.date);
            if (isNaN(d)) return;
            const dayIndex = d.getDay() - 1;
            if (dayIndex >= 0 && dayIndex < 5) grouped[dayIndex].push(m);
        });

        grouped.forEach(dayMeetings => {
            const dayDiv = document.createElement("div");
            dayDiv.classList.add("day");

            dayMeetings.forEach(m => {
                const div = document.createElement("div");
                div.classList.add("session");
                div.innerHTML = `<h4>${m.time}</h4><p>Sesión con Paciente #${m.patient_id}</p>`;
                div.addEventListener("click", () => showDetails(m));
                dayDiv.appendChild(div);
            });

            sessionsContainer.appendChild(dayDiv);
        });
    }

    function showDetails(m) {
        detPaciente.textContent = `Paciente #${m.patient_id}`;
        detHora.textContent = m.time;
        detFecha.textContent = m.date;
        detTema.textContent = m.topic || "(Sin tema)";
        btnIniciar.onclick = () => startMeeting(m.id);
    }

    btnGuardar.addEventListener("click", async () => {
        const patient_id = document.getElementById("patientId").value;
        const date = document.getElementById("date").value;
        const time = document.getElementById("time").value;
        const topic = document.getElementById("topic").value;

        if (!patient_id || !date || !time) {
            alert("Por favor completa todos los campos obligatorios");
            return;
        }

        const body = { patient_id: parseInt(patient_id,10), date, time, topic };

        try {
            const res = await fetch(`${API_URL}/meetings`, {
                method: "POST",
                headers: {
                    "Authorization": token ? `Bearer ${token}` : "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                let errBody;
                try { errBody = await res.json(); } catch (e) { errBody = await res.text(); }
                console.error("Error al crear reunión:", errBody);
                if (errBody && errBody.detail) {
                    alert("Error al crear reunión: " + errBody.detail);
                } else {
                    alert("Error al crear reunión: " + JSON.stringify(errBody));
                }
                return;
            }

            const data = await res.json();
            alert(data.message || "Reunión creada");
            modal.style.display = "none";
            loadMeetings();
        } catch (err) {
            console.error("Error al crear reunión:", err);
            alert("Error al crear reunión: " + err.message);
        }
    });

    function startMeeting(id) {
        const token = localStorage.getItem("token");
        window.location.href = `room.html?session_id=${id}&token=${token}`;
    }

    loadMeetings();
});
