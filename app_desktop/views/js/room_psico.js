// app_desktop/views/js/room_psico.js
(() => {
    const SIGNAL_HOST = "ws://127.0.0.1:8000";
    const PREDICT_HOST = "ws://127.0.0.1:8000";
    const API_URL = "http://127.0.0.1:8000";

    const params = new URLSearchParams(window.location.search);
    let sessionId = params.get("session_id");
    const token = params.get("token") || localStorage.getItem("token");

    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const btnCam = document.getElementById("btnCam");
    const btnMic = document.getElementById("btnMic");
    const btnHangup = document.getElementById("btnHangup");
    const notes = document.getElementById("notes");
    const emotionCountsEl = document.getElementById("emotionCounts");
    const alertOverlay = document.getElementById("alertOverlay");

    let pc, signalSocket, predictSocket;
    let localStream = null;
    let micEnabled = true;
    const emotionStats = {};      // {emotion: count}
    let chart;
    // para detectar persistencia de emoción
    const recentPredictions = []; // {emotion, t}
    const PERSIST_SECONDS = 8;    // si la misma emoción aparece repetidamente en este intervalo
    const PERSIST_COUNT = 4;      // y al menos N veces -> alarma
    let lastAlertEmotion = null;
    const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    // si no hay sessionId: creamos una sesión en backend y recargamos con ?session_id=...
    async function ensureSession() {
        if (sessionId) return sessionId;
        try {
            const res = await fetch(`${API_URL}/sessions`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
            });
            if (!res.ok) throw new Error("No se pudo crear la sesión");
            const data = await res.json();
            sessionId = data.session_id;
            // recargar con session_id en URL para que WS de señal y predict use mismo id
            const newUrl = `${location.pathname}?session_id=${sessionId}&token=${encodeURIComponent(token)}`;
            location.replace(newUrl);
            return sessionId;
        } catch (err) {
            console.error("Error creando sesión:", err);
            alert("Error iniciando sesión en el servidor. Revisa backend.");
            throw err;
        }
    }

    // Señalización (WebRTC relay)
    function sendSignal(data) {
        if (signalSocket?.readyState === WebSocket.OPEN) signalSocket.send(JSON.stringify(data));
    }

    function openSignalSocket() {
        signalSocket = new WebSocket(`${SIGNAL_HOST}/ws/signal/${sessionId}?token=${token}`);
        signalSocket.onmessage = async (ev) => {
            const data = JSON.parse(ev.data);
            if (!pc) await startPeer(false);
            if (data.type === "offer") {
                await pc.setRemoteDescription(data);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal(answer);
            } else if (data.type === "answer") {
                await pc.setRemoteDescription(data);
            } else if (data.type === "candidate") {
                try { await pc.addIceCandidate(data.candidate); } catch(e) { console.warn(e); }
            }
        };
    }

    async function startPeer(isCaller) {
        pc = new RTCPeerConnection(ICE);
        pc.ontrack = (ev) => (remoteVideo.srcObject = ev.streams[0]);
        pc.onicecandidate = (e) => e.candidate && sendSignal({ type: "candidate", candidate: e.candidate });
        if (localStream) localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
        if (isCaller) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal(offer);
        }
    }

    // El psicólogo puede activar/desactivar su cámara local (no afecta detección IA)
    async function toggleCam() {
        if (!localStream) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localVideo.srcObject = localStream;
                // si ya hay PC, añadir tracks
                if (pc) {
                    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                } else {
                    // abrimos señal si no existe
                    openSignalSocket();
                    await startPeer(true);
                }
                btnCam.classList.add("on");
            } catch (err) {
                console.error("No se pudo activar la cámara:", err);
                alert("No se pudo activar la cámara. Revisa permisos.");
            }
        } else {
            // detener y liberar
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
            localVideo.srcObject = null;
            btnCam.classList.remove("on");
            // idealmente cerrar y volver a crear pc en nueva apertura; aquí dejamos pc.
        }
    }

    function toggleMic() {
        if (!localStream) return;
        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
        btnMic.innerHTML = micEnabled ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
    }

    // Abrir socket de predicción: el servidor recibe frames desde paciente y reemite predicciones a todos clientes suscritos a la sesión
    function openPredictSocket() {
        predictSocket = new WebSocket(`${PREDICT_HOST}/ws/predict/${sessionId}`);
        predictSocket.onmessage = (ev) => {
            const data = JSON.parse(ev.data);
            if (data.type === "prediction") handlePrediction(data);
        };
    }

    // manejar predicción: actualizar conteos + gráfico + detect persistencia
    function handlePrediction(pred) {
        const t = Date.now();
        // actualizar contador
        emotionStats[pred.emotion] = (emotionStats[pred.emotion] || 0) + 1;
        // actualizar recents
        recentPredictions.push({ emotion: pred.emotion, t });
        // eliminar viejos
        const cutoff = t - PERSIST_SECONDS * 1000;
        while (recentPredictions.length && recentPredictions[0].t < cutoff) recentPredictions.shift();
        // comprobar persistencia: contar cuántas predicciones con la misma emoción en el buffer
        const sameCount = recentPredictions.filter(r => r.emotion === pred.emotion).length;
        if (sameCount >= PERSIST_COUNT && lastAlertEmotion !== pred.emotion) {
            // mostrar alerta visual efímera
            showAlert(pred.emotion);
            lastAlertEmotion = pred.emotion;
            // limpiar buffer para no alertar continuamente
            recentPredictions.length = 0;
        }
        // actualizar UI (solo gráfico y summary)
        updateChartAndCounts();
    }

    function showAlert(emotion) {
        alertOverlay.style.display = "flex";
        alertOverlay.querySelector(".alert-box").textContent = `⚠️ Emoción persistente detectada: ${emotion}`;
        // desaparecer al cabo de 6s
        setTimeout(() => { alertOverlay.style.display = "none"; }, 6000);
        // reproducir un beep corto (si se permite)
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = "sine"; o.frequency.value = 440;
            o.connect(g); g.connect(ctx.destination);
            o.start(); g.gain.setValueAtTime(0.0001, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
            o.stop(ctx.currentTime + 0.5);
        } catch (e) { /* silencioso si no está permitido */ }
    }

    // actualizar Chart.js y lista breve de conteos (sin logs enormes)
    function updateChartAndCounts() {
        const labels = Object.keys(emotionStats);
        const data = Object.values(emotionStats);
        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        chart.update();

        // mostrar conteo resumido
        emotionCountsEl.innerHTML = labels.map(l => `<div style="display:inline-block;margin-right:8px"><strong>${l}</strong>: ${emotionStats[l]}</div>`).join("");
    }

    // Guardar reporte en backend (automático al colgar / antesunload)
    async function saveReportToDB() {
        // preparar payload
        const emotions = Object.entries(emotionStats).map(([k, v]) => `${k}:${v}`).join(",");
        const summary = notes.value.trim() || "Sesión finalizada.";
        if (!sessionId) {
            console.warn("No hay sessionId para guardar reporte.");
            return;
        }
        try {
            const res = await fetch(`${API_URL}/psychologist/sessions/${sessionId}/report`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ emotions, summary })
            });
            if (!res.ok) {
                const txt = await res.text();
                console.error("Error guardando reporte:", txt);
                return false;
            }
            console.log("✅ Reporte guardado.");
            return true;
        } catch (err) {
            console.error("Error guardando reporte:", err);
            return false;
        }
    }

    // actions
    btnCam.addEventListener("click", toggleCam);
    btnMic.addEventListener("click", toggleMic);
    btnHangup.addEventListener("click", async () => {
        // para evitar llamadas duplicadas
        btnHangup.disabled = true;
        // detener local stream si existe
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
            localVideo.srcObject = null;
        }
        // cerrar websockets (señal + predict)
        try { predictSocket?.close(); } catch(e) {}
        try { signalSocket?.close(); } catch(e) {}
        // guardar reporte automáticamente
        await saveReportToDB();
        // volver al panel
        location.href = "../html/psicoReuniones.html";
    });

    // inicializar Chart
    chart = new Chart(document.getElementById("emotionChart"), {
        type: "doughnut",
        data: { labels: [], datasets: [{ data: [], backgroundColor: ["#f44336","#2196f3","#ffeb3b","#4caf50","#9c27b0","#ff9800","#00bcd4"] }] },
        options: { plugins: { legend: { position: "bottom" } } }
    });

    // main: asegurar session, abrir sockets de señal y de predicción (solo escucha)
    (async function main() {
        try {
            await ensureSession();
            openSignalSocket();
            openPredictSocket();
            // NO enviamos frames desde psicólogo — paciente envía los frames
        } catch (err) {
            console.error("No se pudo iniciar sala de psicólogo:", err);
        }
    })();

    // guardar reporte también en unload por si cierran la ventana
    window.addEventListener("beforeunload", (e) => {
        // Nota: fetch síncrono no fiable en algunos browsers; usamos navigator.sendBeacon si es posible
        const emotions = Object.entries(emotionStats).map(([k, v]) => `${k}:${v}`).join(",");
        const summary = notes.value.trim() || "Sesión finalizada (cierre inesperado).";
        if (!sessionId) return;
        const payload = JSON.stringify({ emotions, summary });
        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon(`${API_URL}/psychologist/sessions/${sessionId}/report`, payload);
            } else {
                // intento rápido (no se garantiza)
                fetch(`${API_URL}/psychologist/sessions/${sessionId}/report`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                    body: payload,
                    keepalive: true
                });
            }
        } catch(e) {}
    });
})();
