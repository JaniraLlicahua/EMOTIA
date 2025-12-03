// app_desktop/views/js/psicoPacientes.js
document.addEventListener("DOMContentLoaded", async () => {
    const tableBody = document.querySelector("tbody");
    const searchInput = document.querySelector(".search-box input");
    const paginationContainer = document.querySelector(".pagination");
    const usernameEl = document.querySelector(".username");
    const avatarEl = document.querySelector(".avatar");
    const userMenu = document.createElement("div");

    const token = localStorage.getItem("token");
    const userId = parseInt(localStorage.getItem("user_id") || "0");
    const role = localStorage.getItem("role");

    if (!token || !userId) {
        console.warn("⚠️ Sesión no válida, redirigiendo...");
        window.location.href = "../html/login.html";
        return;
    }

    // Menú de usuario (para cerrar sesión)
    userMenu.className = "user-menu";
    userMenu.style.cssText = `
        position: absolute;
        top: 60px;
        right: 20px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 3px 8px rgba(0,0,0,0.1);
        display: none;
        flex-direction: column;
        min-width: 150px;
        z-index: 200;
    `;
    userMenu.innerHTML = `
        <button id="logoutBtn" style="padding:10px;border:none;background:none;text-align:left;cursor:pointer;font-size:0.9rem;">🚪 Cerrar sesión</button>
    `;
    document.body.appendChild(userMenu);

    document.querySelector(".user i.fa-caret-down").addEventListener("click", () => {
        userMenu.style.display = userMenu.style.display === "flex" ? "none" : "flex";
    });
    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.clear();
        window.location.href = "../html/login.html";
    });

    // Mostrar datos del usuario logueado
    try {
        const res = await fetch(`http://127.0.0.1:8000/users/${userId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
            const user = await res.json();
            usernameEl.textContent = user.first_name ? `${user.first_name} ${user.last_name || ""}` : user.username;
            if (user.photo_url) avatarEl.src = user.photo_url;
        }
    } catch (e) {
        console.warn("No se pudo cargar perfil:", e);
    }

    // =============================
    // Cargar y mostrar pacientes
    // =============================
    let allPatients = [];
    let filteredPatients = [];
    const PAGE_SIZE = 10;
    let currentPage = 1;

    async function loadPatients() {
        try {
            const res = await fetch(`http://127.0.0.1:8000/chat/contacts/${userId}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Error al obtener pacientes");
            allPatients = await res.json();
            filteredPatients = allPatients;
            renderTable();
        } catch (err) {
            console.error("Error cargando pacientes:", err);
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Error al cargar pacientes</td></tr>`;
        }
    }

    function renderTable() {
        const start = (currentPage - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const patients = filteredPatients.slice(start, end);

        tableBody.innerHTML = "";
        if (patients.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No se encontraron pacientes</td></tr>`;
            return;
        }

        patients.forEach((p, i) => {
            const tr = document.createElement("tr");
            const index = start + i + 1;
            tr.innerHTML = `
                <td>${index}</td>
                <td>${p.first_name || ""} ${p.last_name || p.username}</td>
                <td><span class="status approved"></span> Activo</td>
                <td>${p.email || "-"}</td>
                <td>${p.birth_date ? new Date(p.birth_date).toLocaleDateString() : "-"}</td>
                <td class="actions">
                    <button title="Ver perfil" onclick="viewProfile(${p.id})"><i class="fa-solid fa-eye"></i></button>
                    <button title="Abrir chat" onclick="openChat(${p.id}, '${p.username}')"><i class="fa-solid fa-comments"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        renderPagination();
    }

    function renderPagination() {
        const totalPages = Math.ceil(filteredPatients.length / PAGE_SIZE);
        paginationContainer.innerHTML = "";

        if (totalPages <= 1) return;

        const prev = document.createElement("button");
        prev.textContent = "<";
        prev.disabled = currentPage === 1;
        prev.onclick = () => { currentPage--; renderTable(); };
        paginationContainer.appendChild(prev);

        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement("button");
            btn.textContent = i;
            if (i === currentPage) btn.classList.add("active");
            btn.onclick = () => { currentPage = i; renderTable(); };
            paginationContainer.appendChild(btn);
        }

        const next = document.createElement("button");
        next.textContent = ">";
        next.disabled = currentPage === totalPages;
        next.onclick = () => { currentPage++; renderTable(); };
        paginationContainer.appendChild(next);
    }

    // =============================
    // Filtro de búsqueda (nombre/apellido)
    // =============================
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        filteredPatients = allPatients.filter(p => {
            const fullName = `${p.first_name || ""} ${p.last_name || ""} ${p.username || ""}`.toLowerCase();
            return fullName.includes(query);
        });
        currentPage = 1;
        renderTable();
    });

    // =============================
    // Acciones (abrir chat, ver perfil)
    // =============================
    window.openChat = function (id, username) {
        localStorage.setItem("receiver_id", id);
        localStorage.setItem("receiver_name", username);
        window.location.href = "../html/psicoChat.html";
    };

    // =============================
    // Ver perfil del paciente (dentro del mismo HTML)
    // =============================
    window.viewProfile = async function (id) {
        const modal = document.getElementById("profileModal");
        const modalContent = modal.querySelector(".modal-content");

        try {
            const res = await fetch(`http://127.0.0.1:8000/users/${id}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("No encontrado");

            const user = await res.json();

            modalContent.innerHTML = `
                <span class="close">&times;</span>
                <h2>${user.first_name || ""} ${user.last_name || ""}</h2>
                <img src="${user.photo_url || '../img/avatar_default.png'}" alt="Foto del paciente" class="profile-photo">
                <p><strong>Correo:</strong> ${user.email || "-"}</p>
                <p><strong>Teléfono:</strong> ${user.phone || "-"}</p>
                <p><strong>Dirección:</strong> ${user.address || "-"}</p>
                <p><strong>Ciudad:</strong> ${user.city || "-"}</p>
                <p><strong>Fecha de nacimiento:</strong> ${user.birth_date ? new Date(user.birth_date).toLocaleDateString() : "-"}</p>
                <p><strong>Estado:</strong> ${user.status}</p>
            `;

            modal.style.display = "flex";

            modal.querySelector(".close").onclick = () => (modal.style.display = "none");
            modal.onclick = (e) => {
                if (e.target === modal) modal.style.display = "none";
            };
        } catch (e) {
            console.error("Error al cargar perfil:", e);
            alert("❌ Error al cargar perfil del paciente.");
        }
    };

    // Inicializar
    loadPatients();
});