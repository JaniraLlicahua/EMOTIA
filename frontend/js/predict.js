// backend/static/js/predict.js
const form = document.getElementById('predictForm');
const fileInput = document.getElementById('fileInput');
const resultDiv = document.getElementById('result');
const preview = document.getElementById('preview');

fileInput.addEventListener('change', e=>{
  const f = e.target.files[0];
  preview.innerHTML = '';
  if(!f) return;
  const img = document.createElement('img');
  img.src = URL.createObjectURL(f);
  preview.appendChild(img);
});

form.addEventListener('submit', async e=>{
  e.preventDefault();
  const file = fileInput.files[0];
  if(!file) { alert('Selecciona una imagen'); return; }
  const fd = new FormData();
  fd.append('file', file);

  resultDiv.innerHTML = 'Procesando...';
  try {
    const res = await fetch('/predict', { method:'POST', body: fd });
    if(!res.ok){
      const txt = await res.text();
      resultDiv.innerHTML = 'Error: ' + txt;
      return;
    }
    const data = await res.json();
    resultDiv.innerHTML = `<p>Emoción: <strong>${data.emotion}</strong> — Confianza: ${(data.confidence*100).toFixed(2)}%<br/>ID: ${data.detection_id}</p>`;
  } catch(err){
    resultDiv.innerHTML = 'Error: ' + err;
  }
});

document.getElementById('loadStats').addEventListener('click', async ()=>{
  try {
    const res = await fetch('/stats/emotions');
    const data = await res.json();
    let html = '<ul>';
    for(const k in data) html += `<li>${k}: ${data[k]}</li>`;
    html += '</ul>';
    document.getElementById('stats').innerHTML = html;
  } catch(err){
    document.getElementById('stats').innerText = "Error cargando stats: " + err;
  }
});

document.getElementById('loadDetections').addEventListener('click', async ()=>{
  try {
    const res = await fetch('/detections');
    const data = await res.json();
    if(!Array.isArray(data)){ document.getElementById('detections').innerText = JSON.stringify(data); return; }
    let html = '<table><tr><th>ID</th><th>Imagen</th><th>Emoción</th><th>Confianza</th><th>Fecha</th></tr>';
    for(const d of data){
      html += `<tr><td>${d.id}</td><td>${d.image_name}</td><td>${d.emotion}</td><td>${d.confidence}</td><td>${d.detected_at}</td></tr>`;
    }
    html += '</table>';
    document.getElementById('detections').innerHTML = html;
  } catch(err){
    document.getElementById('detections').innerText = "Error cargando historial: " + err;
  }
});
