// app_desktop/views/js/pacieChat.js
document.addEventListener("DOMContentLoaded", async () => {
    const messagesContainer = document.querySelector(".chat-messages");
    const input = document.querySelector(".chat-input input");
    const sendBtn = document.querySelector(".chat-input button");
    const statusLabel = document.querySelector(".chat-user p");

    const userId = parseInt(localStorage.getItem("user_id"));
    const token = localStorage.getItem("token");
    let receiverId = null;
    let ws = null;

    // =======================
    // 🎯 Cargar psicólogo asignado
    // =======================
    async function loadPsychologist() {
        try {
        const res = await fetch(`http://127.0.0.1:8000/chat/assigned/${userId}`);
        const data = await res.json();
        receiverId = data.psychologist_id;

        if (!receiverId) {
            messagesContainer.innerHTML = "<p>No tienes psicólogo asignado.</p>";
            return;
        }

        document.querySelector(".chat-user h4").textContent = data.psychologist_name;
        openChat();
        } catch (err) {
        console.error("Error al cargar psicólogo asignado:", err);
        }
    }

    // =======================
    // 💬 Cargar historial + iniciar WS
    // =======================
    async function openChat() {
        messagesContainer.innerHTML = "";

        try {
        const res = await fetch(`http://127.0.0.1:8000/chat/history/${userId}/${receiverId}`);
        const history = await res.json();

        if (Array.isArray(history)) {
            history.forEach(msg => {
            appendMessage(msg.content, msg.sender_id === userId ? "sent" : "received", msg.sent_at);
            });
        }
        } catch (e) {
        console.error("Error cargando historial:", e);
        }

        initWebSocket();
    }

    // =======================
    // 🔌 WebSocket
    // =======================
    function initWebSocket() {
        if (ws) ws.close();
        ws = new WebSocket(`ws://127.0.0.1:8000/ws/chat/${userId}/${receiverId}`);

        ws.onopen = () => console.log("✅ Chat conectado");
        ws.onclose = () => console.log("❌ Chat cerrado");

        ws.onmessage = (event) => {
        const parts = event.data.split(":");
        const type = parts[0];

        if (type === "status") {
            const status = parts[2] === "online" ? "En línea" : "Desconectado";
            statusLabel.textContent = status;
            return;
        }

        const [sender, text] = event.data.split(":");
        appendMessage(text, sender === "yo" ? "sent" : "received");
        };
    }

    // =======================
    // 📨 Enviar mensaje
    // =======================
    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

    function sendMessage() {
        const msg = input.value.trim();
        if (!msg || !ws) return;
        ws.send(msg);
        input.value = "";
    }

    // =======================
    // 💌 Mostrar mensaje
    // =======================
    function appendMessage(text, type, time = null) {
        const div = document.createElement("div");
        div.classList.add("message", type);
        div.innerHTML = `<p>${text}</p><span>${time || new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>`;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    loadPsychologist();
    });
