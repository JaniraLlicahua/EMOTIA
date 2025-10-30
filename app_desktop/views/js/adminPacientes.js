// app_desktop/views/js/adminPacientes.js
const API_URL = "http://127.0.0.1:8000";
const token = localStorage.getItem("token");

// ================================
// 🔹 Cargar lista de pacientes
// ================================
async function loadPatients() {
  const tbody = document.querySelector(".patients-table tbody");
  tbody.innerHTML = `<tr><td colspan="6">Cargando...</td></tr>`;

  try {
    const res = await fetch(`${API_URL}/admin/patients`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status}`);
    }

    const patients = await res.json();

    if (!Array.isArray(patients) || patients.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">No hay pacientes registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = patients
    .map(
      (p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${p.first_name || ""} ${p.last_name || ""}</td>
        <td><span class="status ${
          p.status === "activo"
            ? "approved"
            : p.status === "bloqueado"
            ? "blocked"
            : "rejected"
        }"></span> ${p.status}</td>
        <td>${p.email || "-"}</td>
        <td>${p.created_at || "-"}</td>
        <td class="actions-col">
          <button class="icon-btn" onclick="assignPsychologist(${p.id})" title="Asignar psicólogo">
            <i class="fa-solid fa-user-doctor"></i>
          </button>
          <button class="icon-btn" onclick="editPatient(${p.id})" title="Editar">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="icon-btn" onclick="deletePatient(${p.id})" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>`
    )
    .join("");
  } catch (err) {
    console.error("❌ Error:", err);
    tbody.innerHTML = `<tr><td colspan="6">Error al cargar pacientes</td></tr>`;
  }
}

// ================================
// 👩‍⚕️ Asignar psicólogo a un paciente
// ================================
async function assignPsychologist(patientId) {
  try {
    // 1️⃣ Obtener todos los psicólogos
    const res = await fetch(`${API_URL}/admin/psychologists`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const psychologists = await res.json();

    if (!Array.isArray(psychologists) || psychologists.length === 0) {
      alert("No hay psicólogos disponibles para asignar.");
      return;
    }

    // 2️⃣ Mostrar lista y permitir elegir
    let options = psychologists
      .map((p) => `${p.id}: ${p.first_name || ""} ${p.last_name || ""} (${p.email})`)
      .join("\n");
    const input = prompt(
      `Selecciona el ID del psicólogo para este paciente:\n\n${options}\n\nIngresa el ID:`
    );

    const psychologistId = parseInt(input);
    if (isNaN(psychologistId)) {
      alert("ID inválido. Asignación cancelada.");
      return;
    }

    // 3️⃣ Enviar asignación al backend
    const assignRes = await fetch(`${API_URL}/admin/assign_patient`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ patient_id: patientId, psychologist_id: psychologistId }),
    });

    if (assignRes.ok) {
      const data = await assignRes.json();
      alert("✅ " + data.message);
    } else {
      const err = await assignRes.json();
      alert("❌ Error: " + (err.detail || "No se pudo asignar el psicólogo"));
    }
  } catch (err) {
    console.error("❌ Error:", err);
    alert("Ocurrió un error al asignar el psicólogo");
  }
}

// ================================
// 🗑️ Eliminar paciente
// ================================
async function deletePatient(id) {
  if (!confirm("¿Seguro que deseas eliminar este paciente?")) return;

  try {
    const res = await fetch(`${API_URL}/admin/patients/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      alert("Paciente eliminado correctamente");
      loadPatients();
    } else {
      alert("Error al eliminar");
    }
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

// ================================
// ➕ Añadir paciente
// ================================
document.getElementById("btn-add-paciente").addEventListener("click", async () => {
  const dni = prompt("DNI o documento nacional:");
  const nombre = prompt("Nombre del paciente:");
  const apellido = prompt("Apellido:");
  const genero = prompt("Género (masculino/femenino/otro):");
  const nacimiento = prompt("Fecha de nacimiento (YYYY-MM-DD):");
  const telefono = prompt("Teléfono:");
  const direccion = prompt("Dirección:");
  const ciudad = prompt("Ciudad:");
  const pais = prompt("País:");
  const correo = prompt("Correo electrónico:");
  const password = prompt("Contraseña inicial (opcional):", "123456");
  const estado = prompt("Estado (activo/bloqueado/rechazado):", "activo");

  if (!nombre || !correo) {
    alert("Debe ingresar al menos el nombre y correo");
    return;
  }

  const data = {
    dni,
    first_name: nombre,
    last_name: apellido,
    gender: genero,
    birth_date: nacimiento ? new Date(nacimiento).toISOString() : null,
    phone: telefono,
    address: direccion,
    city: ciudad,
    country: pais,
    email: correo,
    password,
    status: estado,
  };

  try {
    const res = await fetch(`${API_URL}/admin/patients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      alert("Paciente agregado correctamente ✅");
      loadPatients();
    } else {
      const err = await res.json();
      alert("Error: " + (err.detail || "No se pudo crear el paciente"));
    }
  } catch (err) {
    console.error("❌ Error:", err);
  }
});

// ================================
// 🚀 Inicializar
// ================================
document.addEventListener("DOMContentLoaded", loadPatients);
