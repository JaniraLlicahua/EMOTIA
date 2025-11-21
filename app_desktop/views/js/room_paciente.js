// app_desktop/views/js/room_paciente.js
(() => {
    const SIGNAL_HOST = "ws://127.0.0.1:8000";
    const PREDICT_HOST = "ws://127.0.0.1:8000";

    // 🔥 USAR EL REAL_SESSION_ID GUARDADO EN LOCALSTORAGE
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");
    const token = urlParams.get("token") || localStorage.getItem("token");

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

    const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    function sendSignal(msg) {
        if (signalSocket && signalSocket.readyState === WebSocket.OPEN) {
            signalSocket.send(JSON.stringify(msg));
        }
    }

    function openSignalSocket() {
        if (signalSocket && signalSocket.readyState === WebSocket.OPEN) return;

        signalSocket = new WebSocket(`${SIGNAL_HOST}/ws/signal/${sessionId}?token=${encodeURIComponent(token)}`);
        signalSocket.onopen = () => console.log("Signal socket (patient) open");
        signalSocket.onclose = () => console.log("Signal socket (patient) closed");
        signalSocket.onerror = (e) => console.warn("Signal socket error:", e);

        signalSocket.onmessage = async (ev) => {
            const data = JSON.parse(ev.data);
            try {
                if (!pc) await createPeerConnection();

                if (data.type === "answer") {
                    await pc.setRemoteDescription(data);
                } else if (data.type === "candidate") {
                    await pc.addIceCandidate(data.candidate);
                }
            } catch (err) {
                console.error("Error handling signal (patient):", err);
            }
        };
    }

    async function createPeerConnection() {
        pc = new RTCPeerConnection(ICE);

        pc.ontrack = (ev) => {
            remoteVideo.srcObject = ev.streams[0];
        };

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                sendSignal({ type: "candidate", candidate: e.candidate });
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        }
    }

    async function startOffer() {
        if (!pc) await createPeerConnection();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(offer);
    }

    async function toggleCamera() {
        if (!localStream) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localVideo.srcObject = localStream;

                openSignalSocket();

                await createPeerConnection();
                localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

                await startOffer();

                startSendingFrames();
                btnCam.textContent = "Desactivar cámara";
            } catch (e) {
                alert("No se pudo acceder a la cámara.");
            }
        } else {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
            localVideo.srcObject = null;

            try { pc.close(); } catch(e) {}
            pc = null;

            clearInterval(sendInterval);
            try { predictSocket?.close(); } catch(e) {}

            btnCam.textContent = "Activar cámara";
        }
    }

    function toggleMic() {
        if (!localStream) return;
        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
        btnMic.textContent = micEnabled ? "Mic OFF" : "Mic ON";
    }

    function startSendingFrames() {
        predictSocket = new WebSocket(`${PREDICT_HOST}/ws/predict/${sessionId}`);
        predictSocket.onopen = () => console.log("Predict socket open (patient)");

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 320;
        canvas.height = 240;

        sendInterval = setInterval(() => {
            if (!localStream) return;
            ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
            const frame = canvas.toDataURL("image/jpeg", 0.6);
            if (predictSocket.readyState === WebSocket.OPEN) {
                predictSocket.send(JSON.stringify({ type: "frame", data: frame }));
            }
        }, 900);
    }

    btnCam.addEventListener("click", toggleCamera);
    btnMic.addEventListener("click", toggleMic);

    btnExit.addEventListener("click", () => {
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        try { signalSocket?.close(); } catch(e) {}
        try { predictSocket?.close(); } catch(e) {}
        try { pc?.close(); } catch(e) {}
        window.location.href = "../html/pacieCalendario.html";
    });

    openSignalSocket();
})();
