// adminReportes.js
const API_URL = "http://127.0.0.1:8000";
const token = localStorage.getItem("token");

document.addEventListener("DOMContentLoaded", () => {
  loadSummary();
  loadReports();
});

// ===============================
// 📊 Cargar resumen del dashboard
// ===============================
async function loadSummary() {
  try {
    const res = await fetch(`${API_URL}/admin/reports/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Error al obtener resumen");
    const data = await res.json();

    document.getElementById("total-patients").textContent = data.total_patients;
    document.getElementById("active-psychologists").textContent = data.active_psychologists;
    document.getElementById("avg-progress").textContent = `${data.avg_progress}%`;
    document.getElementById("top-psychologist").textContent = data.top_psychologist || "--";

    drawCharts(data);
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

// ===============================
// 🧾 Cargar lista de reportes
// ===============================
async function loadReports() {
  const tbody = document.getElementById("reports-table-body");
  tbody.innerHTML = `<tr><td colspan="7">Cargando...</td></tr>`;

  try {
    const res = await fetch(`${API_URL}/admin/reports`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Error al obtener reportes");
    const reports = await res.json();

    if (reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">No hay reportes generados.</td></tr>`;
      return;
    }

    tbody.innerHTML = reports
      .map(
        (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.patient_name || "-"}</td>
        <td>${r.psychologist_name || "-"}</td>
        <td>${r.created_at || "-"}</td>
        <td>${r.progress_percent}%</td>
        <td>${r.status}</td>
        <td>
          <button class="btn small">Ver</button>
          <button class="btn small danger" onclick="deleteReport(${r.id})">Eliminar</button>
        </td>
      </tr>`
      )
      .join("");
  } catch (err) {
    console.error("❌ Error:", err);
    tbody.innerHTML = `<tr><td colspan="7">Error al cargar reportes.</td></tr>`;
  }
}

// ===============================
// ❌ Eliminar reporte
// ===============================
async function deleteReport(id) {
  if (!confirm("¿Desea eliminar este reporte?")) return;
  try {
    const res = await fetch(`${API_URL}/admin/reports/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      alert("Reporte eliminado correctamente ✅");
      loadReports();
    } else {
      alert("Error al eliminar reporte");
    }
  } catch (err) {
    console.error("❌", err);
  }
}

// ===============================
// 📈 Dibujar gráficos con Chart.js
// ===============================
function drawCharts(data) {
  // Progreso mensual
  new Chart(document.getElementById("patientsProgressChart"), {
    type: "bar",
    data: {
      labels: data.months,
      datasets: [{
        label: "Progreso Promedio (%)",
        data: data.progress_by_month,
        backgroundColor: "#6c63ff",
      }],
    },
  });

  // Distribución por especialidad
  new Chart(document.getElementById("specialtyChart"), {
    type: "pie",
    data: {
      labels: Object.keys(data.specialties),
      datasets: [{
        data: Object.values(data.specialties),
        backgroundColor: ["#6c63ff", "#00bfa5", "#ffb400", "#ff5252"],
      }],
    },
  });

  // Sesiones semanales
  new Chart(document.getElementById("sessionsChart"), {
    type: "line",
    data: {
      labels: data.weeks,
      datasets: [{
        label: "Sesiones",
        data: data.sessions_per_week,
        borderColor: "#00bfa5",
        fill: false,
      }],
    },
  });
}
