// app_desktop/views/js/room_paciente.js
(() => {
    const SIGNAL_HOST = "ws://127.0.0.1:8000";
    const PREDICT_HOST = "ws://127.0.0.1:8000";
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const token = params.get("token") || localStorage.getItem("token");

    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const btnCam = document.getElementById("btnCam");
    const btnExit = document.getElementById("btnExit");

    let pc, signalSocket, predictSocket;
    let localStream = null;
    let sendFramesInterval = null;
    const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

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
                await pc.addIceCandidate(data.candidate);
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

    async function openCamera() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            openSignalSocket();
            await startPeer(true);
            startSendingFramesToPredict();
        } catch (err) {
            console.error("Error abriendo cámara:", err);
            alert("No se pudo acceder a la cámara/mic. Revisa permisos.");
        }
    }

    function startSendingFramesToPredict() {
        // abrir ws predict
        predictSocket = new WebSocket(`${PREDICT_HOST}/ws/predict/${sessionId}`);
        predictSocket.onopen = () => {
            // mandar frames cada 1s
            const canvas = document.createElement("canvas");
            const video = localVideo;
            canvas.width = 320;
            canvas.height = 240;
            const ctx = canvas.getContext("2d");
            sendFramesInterval = setInterval(() => {
                if (!video || video.readyState < 2) return;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
                if (predictSocket.readyState === WebSocket.OPEN) {
                    predictSocket.send(JSON.stringify({ type: "frame", data: dataUrl }));
                }
            }, 1000);
        };
        predictSocket.onmessage = (ev) => {
            // paciente no necesita procesar las predicciones; psicólogo recibirá las predicciones
        };
    }

    btnCam.addEventListener("click", () => {
        // toggle: si no hay stream, abrir; si hay, cerrar y volver
        if (!localStream) {
            openCamera();
            btnCam.textContent = "Desactivar cámara";
        } else {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
            localVideo.srcObject = null;
            clearInterval(sendFramesInterval);
            try { predictSocket?.close(); } catch(e) {}
            btnCam.textContent = "Unirse / Cámara";
        }
    });

    btnExit.addEventListener("click", () => {
        // limpiar
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        try { predictSocket?.close(); } catch(e){}
        try { signalSocket?.close(); } catch(e){}
        location.href = "../html/pacieCalendario.html";
    });

    // intentar abrir la señal (en caso remoto ya envie offer)
    openSignalSocket();
})();
