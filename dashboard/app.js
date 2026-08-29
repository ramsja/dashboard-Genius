const summaryUrl = '../reportes/clientes-resumen.json';
const fieldsUrl = '../reportes/resumen-campos.json';

async function main() {
  try {
    const [summaryRes, fieldsRes] = await Promise.all([
      fetch(summaryUrl),
      fetch(fieldsUrl)
    ]);

    if (!summaryRes.ok || !fieldsRes.ok) {
      throw new Error('Resumen no disponible');
    }

    const summary = await summaryRes.json();
    const fields = await fieldsRes.json();
    const summaryDiv = document.getElementById('summary');

    const totals = summary.totals || {};
    summaryDiv.innerHTML = `
      <div class="stat"><strong>Activos:</strong> ${totals.activo ?? 0}</div>
      <div class="stat"><strong>Inactivos:</strong> ${totals.inactivo ?? 0}</div>
      <div class="stat"><strong>Desconectados:</strong> ${totals.desconectado ?? 0}</div>
      <div class="stat"><strong>Suspendidos:</strong> ${totals.suspendido ?? 0}</div>
      <div class="stat"><strong>Otros:</strong> ${totals.otros ?? 0}</div>
      <div class="stat" style="margin-top: 12px; font-size: 12px; color: #a7b9d8;"><strong>Actualizado:</strong> ${summary.generated_at}</div>
    `;
  } catch (error) {
    document.getElementById('summary').innerHTML = '<p>Error cargando datos del dashboard.</p>';
    console.error(error);
  }
}

main();
