const API_URL = "http://127.0.0.1:8000";

document.addEventListener("DOMContentLoaded", () => {
    const btnEditar = document.querySelector(".btn-editar");
    const form = document.getElementById("crear-reporte");
    const btnGuardar = document.getElementById("btn-guardar-reporte");
    const pacienteSelect = document.getElementById("paciente");

    const token = localStorage.getItem("token");

    // 🔹 Cargar pacientes asignados al psicólogo
    async function loadPacientes() {
        try {
        const res = await fetch(`${API_URL}/psychologist/reports/patients`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("No se pudieron cargar los pacientes");
        const pacientes = await res.json();

        pacienteSelect.innerHTML = "";
        if (pacientes.length === 0) {
            pacienteSelect.innerHTML = `<option value="">No hay pacientes con emociones detectadas</option>`;
        } else {
            pacientes.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.username;
            pacienteSelect.appendChild(opt);
            });
        }
        } catch (err) {
        alert(`Error: ${err.message}`);
        }
    }

    // Mostrar/ocultar formulario
    btnEditar.addEventListener("click", () => {
        form.style.display = form.style.display === "none" ? "block" : "none";
        if (form.style.display === "block") {
        loadPacientes();
        }
    });

    // 🔹 Guardar nuevo reporte
    btnGuardar.addEventListener("click", async () => {
        const patient_id = pacienteSelect.value;
        const progress_percent = document.getElementById("progreso").value;
        const summary = document.getElementById("resumen").value;

        if (!patient_id) return alert("Selecciona un paciente");
        if (!summary.trim()) return alert("Por favor escribe un resumen");

        try {
        const res = await fetch(`${API_URL}/psychologist/reports/`, {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ patient_id, progress_percent, summary })
        });

        if (!res.ok) throw new Error("Error al crear el reporte");

        const data = await res.json();
        alert(`✅ Reporte creado correctamente (ID: ${data.report_id})`);
        form.style.display = "none";
        document.getElementById("resumen").value = "";
        } catch (err) {
        alert(`❌ ${err.message}`);
        }
    });
});
