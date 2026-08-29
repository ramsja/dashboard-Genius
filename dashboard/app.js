const summaryUrl = '../reportes/clientes-resumen.json';

async function main() {
  try {
    const response = await fetch(summaryUrl);
    if (!response.ok) throw new Error('Resumen no disponible');
    const data = await response.json();
    const summary = document.getElementById('summary');
    summary.innerHTML = `
      <div class="stat"><strong>Activos:</strong> ${data.active}</div>
      <div class="stat"><strong>Inactivos:</strong> ${data.inactive}</div>
      <div class="stat"><strong>Desconectados:</strong> ${data.disconnected}</div>
      <div class="stat"><strong>Suspendidos:</strong> ${data.suspended}</div>
      <div class="stat"><strong>Otros:</strong> ${data.other}</div>
    `;
  } catch (error) {
    document.getElementById('summary').innerHTML = '<p>Error cargando datos del dashboard.</p>';
    console.error(error);
  }
}

main();
