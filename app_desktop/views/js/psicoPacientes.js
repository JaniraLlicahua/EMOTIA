document.addEventListener("DOMContentLoaded", async () => {
    const tableBody = document.querySelector("tbody");
    const userIdStr = localStorage.getItem("user_id");
    const userId = userIdStr ? parseInt(userIdStr) : null;
    const token = localStorage.getItem("token");

    if (!userId || isNaN(userId)) {
        console.warn("⚠️ No hay sesión activa, redirigiendo al login...");
        window.location.href = "../html/login.html";
        return;
    }

    console.log("🧠 Cargando pacientes del psicólogo:", userId);

    async function loadPatients() {
        try {
        const res = await fetch(`http://127.0.0.1:8000/chat/contacts/${userId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const patients = await res.json();
        if (!Array.isArray(patients)) {
            console.error("Formato inesperado:", patients);
            tableBody.innerHTML = `<tr><td colspan="6">Error de datos</td></tr>`;
            return;
        }

        tableBody.innerHTML = "";
        if (patients.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Sin pacientes asignados</td></tr>`;
            return;
        }

        patients.forEach((p, i) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${p.first_name || p.username} ${p.last_name || ""}</td>
            <td><span class="status approved"></span> Activo</td>
            <td>${p.email || "-"}</td>
            <td>${p.birth_date ? new Date(p.birth_date).toLocaleDateString() : "-"}</td>
            <td class="actions">
                <button title="Abrir chat" onclick="openChat(${p.id}, '${p.username}')"><i class="fa-solid fa-comments"></i></button>
            </td>`;
            tableBody.appendChild(tr);
        });
        } catch (err) {
        console.error("Error cargando pacientes:", err);
        tableBody.innerHTML = `<tr><td colspan="6" style="color:red;">Error al cargar</td></tr>`;
        }
    }

    window.openChat = function (id, username) {
        localStorage.setItem("receiver_id", id);
        localStorage.setItem("receiver_name", username);
        window.location.href = "../html/psicoChat.html";
    };

    loadPatients();
    });
