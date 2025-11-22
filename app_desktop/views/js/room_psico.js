// room_psico.js (Perfect Negotiation - psicólogo, elegante y completo)
(() => {
    const SIGNAL_HOST = "ws://127.0.0.1:8000";
    const PREDICT_HOST = "ws://127.0.0.1:8000";
    const API_HOST = "http://127.0.0.1:8000";

    const sessionId = localStorage.getItem("real_session_id");
    const token = localStorage.getItem("token");

    if (!sessionId || !token) {
        alert("❌ No hay sesión iniciada.");
        window.location.href = "../html/psicoReuniones.html";
        return;
    }

    document.getElementById("sessionInfo").textContent = `Sesión #${sessionId}`;

    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const btnCam = document.getElementById("btnCam");
    const btnMic = document.getElementById("btnMic");
    const btnHangup = document.getElementById("btnHangup");
    const emotionCountsEl = document.getElementById("emotionCounts");
    const alertOverlay = document.getElementById("alertOverlay");
    const notesEl = document.getElementById("notes");

    let pc = null;
    let signalSocket = null;
    let predictSocket = null;
    let localStream = null;
    let micEnabled = true;
    let tracksAdded = false;

    let makingOffer = false;
    let ignoreOffer = false;
    const polite = true;

    const emotionStats = {};
    const recentPred = [];
    let lastAlertEmotion = null;

    const PERSIST_SECONDS = 8;
    const PERSIST_COUNT = 4;

    const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    // 🎨 COLORES DEL GRÁFICO (elegantes)
    const emotionColors = {
        happy: "#3ECF8E",
        sad: "#5C7AEA",
        angry: "#FF6B6B",
        disgust: "#C3E88D",
        fear: "#9E6EF3",
        neutral: "#A1AAB3",
        surprise: "#FFD54F"
    };

    let chart = null;
    const chartLabels = [];
    const chartData = [];
    const chartColors = [];

    function createChart() {
        const ctx = document.getElementById("emotionChart").getContext("2d");

        chart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: chartLabels,
                datasets: [{
                    label: "Conteo",
                    data: chartData,
                    backgroundColor: chartColors,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                animation: { duration: 350 },
                scales: {
                    y: { beginAtZero: true },
                    x: { ticks: { color: "#fff" } }
                },
                plugins: {
                    legend: { labels: { color: "#eee" } }
                }
            }
        });
    }

    function refreshChartFromStats() {
        const entries = Object.entries(emotionStats).sort((a, b) => b[1] - a[1]);

        chartLabels.length = 0;
        chartData.length = 0;
        chartColors.length = 0;

        for (const [emotion, count] of entries) {
            chartLabels.push(emotion);
            chartData.push(count);
            chartColors.push(emotionColors[emotion] || "#aaa");
        }

        if (chart) chart.update();
    }

    // 🔵 WebSocket estable con reconexión
    function createWebSocket(url, name, onOpen, onMessage, onClose, onError) {
        let ws = null;
        let attempts = 0;

        function connect() {
            attempts++;
            try {
                ws = new WebSocket(url);
            } catch (e) {
                scheduleReconnect();
                return;
            }

            ws.onopen = () => {
                attempts = 0;
                if (onOpen) onOpen();
            };
            ws.onmessage = (e) => onMessage?.(e);
            ws.onclose = () => { onClose?.(); scheduleReconnect(); };
            ws.onerror = (e) => onError?.(e);
        }

        function scheduleReconnect() {
            const delay = Math.min(15000, attempts * 1500);
            setTimeout(connect, delay);
        }

        connect();

        return {
            get raw() { return ws; },
            close() { ws?.close(); }
        };
    }

    function openSignalSocket() {
        const url = `${SIGNAL_HOST}/ws/signal/${sessionId}?token=${encodeURIComponent(token)}`;

        signalSocket = createWebSocket(
            url,
            "Signal",
            () => console.log("Signal abierto"),
            async (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    await handleSignalMessage(msg);
                } catch (e) {}
            }
        );
    }

    // 📡 Manejo de signaling (Perfect Negotiation)
    async function handleSignalMessage(msg) {
        if (!pc) await createPeerConnection();

        if (msg.type === "offer") {
            const collision = makingOffer || pc.signalingState !== "stable";
            ignoreOffer = !polite && collision;

            if (ignoreOffer) return;

            try {
                await pc.setRemoteDescription(msg);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal(pc.localDescription);
            } catch (err) { }
        }

        if (msg.type === "answer") {
            await pc.setRemoteDescription(msg);
        }

        if (msg.type === "candidate" && msg.candidate) {
            try { await pc.addIceCandidate(msg.candidate); }
            catch { }
        }
    }

    function sendSignal(msg) {
        signalSocket?.raw?.send(JSON.stringify(msg));
    }

    // 🔵 WebRTC
    async function createPeerConnection() {
        if (pc) return;

        pc = new RTCPeerConnection(ICE);

        pc.ontrack = (ev) => {
            remoteVideo.srcObject = ev.streams[0];
        };

        pc.onicecandidate = (ev) => {
            if (ev.candidate) sendSignal({ type: "candidate", candidate: ev.candidate });
        };

        pc.onnegotiationneeded = async () => {
            try {
                makingOffer = true;
                if (localStream) {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    sendSignal(pc.localDescription);
                }
            } finally {
                makingOffer = false;
            }
        };

        if (localStream && !tracksAdded) {
            localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
            tracksAdded = true;
        }
    }

    // 🎥 Cámara
    async function toggleCam() {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;

            await createPeerConnection();

            localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
            tracksAdded = true;

            openPredictSocket();
            btnCam.classList.add("on");
        } else {
            localStream.getTracks().forEach(t => t.stop());
            localVideo.srcObject = null;
            localStream = null;
            btnCam.classList.remove("on");
        }
    }

    // 🎤 Micrófono
    function toggleMic() {
        if (!localStream) return;

        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);

        btnMic.innerHTML = micEnabled
            ? '<i class="fa-solid fa-microphone"></i>'
            : '<i class="fa-solid fa-microphone-slash"></i>';
    }

    // 🔮 SOCKET DE PREDICCIÓN
    function openPredictSocket() {
        const url = `${PREDICT_HOST}/ws/predict/${sessionId}?token=${encodeURIComponent(token)}`;

        predictSocket = createWebSocket(
            url,
            "Predict",
            () => {},
            (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    if (data.type === "prediction") handlePrediction(data);
                } catch {}
            }
        );
    }

    function handlePrediction(pred) {
        const now = Date.now();
        emotionStats[pred.emotion] = (emotionStats[pred.emotion] || 0) + 1;

        recentPred.push({ emotion: pred.emotion, t: now });

        const cutoff = now - PERSIST_SECONDS * 1000;
        while (recentPred.length && recentPred[0].t < cutoff) recentPred.shift();

        const same = recentPred.filter(p => p.emotion === pred.emotion).length;

        if (same >= PERSIST_COUNT && lastAlertEmotion !== pred.emotion) {
            showAlert(pred.emotion);
            lastAlertEmotion = pred.emotion;
            recentPred.length = 0;
        }

        updateEmotionUI();
        refreshChartFromStats();
    }

    function showAlert(e) {
        alertOverlay.style.display = "flex";
        alertOverlay.querySelector(".alert-box").textContent = `⚠️ Emoción persistente: ${e}`;
        setTimeout(() => alertOverlay.style.display = "none", 6000);
    }

    function updateEmotionUI() {
        emotionCountsEl.innerHTML = Object.entries(emotionStats)
            .map(([e, v]) => `<b>${e}</b>: ${v}`)
            .join(" · ");
    }

    // 📄 Finalizar sesión → Reporte PDF
    async function endSessionAndGenerateReport() {
        const notes = notesEl.value;

        const res = await fetch(`${API_HOST}/reports/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ session_id: Number(sessionId), notes })
        });

        if (!res.ok) {
            alert("Error generando reporte");
            return;
        }

        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), "_blank");

        window.location.href = "../html/psicoReuniones.html";
    }

    // 🎛️ Botones
    btnHangup.addEventListener("click", endSessionAndGenerateReport);
    btnCam.addEventListener("click", toggleCam);
    btnMic.addEventListener("click", toggleMic);

    // Inicializar
    createChart();
    openSignalSocket();
    openPredictSocket();
})();
