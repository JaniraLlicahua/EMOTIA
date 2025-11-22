// room_paciente.js (Perfect Negotiation - paciente, impolite)
(() => {
    const SIGNAL_HOST = "ws://127.0.0.1:8000";
    const PREDICT_HOST = "ws://127.0.0.1:8000";

    const sessionId = localStorage.getItem("real_session_id");
    const token = localStorage.getItem("token");

    if (!sessionId || !token) {
        alert("❌ Error: No hay sesión válida. Regresa al calendario.");
        window.location.href = "../html/pacieCalendario.html";
        return;
    }

    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const btnCam = document.getElementById("btnCam");
    const btnMic = document.getElementById("btnMic");
    const btnExit = document.getElementById("btnExit");

    let pc = null;
    let signalSocket = null;
    let predictSocket = null;
    let localStream = null;
    let micEnabled = true;
    let sendInterval = null;
    let tracksAdded = false;

    // Perfect negotiation flags
    let makingOffer = false;
    let ignoreOffer = false;
    const polite = false; // paciente = impolite

    const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    // ---------- helpers de reconexión ----------
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

    // ---------- SIGNAL (relay, Perfect Negotiation) ----------
    function openSignalSocket() {
        if (signalSocket && signalSocket.raw && signalSocket.raw.readyState === WebSocket.OPEN) return;

        const url = `${SIGNAL_HOST}/ws/signal/${sessionId}?token=${encodeURIComponent(token)}`;
        signalSocket = createWebSocket(url, "Signal",
            () => console.log("Signal conectado (patient)"),
            async (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    await handleSignalMessage(data);
                } catch (err) {
                    console.error("Error manejando mensaje de señal (patient):", err);
                }
            },
            () => console.log("Signal socket (patient) cerrado"),
            (e) => console.warn("Signal socket error (patient):", e)
        );
    }

    function sendSignal(msg) {
        try {
            const raw = signalSocket?.raw;
            if (raw && raw.readyState === WebSocket.OPEN) raw.send(JSON.stringify(msg));
        } catch (err) { console.warn("sendSignal err", err); }
    }

    async function handleSignalMessage(msg) {
        // Mensajes: offer / answer / candidate
        if (!pc) await createPeerConnection();

        if (msg.type === "offer") {
            // Perfect negotiation: detect collision
            const offerCollision = makingOffer || pc.signalingState !== "stable";
            ignoreOffer = !polite && offerCollision;
            if (ignoreOffer) {
                console.warn("Offer collision - impolite and collision -> ignoring incoming offer");
                return;
            }
            try {
                await pc.setRemoteDescription(msg);
                // as patient, when receive offer, create answer
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal(pc.localDescription);
            } catch (err) {
                console.error("Error applying remote offer (patient):", err);
                // try rollback if possible
                try {
                    await pc.setLocalDescription({ type: "rollback" });
                    await pc.setRemoteDescription(msg);
                } catch (e) {
                    console.error("Rollback failed (patient):", e);
                }
            }
        } else if (msg.type === "answer") {
            try {
                await pc.setRemoteDescription(msg);
            } catch (err) {
                console.error("Error applying answer (patient):", err);
            }
        } else if (msg.type === "candidate") {
            try {
                if (msg.candidate) await pc.addIceCandidate(msg.candidate);
            } catch (err) {
                console.warn("addIceCandidate (patient) failed:", err);
            }
        } else {
            console.log("Signal (patient) mensaje desconocido:", msg.type);
        }
    }

    // ---------- PEER CONNECTION (patient) ----------
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
            console.log("PC state (patient):", pc.connectionState);
        };

        // Perfect negotiation: set makingOffer flag around createOffer
        pc.onnegotiationneeded = async () => {
            try {
                makingOffer = true;
                const offer = await pc.createOffer();
                // if signalingState not stable, will be handled by collision logic on remote
                await pc.setLocalDescription(offer);
                sendSignal(pc.localDescription);
            } catch (err) {
                console.warn("Error en negotiationneeded (patient):", err);
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
            makeLocalVideoFloating();
            localVideo.srcObject = localStream;
            tracksAdded = false;
            return localStream;
        } catch (err) {
            console.error("getUserMedia error (patient):", err);
            throw err;
        }
    }

    async function toggleCamera() {
        if (!localStream) {
            try {
                await ensureLocalStream();
                openSignalSocket();
                await createPeerConnection();

                if (!tracksAdded) {
                    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                    tracksAdded = true;
                }
                // trigger negotiation if needed (onnegotiationneeded will run)
                // start sending frames to prediction
                startSendingFrames();
                btnCam.textContent = "Desactivar cámara";
                btnCam.classList.add("on");
            } catch (e) {
                alert("❌ No se pudo acceder a la cámara. Revisa permisos o que otra app no la esté usando.");
            }
        } else {
            // apagar
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
            localVideo.srcObject = null;
            tracksAdded = false;

            try { pc?.close(); } catch(_) {}
            pc = null;

            clearInterval(sendInterval);
            try { predictSocket?.close(); } catch(_) {}

            btnCam.textContent = "Activar cámara";
            btnCam.classList.remove("on");
        }
    }

    function toggleMic() {
        if (!localStream) return;
        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
        btnMic.textContent = micEnabled ? "Mic OFF" : "Mic ON";
    }

    // ---------- PREDICTION (solo paciente envía frames) ----------
    function startSendingFrames() {
        if (!predictSocket || !predictSocket.raw || predictSocket.raw.readyState !== WebSocket.OPEN) {
            const url = `${PREDICT_HOST}/ws/predict/${sessionId}?token=${encodeURIComponent(token)}`;
            predictSocket = createWebSocket(url, "Predict",
                () => console.log("Predict WS abierto (patient)"),
                (ev) => { /* paciente no necesita manejar predicciones aquí */ },
                () => console.log("Predict WS cerrado (patient)"),
                (e) => console.warn("Predict WS error (patient)", e)
            );
        }

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 320;
        canvas.height = 240;

        clearInterval(sendInterval);
        sendInterval = setInterval(() => {
            if (!localStream || !localVideo || localVideo.videoWidth === 0) return;
            try {
                ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
                const frame = canvas.toDataURL("image/jpeg", 0.6);
                const raw = predictSocket?.raw;
                if (raw && raw.readyState === WebSocket.OPEN) {
                    raw.send(JSON.stringify({ type: "frame", data: frame }));
                }
            } catch (err) {
                console.warn("Error enviando frame predict (patient):", err);
            }
        }, 900);
    }

    // ---------- UI: mini local draggable ----------
    function makeLocalVideoFloating() {
        const v = localVideo;
        Object.assign(v.style, {
            position: "fixed",
            right: "16px",
            bottom: "16px",
            width: "220px",
            height: "160px",
            zIndex: 9999,
            cursor: "move",
            border: "2px solid #fff",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)"
        });

        let dragging = false, offsetX = 0, offsetY = 0;
        v.addEventListener("pointerdown", (e) => {
            dragging = true;
            offsetX = e.clientX - v.getBoundingClientRect().left;
            offsetY = e.clientY - v.getBoundingClientRect().top;
            v.setPointerCapture(e.pointerId);
        });
        window.addEventListener("pointermove", (e) => {
            if (!dragging) return;
            let left = e.clientX - offsetX;
            let top = e.clientY - offsetY;
            left = Math.max(8, Math.min(window.innerWidth - v.offsetWidth - 8, left));
            top = Math.max(8, Math.min(window.innerHeight - v.offsetHeight - 8, top));
            v.style.left = left + "px";
            v.style.top = top + "px";
        });
        window.addEventListener("pointerup", (e) => { dragging = false; });
    }

    // ---------- eventos UI ----------
    btnCam.addEventListener("click", toggleCamera);
    btnMic.addEventListener("click", toggleMic);

    btnExit.addEventListener("click", () => {
        localStream?.getTracks().forEach(t => t.stop());
        try { signalSocket?.close(); } catch(_) {}
        try { predictSocket?.close(); } catch(_) {}
        try { pc?.close(); } catch(_) {}
        window.location.href = "../html/pacieCalendario.html";
    });

    // iniciar signal para recibir candidates/answer si ya hay pc en psicólogo
    openSignalSocket();
})();
