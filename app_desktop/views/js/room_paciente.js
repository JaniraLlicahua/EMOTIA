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

    /** PERFECT NEGOTIATION **/
    let makingOffer = false;
    let ignoreOffer = false;
    const polite = true;        // 🔥 Paciente debe ser POLITE

    const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    /** WebSocket con reconexión **/
    function createWebSocket(url, onOpen, onMessage) {
        let ws = null;

        const connect = () => {
            ws = new WebSocket(url);
            ws.onopen = () => onOpen?.();
            ws.onmessage = (ev) => onMessage?.(JSON.parse(ev.data));
            ws.onclose = () => setTimeout(connect, 1500);
        };
        connect();

        return {
            get raw() { return ws; },
            close() { ws?.close(); }
        };
    }

    function openSignalSocket() {
        const url = `${SIGNAL_HOST}/ws/signal/${sessionId}?token=${encodeURIComponent(token)}`;
        signalSocket = createWebSocket(url, null, handleSignalMessage);
    }

    function sendSignal(msg) {
        signalSocket?.raw?.send(JSON.stringify(msg));
    }

    /** WebRTC principal **/
    async function createPeerConnection() {
        if (pc) return;

        pc = new RTCPeerConnection(ICE);

        pc.ontrack = (ev) => {
            remoteVideo.srcObject = ev.streams[0];
        };

        pc.onicecandidate = (ev) => {
            if (ev.candidate)
                sendSignal({ type: "candidate", candidate: ev.candidate });
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

        // 🔥 IMPORTANTE: addTrack solo una vez
        if (localStream) {
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        }
    }


    /** Perfect Negotiation — señales */
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
        }

        if (msg.type === "answer") {
            await pc.setRemoteDescription(msg);
        }

        if (msg.type === "candidate") {
            await pc.addIceCandidate(msg.candidate);
        }
    }

    // 🔥 Activar cámara (arreglado)
    async function toggleCamera() {

        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 800, height: 600 },   // 🔥 video nítido
                audio: true
            });

            localVideo.srcObject = localStream;

            // Primer y ÚNICO addTrack
            await createPeerConnection();

            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

            makeLocalVideoFloating();
            startSendingFrames();

            btnCam.innerHTML = "Desactivar cámara";
            return;
        }

        // ❌ Apagar cámara
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
        localVideo.srcObject = null;

        clearInterval(sendInterval);
        predictSocket?.close();
        btnCam.innerHTML = "Activar cámara";
    }


    /** Micrófono */
    function toggleMic() {
        if (!localStream) return;
        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
        btnMic.innerHTML = micEnabled ? "Mic OFF" : "Mic ON";
    }


    /** Enviar frames IA */
    function startSendingFrames() {

        const url = `${PREDICT_HOST}/ws/predict/${sessionId}?token=${encodeURIComponent(token)}`;
        predictSocket = createWebSocket(url);

        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext("2d");

        sendInterval = setInterval(() => {
            if (!localStream) return;

            ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);

            predictSocket.raw.send(JSON.stringify({
                type: "frame",
                data: canvas.toDataURL("image/jpeg", 0.6)
            }));

        }, 900);
    }


    /** Pequeña ventana flotante */
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
            objectFit: "cover",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)"
        });
    }


    /** Salir */
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
