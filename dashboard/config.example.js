// Configuración del dashboard.
// Copia este archivo como config.js y edita tus valores. NO subas config.js con datos reales.
// config.js ya está excluido en .gitignore.
window.DASHBOARD_CONFIG = {
  // Snapshot JSON local (lo generan los scripts construir-*.py). Es el respaldo:
  // si la API no responde, el dashboard sigue funcionando con este archivo.
  snapshotUrl: './data/snapshot.json',

  // API del Worker sobre Cloudflare D1 (cloudflare/worker.js). Devuelve la misma
  // forma que snapshot.json. La página no lleva ninguna credencial: el Worker
  // ejecuta consultas fijas y solo responde agregados.
  api: {
    enabled: false,
    url: 'https://dashboard-genius-api.TU-CUENTA.workers.dev',
  },
};
