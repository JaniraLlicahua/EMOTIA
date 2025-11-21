//app_desktop\views\js\pacieCalendario.js
const API_URL = "http://127.0.0.1:8000";

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token");
    const user_id = localStorage.getItem("user_id");
    const calendarGrid = document.getElementById("sessionsContainer");
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
            // opcional: ordenar por fecha/hora por si acaso
            meetings.sort((a,b) => (a.date + " " + a.time).localeCompare(b.date + " " + b.time));
            renderMeetings(meetings);
        } catch (err) {
            console.error("Excepción cargando reuniones:", err);
            calendarGrid.innerHTML = `<div style="padding:16px;color:#b00">Error: ${err.message}</div>`;
        }
    }

    // obtiene info básica del psicólogo por id (devuelve objeto con first_name, last_name, email...)
    async function fetchPsychologistInfo(psychId) {
        try {
            const res = await fetch(`${API_URL}/users/${psychId}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) return null;
            return await res.json();
        } catch (err) {
            console.warn("No se pudo obtener info del psicólogo:", err);
            return null;
        }
    }

    async function renderMeetings(meetings) {
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
                // por cada reunión del día, creamos el bloque con info y botón "Unirse"
                for (const m of list) {
                    const ses = document.createElement("div");
                    ses.className = "session";

                    // obtén nombre psicólogo (cache sencillo)
                    let psychName = `Psicólogo #${m.psychologist_id}`;
                    // intentamos obtener nombre real
                    const psychInfo = await fetchPsychologistInfo(m.psychologist_id);
                    if (psychInfo) {
                        const fn = psychInfo.first_name || psychInfo.username || "";
                        const ln = psychInfo.last_name || "";
                        psychName = (fn || ln) ? `${fn} ${ln}`.trim() : psychName;
                    }

                    ses.innerHTML = `
                        <p class="hour">${formatHourForDisplay(m.time)}</p>
                        <p class="topic">${escapeHtml(m.topic || "(sin tema)")}</p>
                        <span class="psych">${escapeHtml(psychName)}</span>
                    `;

                    // click abre panel de detalles (y muestra botón Unirse)
                    ses.addEventListener("click", () => showDetailsAndJoin(m, ses));
                    div.appendChild(ses);
                }
            }

            calendarGrid.appendChild(div);
        }
    }

    function formatHourForDisplay(h24) {
        // h24 expected "HH:MM"
        const [hh, mm] = h24.split(":").map(s => parseInt(s,10));
        if (isNaN(hh)) return h24;
        const ampm = hh >= 12 ? "PM" : "AM";
        const h = ((hh + 11) % 12) + 1;
        return `${h}:${String(mm).padStart(2,"0")} ${ampm}`;
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (s) => {
            const m = { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" };
            return m[s];
        });
    }

    // Detalles + botón de Unirse (para paciente)
    function showDetailsAndJoin(m, sesEl) {
        // resaltar
        document.querySelectorAll(".session").forEach(s => s.classList.remove("active"));
        sesEl.classList.add("active");

        // construir panel con la info que pediste
        // NOTA: m.date ya viene "YYYY-MM-DD"
        const dateDisplay = new Date(m.date).toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year:"numeric" });

        // obtener nombre psicólogo sin bloquear la UI: intento rápido (si no, mostrar ID)
        // Si en render ya obtuviste psicólogo, no hay problema; aquí mostramos ID si falla.
        const psychLabel = document.querySelector(".psych") ? sesEl.querySelector(".psych")?.textContent : `Psicólogo #${m.psychologist_id}`;

        detailsPanel.innerHTML = `
            <h3>Detalles de la sesión</h3>
            <p><strong>Fecha:</strong> ${dateDisplay}</p>
            <p><strong>Hora:</strong> ${formatHourForDisplay(m.time)}</p>
            <p><strong>Psicólogo:</strong> ${escapeHtml(psychLabel)}</p>
            <p><strong>Tema:</strong> ${escapeHtml(m.topic || "(sin tema)")}</p>
            <p><strong>Duración:</strong> 1 hora</p>
            <div style="margin-top:12px;display:flex;gap:8px">
                <button id="btnJoin" style="padding:8px 12px;border-radius:8px;background:#4caf50;color:#fff;border:0;cursor:pointer">Unirse a la sesión</button>
                <button id="btnClose" style="padding:8px 12px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">Cerrar</button>
            </div>
        `;
        detailsPanel.classList.add("show");

        document.getElementById("btnJoin").addEventListener("click", () => {
            // redirigir a la sala del paciente, enviando session_id (aquí usamos id de reunión)
            if (!m.real_session_id) {
                alert("El psicólogo aún no inició la sesión.");
                return;
            }
            localStorage.setItem("real_session_id", m.real_session_id);
            window.location.href = `../html/room_paciente.html?session_id=${m.real_session_id}&token=${token}`;
        });
        document.getElementById("btnClose").addEventListener("click", () => {
            detailsPanel.classList.remove("show");
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
