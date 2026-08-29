#!/usr/bin/env node
/**
 * DEPRECADO: usar `node server-db.js` directamente (ver Procfile).
 *
 * Este script antes bloqueaba el arranque ejecutando la sincronización
 * completa de Novusbet (hasta 10-15 min) ANTES de abrir el puerto HTTP,
 * lo que hacía que Render matara el proceso por timeout de deploy.
 * server-db.js ahora hace login/carga de admin/sincronización en paralelo
 * después de abrir el puerto, así que este archivo solo reenvía a él.
 */

require('./server-db.js');
