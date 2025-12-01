// room_psico.js
(async function () {

const SIGNAL_HOST = "ws://127.0.0.1:8000";
const PREDICT_HOST = "ws://127.0.0.1:8000";
const API_HOST = "http://127.0.0.1:8000";

const sessionId = localStorage.getItem("real_session_id");
const token = localStorage.getItem("token");
let tracksAdded = false;

if (!sessionId || !token) {
    alert("❌ No hay sesión iniciada");
    location.href = "../html/psicoReuniones.html";
    return;
}

fetch(`${API_HOST}/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
})
.then(res => res.json())
.then(user => {
    r_profesional.value = `${user.first_name} ${user.last_name}`;
    r_licencia.value = user.licencia_profesional || "No registrada";
});

// DOM inputs (asegurarse que existan en el HTML)
const r_motivo = document.getElementById("r_motivo");
const r_antecedentes = document.getElementById("r_antecedentes");
const r_evolucion = document.getElementById("r_evolucion");
const r_estado = document.getElementById("r_estado");
const r_afecto = document.getElementById("r_afecto");
const r_conducta = document.getElementById("r_conducta");
const r_insight = document.getElementById("r_insight");
const r_tecnicas = document.getElementById("r_tecnicas");
const r_analisis = document.getElementById("r_analisis");
const r_pronostico = document.getElementById("r_pronostico");
const r_recomendaciones = document.getElementById("r_recomendaciones");
const r_notas_adicionales = document.getElementById("r_notas_adicionales");
const r_profesional = document.getElementById("r_profesional");
const r_licencia = document.getElementById("r_licencia");
const r_riesgo_suicida = document.getElementById("r_riesgo_suicida");
const r_riesgo_autolesion = document.getElementById("r_riesgo_autolesion");
const r_riesgo_otros = document.getElementById("r_riesgo_otros");
const r_objetivos = document.getElementById("r_objetivos");
const r_tareas = document.getElementById("r_tareas");
const r_ajustes = document.getElementById("r_ajustes");
const r_temas = document.getElementById("r_temas");
const r_actividades = document.getElementById("r_actividades");
const r_proxima_sesion = document.getElementById("r_proxima_sesion");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const btnCam = document.getElementById("btnCam");
const btnMic = document.getElementById("btnMic");
const btnHangup = document.getElementById("btnHangup");
const btnGuardar = document.getElementById("btnGuardarReporte");
const btnCancelar = document.getElementById("btnCancelarReporte");
const emotionCountsEl = document.getElementById("emotionCounts");

let pc = null;
let signalSocket = null;
let predictSocket = null;
let localStream = null;
let micEnabled = true;
let sendInterval = null;

const emotionStats = {};
let chart = null;

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const emotionColors = {
    happy: "#3ECF8E", sad: "#5C7AEA", angry: "#FF6B6B",
    disgust: "#C3E88D", fear: "#9E6EF3", neutral: "#A1AAB3", surprise: "#FFD54F"
};

function createChart() {
    const ctx = document.getElementById("emotionChart").getContext("2d");
    chart = new Chart(ctx, {
        type: "bar",
        data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}

function refreshChart() {
    const labels = Object.keys(emotionStats);
    const data = Object.values(emotionStats);
    const colors = labels.map(e => emotionColors[e] || "#aaa");

    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].backgroundColor = colors;
    chart.update();

    emotionCountsEl.innerHTML = labels.map(e => `<b>${e}</b>: ${emotionStats[e]}`).join(" · ");
}

function openSignalSocket() {
    const url = `${SIGNAL_HOST}/ws/signal/${sessionId}?token=${encodeURIComponent(token)}`;
    signalSocket = new WebSocket(url);

    signalSocket.onopen = () => console.log("Signal open (psico)");
    signalSocket.onmessage = async (e) => {
        const msg = JSON.parse(e.data);
        if (!pc) await createPeerConnection();

        if (msg.type === "offer") {
            await pc.setRemoteDescription(msg);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(pc.localDescription);
            return;
        }

        if (msg.type === "answer") await pc.setRemoteDescription(msg);
        if (msg.type === "candidate" && msg.candidate) await pc.addIceCandidate(msg.candidate);
    };
}

function sendSignal(obj) {
    try { signalSocket.send(JSON.stringify(obj)); } catch (e) {}
}

async function createPeerConnection() {
    if (pc) return;
    pc = new RTCPeerConnection(ICE);

    pc.ontrack = ev => remoteVideo.srcObject = ev.streams[0];

    pc.onicecandidate = ev => {
        if (ev.candidate) sendSignal({ type: "candidate", candidate: ev.candidate });
    };

    pc.onnegotiationneeded = async () => {
        try {
            if (!localStream) return;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal(pc.localDescription);
        } catch (e) { console.warn("negotiationneeded error", e); }
    };

    // si ya hay localStream agregar tracks (solo una vez)
    if (localStream && !tracksAdded) {
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        tracksAdded = true;
    }
}

async function toggleCam() {
    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        await createPeerConnection();

        if (!tracksAdded) {
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            tracksAdded = true;
        }

        // forzamos oferta para que el patient reciba tu video inmediatamente
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal(pc.localDescription);
        } catch (e) { console.warn("offer after addTrack failed", e); }

        openPredictSocket();
        startSendingFrames();
        btnCam.classList.add("on");
        return;
    }

    localStream.getTracks().forEach(t => t.stop());
    localVideo.srcObject = null;
    localStream = null;
    clearInterval(sendInterval);
    tracksAdded = false;
    btnCam.classList.remove("on");
}

function toggleMic() {
    if (!localStream) return;
    micEnabled = !micEnabled;
    localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
    btnMic.innerHTML = micEnabled ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
}

function openPredictSocket() {
    const url = `${PREDICT_HOST}/ws/predict/${sessionId}?token=${encodeURIComponent(token)}`;
    predictSocket = new WebSocket(url);

    predictSocket.onmessage = ev => {
        try {
            const data = JSON.parse(ev.data);
            if (data.type === "prediction") {
                const e = (data.emotion || "neutral").toLowerCase();
                emotionStats[e] = (emotionStats[e] || 0) + 1;
                refreshChart();
            }
        } catch (e) {}
    };
}

function startSendingFrames() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    sendInterval = setInterval(() => {
        if (!predictSocket || predictSocket.readyState !== 1) return;
        if (!remoteVideo || !remoteVideo.videoWidth) return;

        canvas.width = remoteVideo.videoWidth;
        canvas.height = remoteVideo.videoHeight;
        ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
        const frame = canvas.toDataURL("image/jpeg", 0.7);

        try { predictSocket.send(JSON.stringify({ type: "frame", data: frame })); } catch (e) {}
    }, 1200);
}

/* ------------------
    REPORTE
   ------------------ */
btnHangup.onclick = () => document.getElementById("reportModal").style.display = "flex";
btnCancelar.onclick = () => document.getElementById("reportModal").style.display = "none";

btnGuardar.onclick = async () => {
    // validar patient_id
    const patient_id = Number(localStorage.getItem("patient_id"));
    if (!patient_id) {
        alert("❌ patient_id no definido en localStorage.");
        return;
    }

    const payload = {
        session_id: Number(sessionId),
        patient_id: patient_id,

        motivo_consulta: r_motivo.value,
        antecedentes: r_antecedentes.value,
        evolucion: r_evolucion.value,

        estado_animo: r_estado.value,
        afecto: r_afecto.value,
        conducta: r_conducta.value,
        insight: r_insight.value,
        pruebas_aplicadas: r_pruebas.value,

        temas_tratados: r_temas.value,
        tecnicas_aplicadas: r_tecnicas.value,
        actividades: r_actividades.value,

        analisis_clinico: r_analisis.value,
        riesgo_suicida: r_riesgo_suicida.checked,
        riesgo_autolesion: r_riesgo_autolesion.checked,
        riesgo_otros: r_riesgo_otros.checked,

        objetivos: r_objetivos.value,
        tareas: r_tareas.value,
        ajustes_tratamiento: r_ajustes.value,

        pronostico: r_pronostico.value,
        proxima_sesion: r_proxima_sesion.value || null,
        recomendaciones_previas: r_recomendaciones.value,
        notas_adicionales: r_notas_adicionales.value,

        nombre_profesional: r_profesional.value,
        licencia_profesional: r_licencia.value,

        emociones_detectadas: JSON.stringify(emotionStats)
    };

    try {
        const res = await fetch(`${API_HOST}/psychologist/sessions/${sessionId}/report`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("✅ Reporte guardado correctamente");
            location.href = "../html/psicoReuniones.html";
            return;
        }

        // leer body de error para depuración
        const text = await res.text();
        console.error("Error saving report:", res.status, text);
        alert("❌ Error al guardar: " + (text || res.status));
    } catch (err) {
        console.error("Fetch error:", err);
        alert("❌ Error de red al guardar reporte: " + err.message);
    }
};

// INIT
createChart();
openSignalSocket();

btnCam.onclick = toggleCam;
btnMic.onclick = toggleMic;
})();
