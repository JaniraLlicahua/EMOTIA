// frontend/js/room.js
(async () => {
  // Extraer session_id y token desde query params (opcional)
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id") || "1";
  const token = params.get("token") || "";

  const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/predict/${sessionId}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => console.log("WS conectado");
  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === "prediction") {
      document.getElementById("result").innerText = `Emoción: ${data.emotion} | Confianza: ${(data.confidence*100).toFixed(1)}%`;
    }
  };

  const video = document.getElementById("localVideo");
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = stream;

  // create canvas to capture frames
  const canvas = document.createElement("canvas");
  canvas.width = 320; canvas.height = 240;
  const ctx = canvas.getContext("2d");

  // send frame every interval ms
  const INTERVAL_MS = 800; // ajustar (200-1000)
  setInterval(() => {
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6); // base64 jpeg
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "frame", data: dataUrl }));
      }
    } catch (e) {
      console.error(e);
    }
  }, INTERVAL_MS);
})();
