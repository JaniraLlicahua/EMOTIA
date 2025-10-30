// app_desktop/views/js/psicoChat.js
document.addEventListener("DOMContentLoaded", async () => {
    const messagesContainer = document.querySelector(".chat-messages");
    const input = document.querySelector(".chat-input input");
    const sendBtn = document.querySelector(".chat-input button");
    const contactList = document.querySelector(".contacts");
    const statusLabel = document.querySelector(".chat-user p");

    const userId = parseInt(localStorage.getItem("user_id"));
    const token = localStorage.getItem("token");
    let receiverId = null;
    let ws = null;

    // =======================
    // 📜 Cargar lista de pacientes
    // =======================
    async function loadPatients() {
        try {
        const res = await fetch(`http://127.0.0.1:8000/chat/contacts/${userId}`);
        const patients = await res.json();
        contactList.innerHTML = "";

        patients.forEach(p => {
            const li = document.createElement("li");
            li.innerHTML = `
            <img src="../pictures/user.png" alt="Paciente">
            <div>
                <h4>${p.username}</h4>
                <p>${p.email || ""}</p>
            </div>`;
            li.addEventListener("click", () => openChat(p.id, p.username));
            contactList.appendChild(li);
        });
        } catch (err) {
        console.error("Error cargando pacientes:", err);
        }
    }

    // =======================
    // 💬 Abrir chat con paciente
    // =======================
    async function openChat(id, name) {
        receiverId = id;
        document.querySelector(".chat-user h4").textContent = name;
        messagesContainer.innerHTML = "";

        // Cargar historial desde backend
        try {
        const res = await fetch(`http://127.0.0.1:8000/chat/history/${userId}/${receiverId}`);
        const history = await res.json();

        if (Array.isArray(history)) {
            history.forEach(msg => {
            appendMessage(msg.content, msg.sender_id === userId ? "sent" : "received", msg.sent_at);
            });
        }
        } catch (e) {
        console.error("Error al cargar historial:", e);
        }

        initWebSocket();
    }

    // =======================
    // 🔌 WebSocket Chat
    // =======================
    function initWebSocket() {
        if (ws) ws.close();
        ws = new WebSocket(`ws://127.0.0.1:8000/ws/chat/${userId}/${receiverId}`);

        ws.onopen = () => console.log("🔗 WebSocket conectado");
        ws.onclose = () => console.log("❌ WebSocket cerrado");

        ws.onmessage = (event) => {
        const parts = event.data.split(":");
        const type = parts[0];

        // 🟢 Estado en línea / desconectado
        if (type === "status") {
            const status = parts[2] === "online" ? "En línea" : "Desconectado";
            statusLabel.textContent = status;
            return;
        }

        // 💬 Mensaje normal
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

    // Cargar pacientes al inicio
    loadPatients();
    });
