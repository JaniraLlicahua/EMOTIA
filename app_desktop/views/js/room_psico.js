// room_psico.js (Perfect Negotiation - psicólogo, polite)
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

    // Perfect negotiation flags
    let makingOffer = false;
    let ignoreOffer = false;
    const polite = true; // psicólogo = polite

    const emotionStats = {};
    const recentPred = [];
    const PERSIST_SECONDS = 8;
    const PERSIST_COUNT = 4;
    let lastAlertEmotion = null;

    const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    // Chart.js setup
    let chart = null;
    const chartLabels = [];
    const chartData = [];

    function createChart() {
        const ctx = document.getElementById('emotionChart').getContext('2d');
        chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Conteo',
                    data: chartData,
                }]
            },
            options: {
                animation: { duration: 300 },
                responsive: true,
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    function refreshChartFromStats() {
        const entries = Object.entries(emotionStats).sort((a,b)=>b[1]-a[1]);
        chartLabels.length = 0;
        chartData.length = 0;
        for (const [k,v] of entries) {
            chartLabels.push(k);
            chartData.push(v);
        }
        if (chart) chart.update();
    }

    // ---------- SIGNAL ----------
    function createWebSocket(url, name, onOpen, onMessage, onClose, onError) {
        let ws = null;
        let attempts = 0;
        function connect() {
            attempts++;
            try {
                ws = new WebSocket(url);
            } catch (err) {
                console.warn(`${name} WS create error`, err);
                scheduleReconnect();
                return;
            }
            ws.onopen = (ev) => {
                attempts = 0;
                console.log(`${name} WS open`);
                if (onOpen) onOpen(ev);
            };
            ws.onmessage = (ev) => { if (onMessage) onMessage(ev); };
            ws.onclose = (ev) => {
                console.log(`${name} WS closed`, ev.code, ev.reason);
                if (onClose) onClose(ev);
                scheduleReconnect();
            };
            ws.onerror = (ev) => {
                console.warn(`${name} WS error`, ev);
                if (onError) onError(ev);
            };
        }
        function scheduleReconnect() {
            const backoff = Math.min(16000, 1000 * 2 ** attempts);
            console.log(`${name} WS reconectando en ${backoff}ms (intento ${attempts})`);
            setTimeout(connect, backoff);
        }
        connect();
        return {
            get raw() { return ws; },
            close() { try { ws?.close(); } catch(_) {} }
        };
    }

    function openSignalSocket() {
        if (signalSocket && signalSocket.raw && signalSocket.raw.readyState === WebSocket.OPEN) return;

        const url = `${SIGNAL_HOST}/ws/signal/${sessionId}?token=${encodeURIComponent(token)}`;
        signalSocket = createWebSocket(url, "Signal",
            () => console.log("Signal conectado (psych)"),
            async (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    await handleSignalMessage(data);
                } catch (err) {
                    console.error("Error en signal (psych):", err);
                }
            },
            () => console.log("Signal socket (psych) cerrado"),
            (e) => console.warn("Signal socket error (psych):", e)
        );
    }

    function sendSignal(msg) {
        try {
            const raw = signalSocket?.raw;
            if (raw && raw.readyState === WebSocket.OPEN) raw.send(JSON.stringify(msg));
        } catch (err) { console.warn("sendSignal err", err); }
    }

    async function handleSignalMessage(msg) {
        if (!pc) await createPeerConnection();

        if (msg.type === "offer") {
            const offerCollision = makingOffer || pc.signalingState !== "stable";
            ignoreOffer = !polite && offerCollision;
            if (ignoreOffer) {
                console.warn("Offer collision - impolite and collision -> ignoring incoming offer (psych)");
                return;
            }
            try {
                await pc.setRemoteDescription(msg);
                // psych: when receive offer, create answer
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal(pc.localDescription);
            } catch (err) {
                console.error("Error applying remote offer (psych):", err);
                try {
                    await pc.setLocalDescription({ type: "rollback" });
                    await pc.setRemoteDescription(msg);
                } catch (e) {
                    console.error("Rollback failed (psych):", e);
                }
            }
        } else if (msg.type === "answer") {
            try {
                await pc.setRemoteDescription(msg);
            } catch (err) {
                console.error("Error applying answer (psych):", err);
            }
        } else if (msg.type === "candidate") {
            try {
                if (msg.candidate) await pc.addIceCandidate(msg.candidate);
            } catch (err) {
                console.warn("addIceCandidate (psych) failed:", err);
            }
        } else {
            console.log("Signal (psych) recibido:", msg.type);
        }
    }

    // ---------- PEER ----------
    async function createPeerConnection() {
        if (pc) return;
        pc = new RTCPeerConnection(ICE);

        pc.ontrack = (ev) => {
            if (ev.streams && ev.streams[0]) {
                remoteVideo.srcObject = ev.streams[0];
            } else {
                const st = new MediaStream();
                st.addTrack(ev.track);
                remoteVideo.srcObject = st;
            }
        };

        pc.onicecandidate = (e) => {
            if (e.candidate) sendSignal({ type: "candidate", candidate: e.candidate });
        };

        pc.onconnectionstatechange = () => {
            console.log("PC state (psych):", pc.connectionState);
        };

        pc.onnegotiationneeded = async () => {
            try {
                makingOffer = true;
                // only create offer if we actually have local tracks to send
                if (localStream) {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    sendSignal(pc.localDescription);
                }
            } catch (err) {
                console.warn("negotiationneeded error (psych):", err);
            } finally {
                makingOffer = false;
            }
        };

        if (localStream && !tracksAdded) {
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            tracksAdded = true;
        }
    }

    // ---------- CAM / MICRO ----------
    async function ensureLocalStream() {
        if (localStream) return localStream;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            tracksAdded = false;
            return localStream;
        } catch (err) {
            console.error("getUserMedia psych:", err);
            throw err;
        }
    }

    async function toggleCam() {
        if (!localStream) {
            try {
                await ensureLocalStream();
                await createPeerConnection();

                if (!tracksAdded) {
                    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                    tracksAdded = true;
                }
                openSignalSocket();
                // force negotiation if we added tracks
                try {
                    makingOffer = true;
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    sendSignal(pc.localDescription);
                } catch (err) {
                    console.warn("Force offer error (psych):", err);
                } finally {
                    makingOffer = false;
                }

                // psicólogo también escucha predicciones
                openPredictSocket();

                btnCam.classList.add("on");
            } catch (e) {
                alert("No se pudo acceder a la cámara (psych). Revisa permisos.");
            }
        } else {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
            localVideo.srcObject = null;
            btnCam.classList.remove("on");
        }
    }

    function toggleMic() {
        if (!localStream) return;
        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
        btnMic.innerHTML = micEnabled ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
    }

    // ---------- PREDICT socket (psych listens for predictions) ----------
    function openPredictSocket() {
        if (predictSocket && predictSocket.raw && predictSocket.raw.readyState === WebSocket.OPEN) return;
        const url = `${PREDICT_HOST}/ws/predict/${sessionId}?token=${encodeURIComponent(token)}`;
        predictSocket = createWebSocket(url, "Predict",
            () => console.log("Predict WS abierto (psych)"),
            (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    if (data.type === "prediction") handlePrediction(data);
                } catch (err) {
                    console.warn("predict parse error:", err);
                }
            },
            () => console.log("Predict WS cerrado (psych)"),
            (e) => console.warn("Predict WS error (psych)", e)
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

    function showAlert(emotion) {
        alertOverlay.style.display = "flex";
        alertOverlay.querySelector(".alert-box").textContent = `⚠️ Emoción persistente: ${emotion}`;
        setTimeout(() => alertOverlay.style.display = "none", 6000);
    }

    function updateEmotionUI() {
        emotionCountsEl.innerHTML = Object.entries(emotionStats)
            .map(([e, v]) => `<b>${e}</b>: ${v}`)
            .join(" · ");
    }

    // ---------- Finalizar sesión -> generar PDF con emociones + notas ----------
    async function endSessionAndGenerateReport() {
        try {
            const notes = notesEl.value || "";
            const payload = {
                session_id: Number(sessionId),
                notes,
            };
            const res = await fetch(`${API_HOST}/reports/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const txt = await res.text();
                alert("Error generando reporte: " + txt);
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
        } catch (err) {
            console.error("Error generando reporte:", err);
            alert("Error generando reporte.");
        } finally {
            try { signalSocket?.close(); } catch(_) {}
            try { predictSocket?.close(); } catch(_) {}
            window.location.href = "../html/psicoReuniones.html";
        }
    }

    // ---------- UI events ----------
    btnHangup.addEventListener("click", endSessionAndGenerateReport);
    btnCam.addEventListener("click", async () => {
        await toggleCam();
    });
    btnMic.addEventListener("click", toggleMic);

    // iniciar sockets / chart
    createChart();
    openSignalSocket();
    openPredictSocket();
})();
