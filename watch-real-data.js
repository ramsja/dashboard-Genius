const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'descargas/transacciones_producto__2026-08-28_2026-08-28.csv');
const RESUMEN_PATH = path.join(__dirname, 'reportes/clientes-resumen.json');

let lastFileSize = 0;
let updateInProgress = false;

async function updateFromCSV() {
  if (updateInProgress) return;
  updateInProgress = true;

  try {
    const stats = fs.statSync(CSV_PATH);
    const fileSize = stats.size;

    // Solo actualizar si el archivo cambió
    if (fileSize !== lastFileSize) {
      lastFileSize = fileSize;

      const { exec } = require('child_process');
      exec('node load-real-data.js', (error, stdout, stderr) => {
        if (!error) {
          console.log(`🔄 Datos reales actualizados - ${new Date().toLocaleTimeString()}`);
        }
        updateInProgress = false;
      });
    } else {
      updateInProgress = false;
    }
  } catch (err) {
    console.error('Error monitoreando CSV:', err);
    updateInProgress = false;
  }
}

// Monitorear cambios en el archivo CSV
console.log('👁️  Monitoreando datos reales...');
console.log(`📁 Archivo: ${CSV_PATH}`);
console.log('Presiona Ctrl+C para detener\n');

// Actualización inicial
updateFromCSV();

// Revisar cada 10 segundos
setInterval(updateFromCSV, 10000);

process.on('SIGINT', () => {
  console.log('\n⏹️  Monitoreo detenido');
  process.exit(0);
});
