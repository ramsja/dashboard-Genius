const fs = require('fs');
const path = require('path');

const REPORTES_DIR = path.join(__dirname, 'reportes');

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function updateData() {
  try {
    // Leer datos actuales
    const resumenPath = path.join(REPORTES_DIR, 'clientes-resumen.json');
    const resumen = JSON.parse(fs.readFileSync(resumenPath, 'utf8'));

    // Simular cambios realistas (variación pequeña)
    const multiplier = 0.95 + Math.random() * 0.1; // Entre 0.95 y 1.05

    resumen.totals.activo = Math.round(resumen.totals.activo * multiplier);
    resumen.totals.inactivo = Math.round(resumen.totals.inactivo * multiplier);
    resumen.totals.desconectado = Math.round(resumen.totals.desconectado * multiplier);
    resumen.totals.suspendido = Math.round(resumen.totals.suspendido * multiplier);
    resumen.totals.otros = Math.round(resumen.totals.otros * multiplier);

    // Actualizar por disciplina
    if (resumen.status_by_discipline) {
      Object.keys(resumen.status_by_discipline).forEach(discipline => {
        const m = 0.95 + Math.random() * 0.1;
        resumen.status_by_discipline[discipline].activo = Math.round(
          resumen.status_by_discipline[discipline].activo * m
        );
        resumen.status_by_discipline[discipline].inactivo = Math.round(
          resumen.status_by_discipline[discipline].inactivo * m
        );
        resumen.status_by_discipline[discipline].desconectado = Math.round(
          resumen.status_by_discipline[discipline].desconectado * m
        );
        resumen.status_by_discipline[discipline].suspendido = Math.round(
          resumen.status_by_discipline[discipline].suspendido * m
        );
        resumen.status_by_discipline[discipline].otros = Math.round(
          resumen.status_by_discipline[discipline].otros * m
        );
      });
    }

    // Actualizar timestamp
    const now = new Date();
    resumen.generated_at = now.toLocaleString('es-SV', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC'
    }) + ' UTC';

    // Escribir archivo actualizado
    fs.writeFileSync(resumenPath, JSON.stringify(resumen, null, 2));
    console.log(`✅ Datos actualizados - ${resumen.generated_at}`);
  } catch (err) {
    console.error('❌ Error actualizando datos:', err);
  }
}

// Actualizar cada 5 segundos
const interval = setInterval(updateData, 5000);

console.log('🚀 Iniciando simulación de actualizaciones cada 5 segundos...');
console.log('Presiona Ctrl+C para detener\n');

// Primera actualización inmediata
updateData();

// Manejo de Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Simulación detenida');
  clearInterval(interval);
  process.exit(0);
});
