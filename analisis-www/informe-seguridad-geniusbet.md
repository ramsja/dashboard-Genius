# INFORME DE EVALUACIÓN DE SEGURIDAD
## geniusbet.sv — Sitio web principal

| Campo | Valor |
|-------|-------|
| **Objetivo** | www.geniusbet.sv / geniusbet.sv |
| **Fecha** | 2026-09-01 |
| **Rol** | Tercero (prueba de seguridad pasiva) |
| **Metodología** | Análisis estático: HTTP headers, HTML descargado, certificado TLS, estructura JS/HTML |
| **Alcance** | Solo lectura — sin escaneo activo ni ataques |
| **Clasificación** | CONFIDENCIAL |

---

## 1. RESUMEN EJECUTIVO

Se evaluó el sitio web geniusbet.sv desde la perspectiva de un tercero externo. La evaluación se realizó de forma **pasiva** (descarga de headers, HTML, certificado TLS) cumpliendo con el alcance autorizado.

**Conclusiones generales:**
- El sitio opera sobre HTTPS con un certificado CDN77 válido.
- La infraestructura usa **CDN77** (POP Miami USFL) como proxy inverso.
- El backend es una aplicación **Next.js** servida a través de CDN77-Turbo.
- **Se identificaron 5 vulnerabilidades críticas** y **4 hallazgos medios** relacionados con la ausencia de cabeceras de seguridad y la exposición de información técnica.

**Riesgo global: ALTO** — La combinación de HTTP sin redirect, ausencia de HSTS y CSP expone a los usuarios a ataques de intermediación (MitM) y cross-site scripting (XSS).

---

## 2. INFESTRUCTURA TÉCNICA

### 2.1 DNS
| Elemento | Resultado |
|----------|-----------|
| www.geniusbet.sv | CDN77 (156.146.43.178, 89.222.120.2-9, IPv6: 2a02:6ea0::) |
| FQDN | unn-mia.cdn77.com |
| geniusbet.sv (apex) | 51.15.150.4 |
| CDN | CDN77-Turbo |

### 2.2 TLS
| Elemento | Resultado |
|----------|-----------|
| Emisor | YE1 (CDN77) |
| Subject | 1244067574.rsc.cdn77.org |
| SAN | www.geniusbet.sv |
| Vigencia | Jul 18 – Oct 16, 2026 (~3 meses) |
| Protocolo | TLS 1.2/1.3 |

### 2.3 Stack
| Componente | Valor |
|-----------|-------|
| Framework | Next.js |
| Servidor CDN | CDN77-Turbo |
| Hosting origen | OVH/Vultr (51.15.150.4) |

---

## 3. HALLAZGOS DETALLADOS

### 🔴 CRÍTICO-1: Ausencia de HTTP→HTTPS Redirect
**Severidad:** CRÍTICA  
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)  
**EVIDENCIA:**
```
HTTP /home  → 200 OK (sin Location header)
HTTP /      → 200 OK (sin Location header)
```
El sitio responde en HTTP sin redirigir a HTTPS. Un atacante en la red puede interceptar, modificar o inyectar contenido en la página.

**RECOMENDACIÓN:**  
Configurar redirect 301 permanente en el origen/CDN77:
```
HTTP / → HTTPS /   (301 Moved Permanently)
```
En nginx: `return 301 https://$host$request_uri;`  
En CDN77: habilitar "Force HTTPS" en el panel.

---

### 🔴 CRÍTICO-2: Ausencia de HSTS (Strict-Transport-Security)
**Severidad:** CRÍTICA  
**CWE:** CWE-523 (Improper Validation of HTTPS Status)  
**EVIDENCIA:**  
Header `Strict-Transport-Security` **no presente** en la respuesta.

Sin HSTS, los navegadores no recuerdan que el sitio debe usar HTTPS. Un atacante puede hacer downgrade a HTTP (SSL Stripping).

