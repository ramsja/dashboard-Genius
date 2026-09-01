// Configuración del dashboard.
// Copia este archivo como config.js y edita tus valores. NO subas config.js con datos reales.
// config.js ya está excluido en .gitignore.
window.DASHBOARD_CONFIG = {
  // Snapshot JSON local (se genera con extraccionDatos.py -> reportes/dashboard-data.json).
  snapshotUrl: './data/snapshot.json',

  // Supabase (opcional). Para consultar la vista agregada en vivo, activa enabled,
  // completa URL y anonKey, y asegúrate de que la vista tenga política de lectura pública.
  supabase: {
    enabled: false,
    url: 'https://TU-PROYECTO.supabase.co',
    anonKey: 'TU_ANON_KEY',
    view: 'transaction_discipline_summary',
  },
};