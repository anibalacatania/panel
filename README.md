# panel

Panel sensorial en la nube para **Análisis Descriptivo Cuantitativo**, con la misma vista que
[LibreSense-R](https://github.com/anibalacatania/LibreSense-R) (`run_panel()` y `run_board()`),
pero publicado en GitHub Pages y con los datos en Firebase (el mismo proyecto que usa
[LibreSense](https://github.com/anibalacatania/libresense)). Funcionan **varios paneles a la vez**:
cada uno tiene su link y su QR.

- **Panelistas:** `https://anibalacatania.github.io/panel/?p=<id del panel>`
  (sin `?p=`: si hay un solo panel abierto entra directo; si hay varios, elige el panel de una lista)
- **Administración:** `https://anibalacatania.github.io/panel/admin.html` (entrar con Google; mismos administradores que LibreSense)
- **Tablero de cada panel:** `https://anibalacatania.github.io/panel/tablero.html?p=<id>` (se abre con el botón *Tablero*)
- **Prueba sin tocar datos reales:** agregar `?demo` a cualquiera de las tres direcciones
  (por ejemplo `admin.html?demo`); guarda todo solo en ese navegador.

## Lo que ve el panelista (igual que `run_panel()`)
Mismo tema oscuro *cyborg*, mismos controles y mismos mensajes (se usan los CSS y JS originales de Shiny):
ventana *Bienvenida/o* → «Tu nombre (es tu identificador)», campo *Panelista*, selector *Copa* (deshabilitado,
avanza solo), un deslizador 0–10 por atributo, botón *Enviar*, aviso «Valuación guardada» y al final
«Muchas gracias, ha finalizado la evaluación.». También acepta atributos `Check` y `Text` como el paquete.

Diferencias que no se notan pero ayudan: cada respuesta se guarda primero en el dispositivo y se sube sola
(si se corta internet no se pierde nada), y si el panelista recarga la página sigue desde la muestra que le falta.

## Lo que ve el coordinador (igual que `run_board()`)
Pestañas **Datos, ACP, Cajas, Anova, Radar**, con los mismos cálculos:
- **ACP:** medias ajustadas de `SensoMineR::decat(~Producto+Valuador)` y `FactoMineR::PCA(scale.unit = FALSE)`.
- **Cajas:** `geom_boxplot` con el código de cada panelista en color.
- **Anova:** `aov(y ~ Producto)` + `agricolae::LSD.test(p.adj = "bonferroni")` y `bar.group` con letras.
- **Radar:** medianas por producto (`ggradar`).

Se actualiza en vivo a medida que llegan las respuestas.

## Cómo se usa
1. En **admin.html → Nuevo panel**: nombre, **diseño** (.csv) y **atributos** (.csv), qué ve el panelista
   (`CodigoProducto`, `CodigoMuestra` o `NombreProducto`), título del selector (por defecto *Copa*), escala y paso.
   Muestra una vista previa con la bandeja del primer panelista. **Crear y abrir panel** → aparece el QR.
2. Repetir para cada grupo (por ejemplo 9 paneles = 9 links/QR distintos, todos abiertos a la vez).
3. Arriba de la lista, **Uso de Firebase**: almacenamiento estimado (de 1 GB) y escrituras del día (de 20.000,
   se reinician a la medianoche del Pacífico), sumando paneles y estudios de LibreSense. Es una estimación hecha
   desde la página; las cifras exactas están en la consola de Firebase (⚙ → Usage and billing).
4. En la lista: **Tablero**, **QR**, **Progreso** (muestras por panelista), **Descargar**
   (CSV para R, CSV para Excel, carpeta `Answers/` en .zip para correr `run_board()` en R, diseño con códigos),
   **Cerrar/Abrir**, **Renombrar**, **Borrar respuestas**, **Borrar panel**.

### Diseño (.csv)
Como `ejemplos/diseno_grupo_f1.csv`: `Valuador, Muestra, NombreProducto, CodigoProducto` (opcional `CodigoMuestra`).
El orden de las filas de cada valuador es el orden de servicio. Si falta `CodigoProducto` o `CodigoMuestra`,
se generan al azar como en `run_panel()`. Acepta coma o punto y coma, y archivos guardados con Excel.

### Atributos (.csv)
Como `ejemplos/atributos.csv`: `Nombre, Valores`, con `Valores` = `Numeric`, `Check` o `Text`.

## Datos en Firestore (proyecto `panel-sensorial-ef729`)
| Ruta | Contenido | Quién lee |
|---|---|---|
| `paneles/{id}` | nombre, activo, atributos, escala, qué ve el panelista, panelistas | todos |
| `paneles/{id}/publico/diseno` | Valuador, orden y la etiqueta que ve el panelista | todos |
| `paneles/{id}/privado/diseno` | + Muestra, NombreProducto, CodigoProducto, CodigoMuestra | administradores |
| `paneles/{id}/respuestas/{Valuador_Orden}` | valores por atributo | administradores |
| `paneles/{id}/progreso/{Valuador}` | órdenes respondidas | todos |

Con un código, los nombres de los vinos **nunca llegan al dispositivo del panelista**.

## Puesta en marcha (una sola vez)
1. Subir esta carpeta a un repositorio **`panel`** y activar GitHub Pages (Settings → Pages → *Deploy from a branch*, `main`, `/ (root)`).
2. **Reglas de Firestore:** en la consola de Firebase → Firestore → Reglas, pegar el bloque de
   `firestore-paneles.rules` antes de las dos llaves de cierre del final (o publicar `firestore.rules`, que ya
   trae las reglas de LibreSense + las de paneles). Sin esto, los paneles no se pueden crear.
3. Listo: `anibalacatania.github.io` ya está autorizado para el inicio de sesión con Google porque lo usa LibreSense.

No hay que compilar nada: son archivos estáticos (`index.html`, `admin.html`, `tablero.html`, `js/`, `vendor/`).
`config.json` tiene la configuración web de Firebase (es pública por diseño; la seguridad la dan las reglas).
