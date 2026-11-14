# Perfil Flash · análisis completo (Shiny)

App Shiny que acompaña a la app **panel** (https://anibalacatania.github.io/panel/). Analiza los estudios de
Perfil Flash con FactoMineR y SensoMineR, siguiendo a Delarue (2015, cap. 7 de *Novel Techniques in Sensory
Characterization and Consumer Profiling*).

Se publica en **https://acatania.shinyapps.io/perfilflash/** (dirección configurada en `config.json` de la app panel).

## Qué muestra
- **Datos:** vinos, panelistas, descriptores de cada uno (con su definición), control de suma de rangos p(p+1)/2.
- **Mapa de consenso:** GPA o MFA, dimensiones 1-2 / 1-3 / 2-3, con los puntos de cada panelista opcionales.
- **Elipses de confianza:** paneles virtuales por remuestreo de panelistas (`SensoMineR::boot(method = "freechoice")`).
- **Descriptores:** círculo de correlaciones (filtrable por r² y panelista), términos más usados, nube de palabras.
- **Panelistas:** RV con el consenso, residuo de Procrustes, RV entre panelistas, mapa de grupos, mapa individual.
- **Clasificación:** HCPC de los vinos y descriptores que caracterizan cada grupo.
- **Repetibilidad:** distancia de cada duplicado a su vino; RV entre sesiones si hubo repeticiones.
- **Descargas:** gráficos PNG, Excel con todas las tablas, matriz CSV, informe Word o HTML, código R equivalente.

## Cómo llegan los datos
1. En la administración de un estudio de Perfil Flash, botón **“Análisis completo en R (Shiny) ↗”**.
2. Se abre esta app; cuando arranca, avisa a la ventana que la abrió.
3. La app panel le responde **solo a este sitio** con el token de la sesión del administrador (vale 1 hora y se
   renueva cada 45 minutos mientras la ventana siga abierta).
4. Shiny lee el estudio de Firestore con ese token: se aplican las mismas reglas de seguridad que en la app.
   No hay claves guardadas en shinyapps.io; si alguien abre el link directamente, no ve datos.

También se puede usar sola, subiendo la **Matriz para MFA / GPA** o el **Formato largo** (CSV) que descarga la app.

## Publicar (una vez, desde RStudio)
```r
install.packages(c("shiny", "bslib", "ggplot2", "ggrepel", "FactoMineR", "SensoMineR", "DT", "httr2",
                   "jsonlite", "writexl", "wordcloud", "gtools", "rmarkdown", "htmltools", "rsconnect"))
# si todavía no está vinculada la cuenta en esta computadora:
# rsconnect::setAccountInfo(name = "acatania", token = "...", secret = "...")   # (shinyapps.io → Account → Tokens)
rsconnect::deployApp("ruta/a/perfilflash", appName = "perfilflash", account = "acatania")
```
Para actualizarla, se vuelve a correr `deployApp` con los archivos nuevos.

## Probar en la computadora
```r
shiny::runApp("ruta/a/perfilflash")   # y subir un CSV descargado de la app
```
