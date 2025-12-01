//app_desktop\views\js\psicoReuniones.js
const API_URL = "http://127.0.0.1:8000";

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Tu sesión ha expirado. Inicia sesión nuevamente.");
        window.location.href = "../html/login.html";
        return;
    }

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
    const weekTitle = document.querySelector(".calendar-header h3");

    // estado semana (lunes)
    let currentMonday = getMonday(new Date());

    // helpers
    function getMonday(d) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        date.setDate(date.getDate() + diff);
        date.setHours(0,0,0,0);
        return date;
    }
    function addWeeks(monday, n) {
        const d = new Date(monday);
        d.setDate(d.getDate() + n * 7);
        return d;
    }
    function isoDayRange(monday) {
        const start = new Date(monday);
        start.setHours(0,0,0,0);
        const end = new Date(monday);
        end.setDate(end.getDate() + 6);
        end.setHours(23,59,59,999);
        return { start: start.toISOString(), end: end.toISOString() };
    }
    function formatRange(monday) {
        const startStr = monday.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
        const end = new Date(monday); end.setDate(end.getDate()+6);
        const endStr = end.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year:"numeric" });
        return `Semana del ${startStr} al ${endStr}`;
    }

    // nav buttons
    const navBtns = document.querySelectorAll(".calendar-header .nav-btn");
    if (navBtns && navBtns.length >= 2) {
        navBtns[0].addEventListener("click", () => { currentMonday = addWeeks(currentMonday, -1); loadMeetings(); });
        navBtns[1].addEventListener("click", () => { currentMonday = addWeeks(currentMonday, +1); loadMeetings(); });
    }

    // modal open/close
    btnAddMeeting.addEventListener("click", async () => {
        await loadPatients(); // cargar la lista de pacientes cuando abres el modal
        modal.style.display = "block";
    });
    btnCancelar.addEventListener("click", () => modal.style.display = "none");

    // ===============================
    //   CARGAR PACIENTES DEL PSICÓLOGO
    // ===============================
    async function loadPatients() {
        try {
            const res = await fetch(`${API_URL}/patients`, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (!res.ok) throw new Error(await res.text());

            const data = await res.json();
            // En el HTML del modal debes tener un <select id="patientSelector"></select>
            const select = document.getElementById("patientSelector");
            if (!select) {
                console.warn("patientSelector no encontrado en el DOM. Añade <select id=\"patientSelector\"></select> en el modal.");
                return;
            }

            select.innerHTML = `<option value="">Seleccione un paciente</option>`;

            data.forEach(p => {
                const option = document.createElement("option");
                option.value = p.id;
                // mostrar nombre y apellido (si existen), si no, username/email
                const name = (p.first_name || p.last_name) ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : (p.email || `Paciente ${p.id}`);
                option.textContent = `${name} (ID ${p.id})`;
                select.appendChild(option);
            });

        } catch (err) {
            console.error("Error cargando pacientes:", err);
            alert("Error cargando lista de pacientes.");
        }
    }

    // ===============================
    //   CARGAR REUNIONES
    // ===============================
    async function loadMeetings() {
        try {
            const { start, end } = isoDayRange(currentMonday);
            weekTitle.textContent = formatRange(currentMonday);

            const res = await fetch(`${API_URL}/meetings?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) {
                const t = await res.text();
                throw new Error(t);
            }
            const data = await res.json();
            renderMeetings(data);
        } catch (err) {
            console.error("Error cargando reuniones:", err);
            sessionsContainer.innerHTML = `<div style="padding:16px;color:#b00">Error cargando reuniones</div>`;
        }
    }

    function renderMeetings(data) {
        sessionsContainer.innerHTML = "";
        const daysOfWeek = ["Lunes","Martes","Miércoles","Jueves","Viernes"];
        const grouped = { Lunes: [], Martes: [], Miércoles: [], Jueves: [], Viernes: [] };

        data.forEach(m => {
            const dt = new Date(`${m.date}T${m.time}`);
            const idx = dt.getDay(); // 0..6
            const name = idx === 0 ? null : daysOfWeek[idx - 1]; // domingo -> null
            if (name && grouped[name]) grouped[name].push(m);
        });

        daysOfWeek.forEach(day => {
            const dayDiv = document.createElement("div");
            dayDiv.className = "day";
            dayDiv.innerHTML = `<h4>${day}</h4>`;
            if (grouped[day].length === 0) {
                dayDiv.innerHTML += `<p class="no-session">Sin sesiones</p>`;
            } else {
                grouped[day].forEach(m => {
                    const div = document.createElement("div");
                    div.className = "session";
                    div.innerHTML = `<h4>${m.time}</h4><p>Sesión con Paciente #${m.patient_id}</p>`;
                    div.addEventListener("click", () => showDetails(m, div));
                    dayDiv.appendChild(div);
                });
            }
            sessionsContainer.appendChild(dayDiv);
        });
    }

    function showDetails(m, divEl) {
        document.querySelectorAll(".session").forEach(s => s.classList.remove("active"));
        divEl.classList.add("active");

        detPaciente.textContent = `Paciente #${m.patient_id}`;
        detHora.textContent = m.time;
        detFecha.textContent = new Date(m.date).toLocaleDateString("es-ES", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
        detTema.textContent = m.topic || "(Sin tema)";
        btnIniciar.onclick = async () => {
            const res = await fetch(`${API_URL}/sessions/${m.id}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (!res.ok) {
                alert("Error al iniciar la sesión");
                return;
            }

            const data = await res.json();

            localStorage.setItem("real_session_id", data.session_id);
            localStorage.setItem("patient_id", m.patient_id); // <-- importante
            window.location.href = `../html/room_psico.html?session_id=${data.session_id}&token=${token}`;
        };

    }

    // ===============================
    //   CREAR REUNIÓN (con SELECT de pacientes)
    // ===============================
    btnGuardar.addEventListener("click", async () => {
        // aquí usamos el select (en el HTML del modal reemplaza el input patientId por <select id="patientSelector">)
        const patient_id = parseInt(document.getElementById("patientSelector").value || "", 10);
        const date = document.getElementById("date").value;
        const time = document.getElementById("time").value;
        const topic = document.getElementById("topic").value || "";

        // <-- VALIDACIÓN: si no hay paciente seleccionado mostramos alerta
        if (!patient_id) {
            alert("Selecciona un paciente.");
            return;
        }
        if (!date || !time) {
            alert("Por favor completa todos los campos obligatorios (fecha/hora).");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/meetings`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ patient_id, date, time, topic })
            });
            if (!res.ok) {
                const t = await res.text();
                throw new Error(t);
            }
            const data = await res.json();
            alert(data.message || "Reunión creada");
            modal.style.display = "none";
            loadMeetings();
        } catch (err) {
            console.error("Error creando reunión:", err);
            alert("Error al crear reunión: " + err.message);
        }
    });

    // inicial
    loadMeetings();
});
