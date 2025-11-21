// app_desktop/views/js/room_paciente.js
(() => {
    const SIGNAL_HOST = "ws://127.0.0.1:8000";
    const PREDICT_HOST = "ws://127.0.0.1:8000";

    // usar real_session_id guardado desde backend cuando se inició la sesión
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
                // error -> will trigger close eventually
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

    // ---------- SIGNAL (relay) ----------
    function openSignalSocket() {
        if (signalSocket && signalSocket.raw && signalSocket.raw.readyState === WebSocket.OPEN) return;

        const url = `${SIGNAL_HOST}/ws/signal/${sessionId}?token=${encodeURIComponent(token)}`;
        signalSocket = createWebSocket(url, "Signal",
            () => console.log("Signal conectado (patient)"),
            async (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    if (!pc) {
                        console.log("Signal: no pc aún, creando...");
                        await createPeerConnection();
                    }
                    // tipos: answer, candidate (paciente espera answer)
                    if (data.type === "answer") {
                        // Some servers send full SDP object, ensure correct structure
                        await pc.setRemoteDescription(data);
                        console.log("Signal: answer aplicado");
                    } else if (data.type === "candidate") {
                        await pc.addIceCandidate(data.candidate);
                    } else {
                        console.log("Signal (patient) mensaje desconocido:", data.type);
                    }
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

    // ---------- PEER CONNECTION ----------
    async function createPeerConnection() {
        if (pc) return;
        pc = new RTCPeerConnection(ICE);

        pc.ontrack = (ev) => {
            // mostrar la pista remota en grande
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
            console.log("PC state:", pc.connectionState);
            if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
                // intenta recrear? por ahora lo dejamos manejado por WS reconexión
                console.warn("PeerConnection falló:", pc.connectionState);
            }
        };

        // paciente inicia offer cuando se necesita negociación
        pc.onnegotiationneeded = async () => {
            try {
                await startOffer();
            } catch (err) {
                console.warn("Error en negotiationneeded:", err);
            }
        };

        // si tenemos stream local, añadir tracks (una sola vez)
        if (localStream && !tracksAdded) {
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            tracksAdded = true;
        }
    }

    async function startOffer() {
        await createPeerConnection();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(pc.localDescription || offer);
        console.log("Offer enviada");
    }

    // ---------- CAM / MICRO ----------

    async function ensureLocalStream() {
        if (localStream) return localStream;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            // mini local: estilo flotante (draggable)
            makeLocalVideoFloating();
            localVideo.srcObject = localStream;
            tracksAdded = false; // para forzar re-add en pc
            return localStream;
        } catch (err) {
            console.error("getUserMedia error:", err);
            throw err;
        }
    }

    async function toggleCamera() {
        if (!localStream) {
            try {
                await ensureLocalStream();
                openSignalSocket();
                await createPeerConnection();
                // añadir tracks al pc
                if (!tracksAdded) {
                    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                    tracksAdded = true;
                }
                // trigger negotiation (onnegotiationneeded fires)
                await startOffer();

                // inicio envío de frames a predicción
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

            // cerrar pc (pero dejar signal reconectar en caso de reingreso)
            try { pc?.close(); } catch(_) {}
            pc = null;

            clearInterval(sendInterval);
            predictSocket?.close();

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
        if (predictSocket && predictSocket.raw && predictSocket.raw.readyState === WebSocket.OPEN) {
            // ya conectado
        } else {
            const url = `${PREDICT_HOST}/ws/predict/${sessionId}?token=${encodeURIComponent(token)}`;
            predictSocket = createWebSocket(url, "Predict",
                () => console.log("Predict WS abierto (patient)"),
                (ev) => {
                    // paciente no espera predictions de sí mismo (pero server reenvía a todos),
                    // no hacemos nada especial aquí en paciente UI.
                    // Si quieres puedes mostrar feedback local.
                },
                () => console.log("Predict WS cerrado (patient)"),
                (e) => console.warn("Predict WS error (patient)", e)
            );
        }

        // canvas para capturar frames del video local
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 320;
        canvas.height = 240;

        // asegúrate de no crear múltiples intervalos
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
                console.warn("Error enviando frame predict:", err);
            }
        }, 900);
    }

    // ---------- UI: mini local draggable (OPCION C) ----------
    function makeLocalVideoFloating() {
        const v = localVideo;
        // estilos para flotar y poder arrastrar
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

        // simple drag
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
            // limit dentro de viewport
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

    // ---------- iniciar signal al cargar para permitir recibir candidatos/answer si ya hay pc en psicólogo ----------
    openSignalSocket();

    // Si la cámara ya puede iniciar automáticamente (opcional), podrías descomentar esto:
    // ensureLocalStream().catch(()=>{});
})();
