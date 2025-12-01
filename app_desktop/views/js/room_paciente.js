// room_paciente.js 
(() => {
    const SIGNAL_HOST = "ws://127.0.0.1:8000";
    const PREDICT_HOST = "ws://127.0.0.1:8000";

    const sessionId = localStorage.getItem("real_session_id");
    const token = localStorage.getItem("token");

    if (!sessionId || !token) {
        alert("❌ No hay sesión iniciada.");
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

    let makingOffer = false;
    let ignoreOffer = false;
    const polite = true;

    const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    function createWebSocket(url, onOpen, onMessage) {
        let ws = null;
        let attempts = 0;

        const connect = () => {
            attempts++;
            try {
                ws = new WebSocket(url);
            } catch (err) {
                setTimeout(connect, Math.min(15000, attempts * 1000));
                return;
            }

            ws.onopen = () => { attempts = 0; onOpen?.(); };
            ws.onmessage = (ev) => onMessage?.(JSON.parse(ev.data));
            ws.onclose = () => setTimeout(connect, Math.min(15000, attempts * 1000));
            ws.onerror = () => ws.close();
        };
        connect();

        return {
            get raw() { return ws; },
            close() { ws?.close(); }
        };
    }

    function openSignalSocket() {
        const url = `${SIGNAL_HOST}/ws/signal/${sessionId}?token=${encodeURIComponent(token)}`;
        signalSocket = createWebSocket(url, () => console.log("Signal connected"), handleSignalMessage);
    }

    function sendSignal(msg) {
        try { signalSocket?.raw?.send(JSON.stringify(msg)); } catch (e) {}
    }

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
                if (!localStream) return;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendSignal(pc.localDescription);
            } finally {
                makingOffer = false;
            }
        };
    }

    async function handleSignalMessage(msg) {
        if (!pc) await createPeerConnection();

        if (msg.type === "offer") {
            const collision = makingOffer || pc.signalingState !== "stable";
            ignoreOffer = !polite && collision;
            if (ignoreOffer) return;

            await pc.setRemoteDescription(msg);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal(pc.localDescription);
            return;
        }

        if (msg.type === "answer") {
            await pc.setRemoteDescription(msg);
            return;
        }

        if (msg.type === "candidate" && msg.candidate) {
            try { await pc.addIceCandidate(msg.candidate); } catch (e) {}
        }
    }

    async function toggleCamera() {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 800, height: 600 },
                audio: true
            });

            localVideo.srcObject = localStream;

            await createPeerConnection();

            if (!tracksAdded) {
                // addTrack SOLO si pc ya existe (creado arriba)
                localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                tracksAdded = true;
            }

            // Forzar negociación si ya hay un remote (asegura que el otro reciba tu video)
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendSignal(pc.localDescription);
            } catch (e) { console.warn("negotiation error", e); }

            openPredictSocket();
            startSendingFrames();
            makeLocalVideoFloating();
            btnCam.innerHTML = "Desactivar cámara";
            return;
        }

        // apagar
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
        localVideo.srcObject = null;

        clearInterval(sendInterval);
        predictSocket?.close();
        tracksAdded = false;
        btnCam.innerHTML = "Activar cámara";
    }

    function toggleMic() {
        if (!localStream) return;
        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
        btnMic.innerHTML = micEnabled ? "Mic OFF" : "Mic ON";
    }

    function openPredictSocket() {
        const url = `${PREDICT_HOST}/ws/predict/${sessionId}?token=${encodeURIComponent(token)}`;
        predictSocket = new WebSocket(url);
        predictSocket.onopen = () => console.log("Predict socket open");
        predictSocket.onmessage = (ev) => {
            // optional: handle messages coming back from predict server (if any)
            // console.log("predict:", ev.data);
        };
        predictSocket.onclose = () => console.log("Predict closed");
    }

    function startSendingFrames() {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        sendInterval = setInterval(() => {
            if (!predictSocket || predictSocket.readyState !== 1) return;
            if (!localVideo || !localVideo.videoWidth) return;

            canvas.width = localVideo.videoWidth;
            canvas.height = localVideo.videoHeight;
            ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
            const frame = canvas.toDataURL("image/jpeg", 0.6);

            try {
                predictSocket.send(JSON.stringify({ type: "frame", data: frame }));
            } catch (e) {}
        }, 900);
    }

    function makeLocalVideoFloating() {
        Object.assign(localVideo.style, {
            position: "fixed",
            bottom: "20px",
            right: "20px",
            width: "220px",
            height: "160px",
            borderRadius: "10px",
            border: "2px solid white",
            zIndex: 9999,
            background: "#000",
            objectFit: "cover"
        });
    }

    btnExit.onclick = () => {
        localStream?.getTracks().forEach(t => t.stop());
        pc?.close();
        signalSocket?.close();
        predictSocket?.close();
        window.location.href = "../html/pacieCalendario.html";
    };

    btnCam.onclick = toggleCamera;
    btnMic.onclick = toggleMic;

    openSignalSocket();
})();
