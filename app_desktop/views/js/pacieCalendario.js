// app_desktop/views/js/pacieCalendario.js
const API_URL = "http://127.0.0.1:8000";

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token");
    const user_id = localStorage.getItem("user_id");
    const calendarGrid = document.querySelector(".calendar-grid");
    const weekTitle = document.querySelector(".calendar-header h3");
    const detailsPanel = document.getElementById("detailsPanel");

    if (!token || !user_id) {
        alert("Tu sesión ha expirado. Inicia sesión nuevamente.");
        window.location.href = "../html/login.html";
        return;
    }

    // estado de semana (almacena el lunes actual)
    let currentMonday = getMonday(new Date());

    // helpers
    function getMonday(d) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = (day === 0 ? -6 : 1) - day; // si es domingo -> lunes anterior
        date.setDate(date.getDate() + diff);
        date.setHours(0,0,0,0);
        return date;
    }

    function addWeeks(monday, n) {
        const d = new Date(monday);
        d.setDate(d.getDate() + n * 7);
        return d;
    }

    function formatRange(monday) {
        const startStr = monday.toLocaleDateString("es-ES", { day: "2-digit", month: "long" });
        const end = new Date(monday);
        end.setDate(end.getDate() + 6);
        const endStr = end.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
        return `Semana del ${startStr} - ${endStr}`;
    }

    function isoDayRange(monday) {
        const start = new Date(monday);
        start.setHours(0,0,0,0);
        const end = new Date(monday);
        end.setDate(end.getDate() + 6);
        end.setHours(23,59,59,999);
        return { start: start.toISOString(), end: end.toISOString() };
    }

    // navegación
    const navBtns = document.querySelectorAll(".calendar-header .nav-btn");
    if (navBtns && navBtns.length >= 2) {
        navBtns[0].addEventListener("click", () => { currentMonday = addWeeks(currentMonday, -1); loadMeetings(); });
        navBtns[1].addEventListener("click", () => { currentMonday = addWeeks(currentMonday, +1); loadMeetings(); });
    }

    // load meetings for week
    async function loadMeetings(){
        try {
        const { start, end } = isoDayRange(currentMonday);
        weekTitle.textContent = formatRange(currentMonday);

        // pedimos las reuniones en el rango (backend filtra por token -> paciente)
        const res = await fetch(`${API_URL}/meetings?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!res.ok) {
            const txt = await res.text();
            console.error("Error cargando reuniones:", txt);
            calendarGrid.innerHTML = `<div style="padding:16px;color:#b00">Error cargando reuniones</div>`;
            return;
        }

        const meetings = await res.json();
        renderMeetings(meetings);
        } catch (err) {
        console.error("Excepción cargando reuniones:", err);
        calendarGrid.innerHTML = `<div style="padding:16px;color:#b00">Error: ${err.message}</div>`;
        }
    }

    function renderMeetings(meetings) {
        calendarGrid.innerHTML = "";
        const days = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
        // agrupar por fecha YYYY-MM-DD
        const map = {};
        meetings.forEach(m => {
        map[m.date] = map[m.date] || [];
        map[m.date].push(m);
        });

        // construir 7 columnas (lunes..domingo)
        for (let i = 0; i < 7; i++) {
        const dayDate = new Date(currentMonday);
        dayDate.setDate(dayDate.getDate() + i);
        const dayKey = dayDate.toISOString().slice(0,10);

        const div = document.createElement("div");
        div.className = "day";
        div.innerHTML = `<h4>${days[i]}</h4>`;

        const list = map[dayKey] || [];
        if (list.length === 0) {
            div.innerHTML += `<p class="no-session">Sin sesiones</p>`;
        } else {
            list.forEach(m => {
            const ses = document.createElement("div");
            ses.className = "session";
            ses.innerHTML = `
                <p class="hour">${m.time}</p>
                <p class="topic">${m.topic || "(sin tema)"}</p>
                <span class="psych">Psicólogo #${m.psychologist_id}</span>
            `;
            ses.addEventListener("click", () => showDetailsAndJoin(m, ses));
            div.appendChild(ses);
            });
        }

        calendarGrid.appendChild(div);
        }
    }

    function showDetailsAndJoin(m, sesEl) {
        // resaltar
        document.querySelectorAll(".session").forEach(s => s.classList.remove("active"));
        sesEl.classList.add("active");

        // llenar panel de detalles
        detailsPanel.querySelector("h3").textContent = "Detalles de la sesión";
        detailsPanel.innerHTML = `
        <h3>Detalles de la sesión</h3>
        <p><strong>Fecha:</strong> ${new Date(m.date).toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year:"numeric" })}</p>
        <p><strong>Hora:</strong> ${m.time}</p>
        <p><strong>Psicólogo:</strong> #${m.psychologist_id}</p>
        <p><strong>Tema:</strong> ${m.topic || "(sin tema)"}</p>
        <p><strong>Duración:</strong> 1 hora</p>
        <div style="margin-top:12px;display:flex;gap:8px">
            <button id="btnJoin" style="padding:8px 12px;border-radius:8px;background:#4caf50;color:#fff;border:0;cursor:pointer">Unirse a la sesión</button>
            <button id="btnClose" style="padding:8px 12px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">Cerrar</button>
        </div>
        `;

        document.getElementById("btnJoin").addEventListener("click", () => {
        window.location.href = `../html/room_paciente.html?session_id=${m.id}&token=${token}`;
        });
        document.getElementById("btnClose").addEventListener("click", () => {
        detailsPanel.innerHTML = `<h3>Detalles de la sesión</h3><button class="close-btn" onclick="closeDetails()">Cerrar</button>`;
        });
    }

    // función global para compatibilidad (pulsar "Cerrar" del HTML original)
    window.closeDetails = function() {
        detailsPanel.classList.remove("show");
        detailsPanel.innerHTML = `<h3>Detalles de la sesión</h3><button class="close-btn" onclick="closeDetails()">Cerrar</button>`;
    };

    // inicializar
    loadMeetings();
});
