// app_desktop/views/js/room_psico.js
(() => {
    const SIGNAL_HOST = "ws://127.0.0.1:8000";
    const PREDICT_HOST = "ws://127.0.0.1:8000";

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

    let pc = null;
    let signalSocket = null;
    let predictSocket = null;
    let localStream = null;
    let micEnabled = true;
    let tracksAdded = false;

    const emotionStats = {};
    const recentPred = [];
    const PERSIST_SECONDS = 8;
    const PERSIST_COUNT = 4;
    let lastAlertEmotion = null;

    const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    // helper reconexión (copiado, simple)
    function createWebSocket(url, name, onOpen, onMessage, onClose, onError) {
        let ws = null;
        let attempts = 0;
        function connect() {
            attempts++;
            try { ws = new WebSocket(url); } catch (err) { scheduleReconnect(); return; }
            ws.onopen = (ev) => { attempts = 0; console.log(`${name} WS open`); if (onOpen) onOpen(ev); };
            ws.onmessage = (ev) => { if (onMessage) onMessage(ev); };
            ws.onclose = (ev) => { console.log(`${name} WS closed`); if (onClose) onClose(ev); scheduleReconnect(); };
            ws.onerror = (ev) => { console.warn(`${name} WS error`); if (onError) onError(ev); };
        }
        function scheduleReconnect() {
            const backoff = Math.min(16000, 1000 * 2 ** attempts);
            setTimeout(connect, backoff);
        }
        connect();
        return {
            get raw() { return ws; },
            close() { try { ws?.close(); } catch(_) {} }
        };
    }

    // ---------- SIGNAL ----------
    function openSignalSocket() {
        const url = `${SIGNAL_HOST}/ws/signal/${sessionId}?token=${encodeURIComponent(token)}`;
        signalSocket = createWebSocket(url, "SignalPsych",
            () => console.log("Signal socket (psych) open"),
            async (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    if (!pc) await createPeerConnection();

                    if (data.type === "offer") {
                        await pc.setRemoteDescription(data);
                        // asegurarse de añadir tracks locales si existen
                        if (localStream && !tracksAdded) {
                            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                            tracksAdded = true;
                        }
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        // enviar answer
                        const raw = signalSocket?.raw;
                        if (raw && raw.readyState === WebSocket.OPEN) raw.send(JSON.stringify(pc.localDescription || answer));
                        console.log("Answer enviada desde psych.");
                    } else if (data.type === "candidate") {
                        await pc.addIceCandidate(data.candidate);
                    } else {
                        console.log("Signal (psych) mensaje desconocido:", data.type);
                    }
                } catch (err) {
                    console.error("Error manejando señal (psych):", err);
                }
            },
            () => console.log("Signal psych cerrado"),
            (e) => console.warn("Signal psych error", e)
        );
    }

    function sendSignal(msg) {
        try {
            const raw = signalSocket?.raw;
            if (raw && raw.readyState === WebSocket.OPEN) raw.send(JSON.stringify(msg));
        } catch (err) { console.warn("sendSignal psych err", err); }
    }

    // ---------- PEER ----------
    async function createPeerConnection() {
        if (pc) return;
        pc = new RTCPeerConnection(ICE);

        pc.ontrack = (ev) => {
            if (ev.streams && ev.streams[0]) remoteVideo.srcObject = ev.streams[0];
            else {
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

        if (localStream && !tracksAdded) {
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            tracksAdded = true;
        }
    }

    // ---------- cam/mic ----------
    async function toggleCam() {
        if (!localStream) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                // local mini en psicólogo (no draggable aquí, es grande by default)
                localVideo.srcObject = localStream;

                // si ya hay pc creado, añadir tracks
                if (pc && !tracksAdded) {
                    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                    tracksAdded = true;
                }

                openPredictSocket(); // psych se conecta al ws predict para recibir preds
                btnCam.classList.add("on");
            } catch (err) {
                console.error("getUserMedia psych:", err);
                alert("No se pudo acceder a la cámara (psych). Revisa permisos.");
            }
        } else {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
            localVideo.srcObject = null;
            btnCam.classList.remove("on");
            tracksAdded = false;
        }
    }

    function toggleMic() {
        if (!localStream) return;
        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
        btnMic.innerHTML = micEnabled ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
    }

    // ---------- PREDICT socket (psych solo recibe predictions) ----------
    function openPredictSocket() {
        if (predictSocket && predictSocket.raw && predictSocket.raw.readyState === WebSocket.OPEN) return;
        const url = `${PREDICT_HOST}/ws/predict/${sessionId}?token=${encodeURIComponent(token)}`;
        predictSocket = createWebSocket(url, "PredictPsych",
            () => console.log("Predict WS (psych) abierto"),
            (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    if (data.type === "prediction") handlePrediction(data);
                } catch (err) {
                    console.warn("Predict psych parse err", err);
                }
            },
            () => console.log("Predict WS (psych) cerrado"),
            (e) => console.warn("Predict WS (psych) error", e)
        );
    }

    function handlePrediction(pred) {
        const now = Date.now();
        emotionStats[pred.emotion] = (emotionStats[pred.emotion] || 0) + 1;

        recentPred.push({ emotion: pred.emotion, t: now });
        const limit = now - PERSIST_SECONDS * 1000;
        while (recentPred.length && recentPred[0].t < limit) recentPred.shift();

        const count = recentPred.filter(p => p.emotion === pred.emotion).length;
        if (count >= PERSIST_COUNT && lastAlertEmotion !== pred.emotion) {
            showAlert(pred.emotion);
            lastAlertEmotion = pred.emotion;
            recentPred.length = 0;
        }

        updateEmotionUI();
        // (Opcional) actualizar grafico Chart.js aquí
    }

    function showAlert(emotion) {
        alertOverlay.style.display = "flex";
        alertOverlay.querySelector(".alert-box").textContent = `⚠️ Emoción: ${emotion}`;
        setTimeout(() => alertOverlay.style.display = "none", 6000);
    }

    function updateEmotionUI() {
        emotionCountsEl.innerHTML =
            Object.entries(emotionStats).map(([e, v]) => `<b>${e}</b>: ${v}`).join(" · ");
    }

    // ---------- eventos UI ----------
    btnHangup.addEventListener("click", () => {
        try { signalSocket?.close(); } catch(_) {}
        try { predictSocket?.close(); } catch(_) {}
        try { pc?.close(); } catch(_) {}
        window.location.href = "../html/psicoReuniones.html";
    });

    btnCam.addEventListener("click", toggleCam);
    btnMic.addEventListener("click", toggleMic);

    // iniciar signal al cargar (para que psicólogo reciba offers si paciente ya inició)
    openSignalSocket();
    // abrir predict para escuchar predicciones (no mandamos frames desde psych)
    openPredictSocket();

})();
