// adminPsicologos.js
const API_URL = "http://127.0.0.1:8000";
const token = localStorage.getItem("token");

async function loadPsychologists() {
  const tbody = document.querySelector(".psychologists-table tbody");
  tbody.innerHTML = `<tr><td colspan="7">Cargando...</td></tr>`;

  try {
    const res = await fetch(`${API_URL}/admin/psychologists`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Error al obtener psicólogos");
    const list = await res.json();

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">No hay psicólogos registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (p, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${p.first_name || ""} ${p.last_name || ""}</td>
          <td>${p.specialty || "-"}</td>
          <td>${p.email || "-"}</td>
          <td>${p.phone || "-"}</td>
          <td>${p.status || "-"}</td>
          <td class="actions-col">
            <button class="icon-btn" title="Eliminar" onclick="deletePsychologist(${p.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>`
      )
      .join("");
  } catch (err) {
    console.error("❌ Error:", err);
    tbody.innerHTML = `<tr><td colspan="7">Error al cargar psicólogos</td></tr>`;
  }
}

async function deletePsychologist(id) {
  if (!confirm("¿Eliminar este psicólogo?")) return;

  try {
    const res = await fetch(`${API_URL}/admin/psychologists/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      alert("Psicólogo eliminado correctamente ✅");
      loadPsychologists();
    } else {
      const err = await res.json();
      alert("Error: " + (err.detail || "No se pudo eliminar"));
    }
  } catch (err) {
    console.error(err);
    alert("Error al eliminar psicólogo");
  }
}

document.getElementById("btn-add-psicologo").addEventListener("click", async () => {
  const nombre = prompt("Nombre:");
  const apellido = prompt("Apellido:");
  const correo = prompt("Correo:");
  const telefono = prompt("Teléfono:");
  const especialidad = prompt("Especialidad:");
  const estado = prompt("Estado (activo/inactivo):", "activo");
  const password = prompt("Contraseña inicial:", "psico123");

  if (!nombre || !correo) {
    alert("Debe ingresar nombre y correo");
    return;
  }

  const data = {
    first_name: nombre,
    last_name: apellido,
    email: correo,
    phone: telefono,
    specialty: especialidad,
    status: estado,
    password,
  };

  try {
    const res = await fetch(`${API_URL}/admin/psychologists`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      alert("Psicólogo agregado correctamente ✅");
      loadPsychologists();
    } else {
      const err = await res.json();
      alert("Error: " + (err.detail || "No se pudo crear"));
    }
  } catch (err) {
    console.error("❌ Error:", err);
    alert("Error al crear psicólogo");
  }
});

document.addEventListener("DOMContentLoaded", loadPsychologists);
