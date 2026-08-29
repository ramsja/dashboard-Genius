/**
 * FUNCIONES DE EXPORTACIÓN
 * CSV, Excel, JSON para todos los datos
 */

const fs = require('fs');
const path = require('path');

// CSV Generator
function generarCSV(datos, columnas) {
  const headers = columnas.join(',');
  const rows = datos.map(row =>
    columnas.map(col => {
      const valor = row[col];
      // Escapar comillas y envolver en comillas si contiene coma
      if (typeof valor === 'string' && (valor.includes(',') || valor.includes('"'))) {
        return `"${valor.replace(/"/g, '""')}"`;
      }
      return valor || '';
    }).join(',')
  );
  return [headers, ...rows].join('\n');
}

// Generar reporte de usuarios
function reporteUsuarios(datos) {
  const columnas = ['id', 'username', 'email', 'estado', 'casa_apuestas', 'last_activity', 'created_at'];
  return generarCSV(datos, columnas);
}

// Generar reporte de transacciones
function reporteTransacciones(datos) {
  const columnas = ['id', 'usuario_id', 'tipo', 'monto', 'moneda', 'saldo_posterior', 'comision', 'descripcion', 'created_at'];
  return generarCSV(datos, columnas);
}

// Generar reporte de estadísticas
function reporteEstadisticas(datos) {
  const columnas = ['fecha', 'total_usuarios', 'usuarios_activos', 'usuarios_inactivos', 'total_depositos', 'total_retiros', 'comisiones_totales'];
  return generarCSV(datos, columnas);
}

// Generar Excel (simple con CSV adaptado)
function generarExcelSimple(datos, columnas, nombreHoja) {
  // Para Excel real necesitaríamos librería, pero aquí generamos CSV compatible
  return generarCSV(datos, columnas);
}

// Generar resumen en JSON
function generarJSON(datos, nombre) {
  return JSON.stringify({
    nombre,
    fecha: new Date().toISOString(),
    total_registros: datos.length,
    datos
  }, null, 2);
}

// Crear archivo descargable
function crearArchivo(contenido, nombreArchivo, res) {
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(contenido);
}

module.exports = {
  reporteUsuarios,
  reporteTransacciones,
  reporteEstadisticas,
  generarCSV,
  generarJSON,
  crearArchivo
};
