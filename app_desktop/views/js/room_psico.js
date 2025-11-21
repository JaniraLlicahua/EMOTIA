// app_desktop/views/js/room_psico.js
(() => {
    const SIGNAL_HOST = "ws://127.0.0.1:8000";
    const PREDICT_HOST = "ws://127.0.0.1:8000";

    // 🔥 FORZAR A USAR EL REAL_SESSION_ID
    let sessionId = localStorage.getItem("real_session_id");
    const token = localStorage.getItem("token");

    if (!sessionId || !token) {
        alert("❌ Error: No hay sesión iniciada.");
        window.location.href = "../html/psicoReuniones.html";
        return;
    }

    document.getElementById("sessionInfo").textContent = `Sesión #${sessionId}`;

    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const btnCam = document.getElementById("btnCam");
    const btnMic = document.getElementById("btnMic");
    const btnHangup = document.getElementById("btnHangup");
    const notes = document.getElementById("notes");
    const emotionCountsEl = document.getElementById("emotionCounts");
    const alertOverlay = document.getElementById("alertOverlay");

    let pc = null;
    let signalSocket = null;
    let predictSocket = null;
    let localStream = null;
    let micEnabled = true;

    const emotionStats = {};
    const recentPred = [];
    const PERSIST_SECONDS = 8;
    const PERSIST_COUNT = 4;
    let lastAlertEmotion = null;

    const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    function sendSignal(msg) {
        if (signalSocket && signalSocket.readyState === WebSocket.OPEN) {
            signalSocket.send(JSON.stringify(msg));
        }
    }

    function openSignalSocket() {
        if (signalSocket && signalSocket.readyState === WebSocket.OPEN) return;

        signalSocket = new WebSocket(`${SIGNAL_HOST}/ws/signal/${sessionId}?token=${encodeURIComponent(token)}`);
        signalSocket.onopen = () => console.log("Signal socket (psych) open");

        signalSocket.onmessage = async (ev) => {
            const data = JSON.parse(ev.data);
            if (!pc) await createPeerConnection();

            if (data.type === "offer") {
                await pc.setRemoteDescription(data);

                if (localStream) {
                    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                }

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal(answer);
            } else if (data.type === "candidate") {
                await pc.addIceCandidate(data.candidate);
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

    async function toggleCam() {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;

            if (pc) {
                localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            }

            openSignalSocket();
            openPredictSocket();

            btnCam.classList.add("on");

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

    function openPredictSocket() {
        if (predictSocket && predictSocket.readyState === WebSocket.OPEN) return;

        predictSocket = new WebSocket(`${PREDICT_HOST}/ws/predict/${sessionId}`);
        predictSocket.onmessage = (ev) => {
            const data = JSON.parse(ev.data);
            if (data.type === "prediction") handlePrediction(data);
        };
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
    }

    function showAlert(emotion) {
        alertOverlay.style.display = "flex";
        alertOverlay.querySelector(".alert-box").textContent = `⚠️ Emoción: ${emotion}`;
        setTimeout(() => alertOverlay.style.display = "none", 6000);
    }

    function updateEmotionUI() {
        emotionCountsEl.innerHTML = Object.entries(emotionStats)
            .map(([e, v]) => `<b>${e}</b>: ${v}`)
            .join(" · ");
    }

    btnHangup.addEventListener("click", () => {
        try { signalSocket?.close(); } catch(e) {}
        try { predictSocket?.close(); } catch(e) {}
        window.location.href = "../html/psicoReuniones.html";
    });

    btnCam.addEventListener("click", toggleCam);
    btnMic.addEventListener("click", toggleMic);

    openSignalSocket();
    openPredictSocket();
})();
