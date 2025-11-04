// app_desktop/views/js/psicoReuniones.js
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

    // nav buttons (asegúrate que existan en el HTML)
    const navBtns = document.querySelectorAll(".calendar-header .nav-btn");
    if (navBtns && navBtns.length >= 2) {
        navBtns[0].addEventListener("click", () => { currentMonday = addWeeks(currentMonday, -1); loadMeetings(); });
        navBtns[1].addEventListener("click", () => { currentMonday = addWeeks(currentMonday, +1); loadMeetings(); });
    }

    // modal
    btnAddMeeting.addEventListener("click", () => modal.style.display = "block");
    btnCancelar.addEventListener("click", () => modal.style.display = "none");

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
        const dt = new Date(m.date);
        // convertimos getDay() al índice Lunes=1 -> daysOfWeek[0]
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
        // resaltar
        document.querySelectorAll(".session").forEach(s => s.classList.remove("active"));
        divEl.classList.add("active");

        detPaciente.textContent = `Paciente #${m.patient_id}`;
        detHora.textContent = m.time;
        detFecha.textContent = new Date(m.date).toLocaleDateString("es-ES", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
        detTema.textContent = m.topic || "(Sin tema)";
        btnIniciar.onclick = () => {
        window.location.href = `room_psico.html?session_id=${m.id}&token=${token}`;
        };
    }

    btnGuardar.addEventListener("click", async () => {
        const patient_id = parseInt(document.getElementById("patientId").value, 10);
        const date = document.getElementById("date").value;
        const time = document.getElementById("time").value;
        const topic = document.getElementById("topic").value || "";

        if (!patient_id || !date || !time) {
        alert("Por favor completa todos los campos obligatorios");
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