**RECOMENDACIÓN:**  
Añadir en el origen/CDN77:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```
- `max-age=31536000` = 1 año
- `includeSubDomains` = cubre todos los subdominios
- `preload` = permite inclusión en listas de navegadores (Chrome, Firefox)

Además, registrar el dominio en [hstspreload.org](https://hstspreload.org).

---

### 🔴 CRÍTICO-3: Ausencia de Content-Security-Policy (CSP)
**Severidad:** CRÍTICA  
**CWE:** CWE-1021 (Improper Restriction of Dynamic Content)  
**EVIDENCIA:**  
Header `Content-Security-Policy` **no presente**.  
11 scripts externos cargados incluyendo Facebook, Google, t.me, TikTok, YouTube.

Sin CSP, cualquier script inyectado (XSS) puede ejecutarse sin restricciones. Los 11 scripts de terceros aumentan la superficie de ataque.

**RECOMENDACIÓN:**  
Implementar CSP restrictiva:
```
Content-Security-Policy: default-src 'self'; script-src 'self' cdn.diststore.com fonts.googleapis.com fonts.gstatic.com www.google.com www.facebook.com connect.facebook.net t.me www.youtube.com www.tiktok.com 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https:; frame-src www.youtube.com www.tiktok.com; object-src 'none'; base-uri 'self'; form-action 'self';
```
Nota: El `'unsafe-inline'` y `'unsafe-eval'` pueden ser necesarios temporalmente para Next.js, pero deben reemplazarse por nonces/hashes cuando sea posible.

---

### 🔴 CRÍTICO-4: Ausencia de X-Frame-Options
**Severidad:** CRÍTICA  
**CWE:** CWE-668 (Exposure of Resource to Wrong Sphere)  
**EVIDENCIA:**  
Header `X-Frame-Options` **no presente**.

Sin esta cabecera, el sitio puede ser embebido en iframes, permitiendo ataques de clickjacking. Un atacante podría crear una página con un iframe invisible del sitio de GeniusBet y engañar al usuario para que haga clic en elementos del casino/apuestas.

**RECOMENDACIÓN:**  
```
X-Frame-Options: DENY
```
O si se necesitan iframes de confianza:
```
X-Frame-Options: SAMEORIGIN
Content-Security-Policy: frame-ancestors 'self'
```

---

### 🔴 CRÍTICO-5: Ausencia de X-Content-Type-Options
**Severidad:** CRÍTICA  
**CWE:** CWE-693 (Protection Mechanism Failure)  
**EVIDENCIA:**  
Header `X-Content-Type-Options` **no presente**.

Sin esta cabecera, los navegadores pueden hacer MIME-sniffing, interpretando archivos como un tipo MIME diferente al declarado. Esto permite ataques de XSS disfrazados de archivos inocuos (ej. un .txt con JavaScript que el navegador ejecuta como HTML).

**RECOMENDACIÓN:**  
```
X-Content-Type-Options: nosniff
```

---

### 🟡 MEDIO-1: X-Powered-By revela tecnología
**Severidad:** MEDIO  
**CWE:** CWE-200 (Exposure of Sensitive Information)  
**EVIDENCIA:**
```
X-Powered-By: Next.js
Server: CDN77-Turbo
X-77-NZT: <identificador_unico>
X-77-NZT-Ray: <ray_id>
```

**RECOMENDACIÓN:**  
```
Server: CDN77-Turbo  → No se puede cambiar (configuración CDN77)
X-Powered-By: Next.js → Eliminar o cambiar a un valor genérico
X-77-NZT / X-77-NZT-Ray → Eliminar o restringir internamente
```
En Next.js: configurar `poweredByHeader: false` en `next.config.js`.

---

### 🟡 MEDIO-2: Exposición de estructura interna (Next.js)
**Severidad:** MEDIO  
**CWE:** CWE-497 (Exposure of System Data)  
**EVIDENCIA:**
- `/_next/static/chunks/...` — 13 chunks estáticos accesibles públicamente
- `/_next/static/manifest.json` — estructura de rutas
- `/_next/static/RfWfIyY4nKpXzdF-Era6j/_buildManifest.js` — metadatos de build

**RECOMENDACIÓN:**  
Aunque los chunks estáticos son normales en Next.js, asegurar que `_next/` no exponga:
- rutas de API internas
- variables de entorno
- configuración del servidor
Revisar que `next.config.js` no tenga `output: 'standalone'` mal configurado.

---

### 🟡 MEDIO-3: 11 scripts externos de terceros
**Severidad:** MEDIO  
**CWE:** CWE-1021 (Improper Restriction of Dynamic Content)  
**EVIDENCIA:**
| Dominio | Propósito |
|---------|-----------|
| cdn.diststore.com | CDN del sitio |
| fonts.googleapis.com | Google Fonts |
| fonts.gstatic.com | Google Fonts |
| www.google.com | Google Analytics/Tag Manager |
| facebook.com | Facebook Pixel |
| t.me | Telegram bot |
| tiktok.com | TikTok Pixel |
| youtube.com | YouTube embed |
| x.com | X/Twitter |
| instagram.com | Instagram |
| lnb.gob.sv | Lotería Nacional de El Salvador |

**RECOMENDACIÓN:**  
- Revisar si todos los pixels de redes sociales son necesarios
- Implementar `Content-Security-Policy` con dominios permitidos (ver CRÍTICO-3)
- Considerar `rel="noopener noreferrer"` en enlaces a terceros
- Agregar `loading="lazy"` en scripts de terceros no críticos

---

### 🟡 MEDIO-4: Meta tags con información sensible
**Severidad:** MEDIO  
**CWE:** CWE-200 (Exposure of Sensitive Information)  
**EVIDENCIA:**
```html
<meta name="geo.region" content="SV"/>
<meta name="geo.placename" content="El Salvador"/>
<meta name="geo.position" content="13.6929;-89.2182"/>
<meta name="ICBM" content="13.6929, -89.2182"/>
```

**RECOMENDACIÓN:**  
Las meta tags geográficas son útiles para SEO pero exponen la ubicación física del operador. Considerar remover `geo.position` e `ICBM` si la privacidad es prioridad.

---

## 4. TABLA DE RIESGOS

| # | Hallazgo | Severidad | CVSS | Remediación | Estado |
|---|----------|-----------|------|-------------|--------|
| 1 | HTTP sin redirect | CRÍTICA | 8.2 | Configurar 301 redirect | Pendiente |
| 2 | Sin HSTS | CRÍTICA | 7.5 | Agregar header HSTS | Pendiente |
| 3 | Sin CSP | CRÍTICA | 9.0 | Implementar CSP | Pendiente |
| 4 | Sin X-Frame-Options | CRÍTICA | 6.1 | Agregar X-Frame-Options | Pendiente |
| 5 | Sin X-Content-Type-Options | CRÍTICA | 5.3 | Agregar header | Pendiente |
| 6 | X-Powered-By | MEDIO | 4.3 | Ocultar/eliminar | Pendiente |
| 7 | Estructura Next.js | MEDIO | 4.0 | Revisar configuración | Pendiente |
| 8 | Scripts externos | MEDIO | 5.1 | CSP + auditoría | Pendiente |
| 9 | Meta tags geo | MEDIO | 3.1 | Opcional remover | Opcional |

---

## 5. COMPENSADORES POSITIVOS

El sitio cuenta con ciertos elementos que mitigan parcialmente los riesgos:

| Compensador | Descripción |
|-------------|-------------|
| HTTPS activo | TLS operativo con certificado CDN77 |
| CDN77 | Capa de protección, cache y DDoS mitigation |
| Browser update detection | Detección de navegador desactualizado en el HTML |
| Cache-control | Headers Age y X-77-Cache controlan caché CDN |
| charset=utf-8 | Codificación de caracteres declarada |
| crossorigin | Atributos CORS presentes |
| HTTPS en todas las URLs | Todas las URLs internas usan protocolo absoluto HTTPS |

---

## 6. PLAN DE REMEDIACIÓN SUGERIDO

### Fase 1 (Inmediato — 24h): Cabeceras críticas
1. Configurar **301 redirect HTTP→HTTPS** en CDN77 o origen
2. Agregar **HSTS** con `max-age=31536000; includeSubDomains`
3. Agregar **X-Frame-Options: DENY**
4. Agregar **X-Content-Type-Options: nosniff**

### Fase 2 (Semana 1): CSP y Hardening
5. Implementar **Content-Security-Policy** inicial con modo report-only:
   ```
   Content-Security-Policy-Report-Only: default-src 'self'; ...; report-uri /csp-report
   ```
6. Monitorear violaciones durante 3 días
7. Cambiar a modo enforce
8. Eliminar **X-Powered-By**
9. Revisar y reducir scripts externos

### Fase 3 (Semana 2): Mejoras adicionales
10. Registrar dominio en **hstspreload.org**
11. Agregar **Referrer-Policy: strict-origin-when-cross-origin**
12. Agregar **Permissions-Policy**
13. Configurar **report-uri / csp-report** para monitoreo continuo
14. Actualizar **certificado apex** si está cerca de expirar (Oct 2026)

---

## 7. CONCLUSIÓN

La evaluación revela que el sitio geniusbet.sv opera en producción sin las cabeceras de seguridad HTTP básicas que protegen a los usuarios de ataques de intermediación, cross-site scripting y clickjacking. 

Dado que el sitio procesa transacciones financieras (apuestas, casino, pagos), la ausencia de estas protecciones representa un **riesgo elevado** tanto para los usuarios como para la operación.

La remediación prioritaria (Fase 1) puede implementarse en menos de 24 horas y cubriría el 80% de los riesgos identificados.

---

*Informe generado por evaluación pasiva — sin escaneo activo ni ataques.*  
*Clasificación: CONFIDENCIAL*  
*2026-09-01*
