# Panel Sensorial (Firebase)

App web para análisis sensorial descriptivo con **varios estudios a la vez**, sesiones, repeticiones y diseño de Williams.
Los datos se guardan en **Firebase (Firestore)**; la app se publica en GitHub Pages.

- **Panelistas:** https://anibalacatania.github.io/panel/
- **Administración:** https://anibalacatania.github.io/panel/#admin (entrar con cuenta de Google)
- **Consola de Firebase:** proyecto `panel-sensorial` (plan gratuito Spark, base de datos en São Paulo)

## Cómo se usa

### Administración (`#admin`)
1. **Entrar con Google.** La primera vez, la primera cuenta que entra se registra como administradora.
   Después se agregan otras cuentas en **Administradores**.
2. **Nuevo estudio:** nombre, vinos (uno por línea), repeticiones, vinos por sesión, panelistas, atributos →
   **Generar vista previa** → **Crear y publicar**.
   - Repetición = cuántas veces pasa cada vino por el panel. Sesión = cada reunión.
   - 8 vinos × 3 rep = 24 muestras; de a 6 → 4 sesiones; de a 7 → 7+7+7+3 (o 6+6+6+6 con “repartir parejo”).
   - Un vino nunca se repite dentro de una sesión. Orden por panelista: cuadrado de Williams.
   - Códigos de 3 dígitos únicos en todo el estudio. Misma semilla + mismos datos = mismo diseño.
3. Dentro de cada estudio:
   - **Progreso** en vivo (panelista × sesión).
   - **Planilla de servicio** imprimible (vino → repetición → código, y bandeja de cada panelista).
   - **Resultados:** descarga en CSV para R (coma y punto decimal) o para Excel en español (punto y coma y coma decimal),
     con `NombreProducto` y `Rep` ya incluidos.
   - **Configuración:** link directo para panelistas (`?e=<id>`, útil para un QR), cerrar/reabrir, renombrar, borrar.

### Panelistas
Eligen el estudio (si hay uno solo, entra directo), su número, y la sesión. Cada muestra se guarda al instante en el
dispositivo y se sube sola (funciona aunque se corte internet). Al completar una sesión queda deshabilitada.
Los nombres de los vinos **nunca llegan al dispositivo del panelista** (cata a ciegas).

## Datos en Firestore
| Ruta | Contenido | Quién lee |
|---|---|---|
| `estudios/{id}` | nombre, activo, atributos, sesiones, panelistas | todos |
| `estudios/{id}/publico/diseno` | Sesión, panelista, orden, código | todos |
| `estudios/{id}/privado/diseno` | + vino y repetición, parámetros del diseño | administradores |
| `estudios/{id}/respuestas/{V_S_O}` | valores por atributo | administradores |
| `estudios/{id}/progreso/{V}` | muestras respondidas por sesión | todos |
| `admins/{email}` | administradores | administradores |

Las reglas de seguridad están en `firestore.rules` (se publican en la consola: Firestore → Reglas).

## Modificar la app
El código está en `src/`. `index.html` y `app.js` se generan:
```bash
npm i -D esbuild firebase react@18 react-dom@18 tailwindcss@3
node src/build.mjs            # versión real
node src/build.mjs --prueba   # versión con datos simulados para probar (no publicar)
```
`config.json` tiene la configuración web de Firebase (es pública por diseño; la seguridad la dan las reglas).
