# =====================================================================================
# Perfil Flash · Análisis completo
# App Shiny que acompaña a la app "panel" (https://anibalacatania.github.io/panel/).
# Se abre desde la administración de un estudio de Perfil Flash ("Análisis completo en R"),
# o se usa sola subiendo la matriz / el formato largo que descarga la app.
#
# Métodos según Delarue (2015), "Flash Profile", cap. 7 de Varela y Ares (eds.),
# Novel Techniques in Sensory Characterization and Consumer Profiling; FactoMineR y SensoMineR.
# =====================================================================================
library(shiny)
library(bslib)
library(ggplot2)
library(FactoMineR)
library(SensoMineR)
library(DT)
library(httr2)
requireNamespace("jsonlite")  # (sin library(): su validate() taparía al de shiny)
library(writexl)
library(wordcloud)
library(gtools)
library(ggrepel)
library(rmarkdown)
library(htmltools)

for (f in list.files("R", pattern = "\\.R$", full.names = TRUE)) source(f, encoding = "UTF-8")

origenes_extra <- strsplit(Sys.getenv("PF_ORIGENES_EXTRA", ""), ",")[[1]]
origenes_extra <- origenes_extra[nzchar(origenes_extra)]

tema_app <- bs_theme(version = 5, primary = "#7c3aed", secondary = "#db2777", base_font = font_collection("Inter", "system-ui", "sans-serif"))

ayuda <- function(...) tags$p(class = "text-muted small mb-2", ...)
tarjeta <- function(titulo, ..., descargar = NULL) {
  card(full_screen = TRUE,
       card_header(class = "d-flex justify-content-between align-items-center", titulo, descargar),
       card_body(...))
}
bajar <- function(id) downloadButton(id, "PNG", class = "btn-sm btn-outline-secondary")

ui <- page_navbar(
  title = tags$b("Perfil Flash"), window_title = "Perfil Flash · análisis completo",
  id = "nav", theme = tema_app, fillable = FALSE,
  header = tagList(
    tags$script(HTML(sprintf("window.PF_ORIGENES_EXTRA = %s;", jsonlite::toJSON(origenes_extra)))),
    tags$script(src = "conexion.js"),
    tags$style(HTML(".value-box-title{font-size:.9rem} .shiny-output-error-validation{color:#6b7280;font-size:1rem;padding:1rem}"))
  ),
  sidebar = sidebar(
    width = 290,
    uiOutput("estado"),
    uiOutput("selector_sesiones"),
    radioButtons("metodo", "Mapa de consenso", c("MFA (análisis factorial múltiple)" = "MFA", "GPA (Procrustes generalizado)" = "GPA")),
    selectInput("dims", "Dimensiones", c("1 y 2" = "1,2", "1 y 3" = "1,3", "2 y 3" = "2,3")),
    checkboxInput("parciales", "Mostrar a cada panelista sobre el mapa", FALSE),
    hr(),
    fileInput("archivo", "…o subí un archivo de la app", accept = c(".csv", ".txt"),
              buttonLabel = "Elegir", placeholder = "Matriz o formato largo (CSV)"),
    ayuda("En la app: Resultados → “Matriz para MFA / GPA” o “Formato largo”.")
  ),

  nav_panel("Datos", icon = icon("table"),
    uiOutput("cajas"),
    layout_columns(col_widths = c(7, 5),
      tarjeta("Descriptores de cada panelista", ayuda("Cada panelista usa sus propias palabras. Pasá el mouse para ver cómo evalúa cada descriptor (si lo anotó)."), DTOutput("tabla_desc")),
      tarjeta("Controles", uiOutput("controles"))
    )
  ),

  nav_panel("Mapa de consenso", icon = icon("map"),
    layout_columns(col_widths = c(8, 4),
      tarjeta("Posición sensorial de los vinos", plotOutput("p_consenso", height = "620px"), descargar = bajar("d_consenso")),
      tarjeta("Cómo leerlo",
        p("Es el resultado principal del Perfil Flash: cuanto más cerca están dos vinos, más parecidos los percibió el panel."),
        p("Con “Mostrar a cada panelista” se ve dónde ubicó cada uno a cada vino (líneas de color). Líneas cortas = acuerdo con el consenso."),
        p("GPA y MFA suelen dar mapas muy parecidos (Delarue). El signo de cada eje es arbitrario."),
        hr(), h6("Inercia por dimensión"), tableOutput("t_inercia"))
    ),
    tarjeta("Coordenadas de los vinos", DTOutput("t_coord"))
  ),

  nav_panel("Elipses de confianza", icon = icon("bullseye"),
    layout_columns(col_widths = c(8, 4),
      tarjeta("Elipses de confianza al 95%", plotOutput("p_elipses", height = "620px"), descargar = bajar("d_elipses")),
      tarjeta("Paneles virtuales",
        p("Se arman muchos paneles “virtuales” sorteando panelistas con reposición, se recalcula el mapa y se mide cuánto se mueve cada vino",
          "(Cadoret y Husson, 2013; función ", code("boot(method = \"freechoice\")"), " de SensoMineR)."),
        p("Dos vinos cuyas elipses no se superponen fueron diferenciados por el panel."),
        sliderInput("nsim", "Paneles virtuales", 100, 1000, 300, step = 100),
        actionButton("calc_elipses", "Calcular elipses", class = "btn-primary w-100"),
        ayuda("Puede tardar unos segundos."))
    )
  ),

  nav_panel("Descriptores", icon = icon("tags"),
    layout_columns(col_widths = c(8, 4),
      tarjeta("Círculo de correlaciones", plotOutput("p_circulo", height = "640px"), descargar = bajar("d_circulo")),
      tarjeta("Filtros",
        sliderInput("r2", "Mostrar descriptores con r² en el plano ≥", 0, 1, 0.5, step = 0.05),
        selectizeInput("pan_filtro", "Panelistas", choices = NULL, multiple = TRUE, options = list(placeholder = "Todos")),
        div(class = "alert alert-warning small",
          "Cuidado al interpretar: dos panelistas pueden usar la misma palabra para cosas distintas, o palabras distintas para lo mismo",
          " (Delarue, fig. 7.4). El significado de los descriptores es una hipótesis."))
    ),
    layout_columns(col_widths = c(6, 6),
      tarjeta("Términos más usados", plotOutput("p_terminos", height = "480px"), descargar = bajar("d_terminos")),
      tarjeta("Nube de palabras", plotOutput("p_nube", height = "480px"))
    ),
    tarjeta("Correlación de cada descriptor con las dimensiones (MFA)", DTOutput("t_cor"))
  ),

  nav_panel("Panelistas", icon = icon("users"),
    layout_columns(col_widths = c(6, 6),
      tarjeta("Acuerdo con el consenso (RV)", ayuda("Coeficiente RV entre el mapa de cada panelista y el de consenso (MFA). 1 = mismo mapa."),
              plotOutput("p_rv_cons", height = "420px"), descargar = bajar("d_rv_cons")),
      tarjeta("Residuo de Procrustes (GPA)", ayuda("Lo que el consenso NO explica de cada panelista (en % del total). Más alto = se aparta más."),
              plotOutput("p_resid", height = "420px"), descargar = bajar("d_resid"))
    ),
    layout_columns(col_widths = c(6, 6),
      tarjeta("Parecido entre panelistas", plotOutput("p_rv", height = "520px"), descargar = bajar("d_rv")),
      tarjeta("Panelistas sobre las dimensiones", plotOutput("p_grupos", height = "520px"), descargar = bajar("d_grupos"))
    ),
    tarjeta("Mapa individual",
      selectInput("pan_ind", NULL, choices = NULL, width = "200px"),
      ayuda("Análisis de componentes principales solo con los descriptores de ese panelista: cómo ordenó él los vinos."),
      plotOutput("p_ind", height = "520px")),
    div(class = "small text-muted mb-4",
      "Un valor bajo no significa necesariamente un “mal” panelista: en Perfil Flash las percepciones pueden diferir en naturaleza (Delarue).")
  ),

  nav_panel("Clasificación", icon = icon("sitemap"),
    layout_columns(col_widths = c(7, 5),
      tarjeta("Dendrograma de los vinos", plotOutput("p_arbol", height = "560px"), descargar = bajar("d_arbol")),
      tarjeta("Grupos",
        sliderInput("k", "Cantidad de grupos", 2, 6, 3, step = 1),
        ayuda("Clasificación jerárquica (Ward) sobre las coordenadas del MFA (HCPC de FactoMineR)."),
        tableOutput("t_grupos"),
        h6("Descriptores que caracterizan cada grupo"), uiOutput("desc_grupos"))
    )
  ),

  nav_panel("Repetibilidad", icon = icon("repeat"),
    layout_columns(col_widths = c(6, 6),
      tarjeta("Duplicados", uiOutput("u_dup")),
      tarjeta("Sesiones (repeticiones)", uiOutput("u_ses"))
    )
  ),

  nav_panel("Descargas", icon = icon("download"),
    layout_columns(col_widths = c(6, 6),
      tarjeta("Tablas",
        p("Un Excel con la matriz, las coordenadas (MFA y GPA), RV, descriptores, términos, duplicados y el formato largo."),
        downloadButton("d_excel", "Descargar Excel", class = "btn-primary"), br(), br(),
        downloadButton("d_matriz", "Matriz (CSV, para R)")),
      tarjeta("Informe",
        p("Informe con todos los gráficos y tablas de las sesiones elegidas."),
        radioButtons("formato", NULL, c("Word (.docx)" = "word", "Página web (.html)" = "html"), inline = TRUE),
        downloadButton("d_informe", "Generar informe", class = "btn-primary"))
    ),
    tarjeta("Código R equivalente", verbatimTextOutput("codigo_r"))
  ),

  nav_panel("Ayuda", icon = icon("circle-question"),
    card(card_body(includeHTML("ayuda.html")))
  )
)

server <- function(input, output, session) {
  datos <- reactiveVal(NULL)      # list(largo, nombre, fuente)
  fb <- reactiveVal(NULL)         # list(token, proyecto, eid)
  mensaje <- reactiveVal(NULL)

  cargar_firebase <- function(x) {
    mensaje("Leyendo los datos del estudio…")
    r <- tryCatch(fs_leer_estudio(x$proyecto, x$eid, x$token), error = function(e) e)
    if (inherits(r, "error")) { mensaje(paste("No se pudieron leer los datos:", conditionMessage(r))); return() }
    if (!identical(r$estudio$tecnica, "flash")) { mensaje("Este estudio no es de Perfil Flash."); return() }
    datos(list(largo = r$largo, nombre = r$estudio$nombre %||% "Estudio", fuente = "Firebase (en vivo)"))
    mensaje(NULL)
  }
  observeEvent(input$fb, {
    x <- input$fb; viejo <- fb(); fb(x)
    if (is.null(viejo) || !identical(viejo$eid, x$eid) || is.null(datos())) cargar_firebase(x)
  })
  observeEvent(input$actualizar, { req(fb()); cargar_firebase(fb()) })
  observeEvent(input$archivo, {
    r <- tryCatch(leer_archivo(input$archivo$datapath, input$archivo$name), error = function(e) e)
    if (inherits(r, "error")) { mensaje(paste("No se pudo leer el archivo:", conditionMessage(r))); return() }
    fb(NULL); datos(list(largo = r, nombre = tools::file_path_sans_ext(input$archivo$name), fuente = "Archivo")); mensaje(NULL)
  })

  output$estado <- renderUI({
    d <- datos(); m <- mensaje()
    tagList(
      if (!is.null(m)) div(class = "alert alert-info small", m),
      if (is.null(d)) div(class = "small text-muted",
        if (isTRUE(input$hay_abridor)) "Esperando la sesión de la app…"
        else "Abrí este análisis desde la app (estudio de Perfil Flash → “Análisis completo en R”) o subí un archivo abajo.")
      else div(h5(class = "mb-0", d$nombre), div(class = "small text-muted mb-2", d$fuente),
               if (!is.null(fb())) actionButton("actualizar", "Actualizar datos", icon = icon("rotate"), class = "btn-sm btn-outline-primary mb-2"))
    )
  })
  output$selector_sesiones <- renderUI({
    d <- datos(); req(d)
    s <- orden_nat(d$largo$Sesion)
    if (length(s) < 2) return(NULL)
    checkboxGroupInput("sesiones", "Sesiones (rango medio)", s, selected = s, inline = TRUE)
  })

  M <- reactive({
    d <- datos()
    validate(need(d, "Todavía no hay datos: abrí el análisis desde la app o subí un archivo."))
    r <- tryCatch(armar_matriz(d$largo, input$sesiones), error = function(e) e)
    validate(need(!inherits(r, "error"), if (inherits(r, "error")) conditionMessage(r) else ""))
    r
  })
  mfa <- reactive(correr_mfa(M()))
  gpa <- reactive(correr_gpa(M()))
  dims <- reactive(as.integer(strsplit(input$dims, ",")[[1]]))
  observe({ m <- M(); updateSelectizeInput(session, "pan_filtro", choices = m$nombres); updateSelectInput(session, "pan_ind", choices = m$nombres) })
  observe({ n <- nrow(M()$d); updateSliderInput(session, "k", max = max(2, min(8, n - 1))) })

  # ---------------- Datos
  output$cajas <- renderUI({
    m <- M(); d <- datos()
    layout_columns(fill = FALSE,
      value_box("Vinos", nrow(m$d), showcase = icon("wine-glass"), theme = "primary"),
      value_box("Panelistas", length(m$nombres), showcase = icon("users"), theme = "secondary"),
      value_box("Descriptores", ncol(m$d), p(sprintf("%.1f por panelista", mean(m$grupos))), showcase = icon("tags"), theme = "info"),
      value_box("Sesiones", length(unique(d$largo$Sesion)), showcase = icon("calendar"), theme = "light"))
  })
  output$tabla_desc <- renderDT({
    m <- M(); d <- datos()$largo
    defs <- unique(d[, c("Valuador", "Atributo", "Definicion")])
    filas <- lapply(m$nombres, function(p) {
      at <- m$atributo[m$panelista == p]
      def <- defs$Definicion[match(paste(p, at), paste(defs$Valuador, defs$Atributo))]
      txt <- ifelse(!is.na(def) & nzchar(def), sprintf('<span title="%s" style="text-decoration:underline dotted">%s</span>', htmltools::htmlEscape(def), htmltools::htmlEscape(at)), htmltools::htmlEscape(at))
      data.frame(Panelista = p, N = length(at), Descriptores = paste(txt, collapse = " · "))
    })
    datatable(do.call(rbind, filas), escape = FALSE, rownames = FALSE, options = list(pageLength = 25, dom = "tp"))
  })
  output$controles <- renderUI({
    m <- M(); d <- datos()$largo
    mal <- control_sumas(d)
    tagList(
      if (nrow(mal)) div(class = "alert alert-danger small", "La suma de rangos no da p(p+1)/2 en: ", paste(apply(mal, 1, paste, collapse = " · "), collapse = "; "))
      else div(class = "alert alert-success small", "✓ En todos los descriptores la suma de rangos es p(p+1)/2 (control del cap. 7)."),
      if (length(m$excluidas)) div(class = "alert alert-warning small", "No entran al análisis: ", paste(m$excluidas, collapse = ", "))
      else div(class = "small text-muted", "Todos los descriptores entran al análisis."),
      if (length(m$nombres) < 4) div(class = "alert alert-warning small", "Delarue recomienda al menos 4–5 panelistas para un consenso estable."),
      div(class = "small text-muted", "Rangos: 1 = menos intenso; empates con rango medio. Con varias sesiones se usa el rango medio de las elegidas."))
  })

  # ---------------- Consenso
  consenso <- reactive({
    if (input$metodo == "GPA") { g <- gpa(); list(coord = g$consensus, pct = pct_gpa(g), titulo = "Consenso GPA") }
    else { m <- mfa(); list(coord = m$ind$coord, pct = m$eig[, 2], titulo = "Consenso MFA") }
  })
  parciales <- reactive({
    if (!isTRUE(input$parciales)) return(NULL)
    dd <- dims(); m <- M()
    if (input$metodo == "GPA") {
      X <- gpa()$Xfin   # tercera dimensión = panelistas, en el orden de los grupos
      do.call(rbind, lapply(seq_along(m$nombres), function(j) data.frame(vino = rownames(X), panelista = m$nombres[j], x = X[, dd[1], j], y = X[, dd[2], j])))
    } else {
      cp <- mfa()$ind$coord.partiel; v <- rownames(mfa()$ind$coord)
      do.call(rbind, lapply(m$nombres, function(p) { r <- paste0(v, ".", p); data.frame(vino = v, panelista = p, x = cp[r, dd[1]], y = cp[r, dd[2]]) }))
    }
  })
  g_cons <- reactive({ c <- consenso(); validate(need(max(dims()) <= ncol(c$coord), "No hay tantas dimensiones.")); g_consenso(c$coord, c$pct, dims(), parciales(), c$titulo) })
  output$p_consenso <- renderPlot(g_cons(), res = 100)
  output$t_inercia <- renderTable({ c <- consenso(); stats::setNames(data.frame(seq_along(c$pct), round(c$pct, 1)), c("Dimensión", "%"))[seq_len(min(5, length(c$pct))), ] })
  output$t_coord <- renderDT({ c <- consenso(); datatable(round(as.data.frame(c$coord[, seq_len(min(5, ncol(c$coord)))]), 3), options = list(dom = "t", pageLength = 50)) })

  # ---------------- Elipses (SensoMineR::boot)
  dibujar_elipses <- function(m, nsim) {
    set.seed(1)
    g <- SensoMineR::boot(m$d, method = "freechoice", group = m$grupos, nbsim = nsim, new.plot = FALSE,
                          title = "Elipses de confianza (95%)")
    invisible(NULL)
  }
  elipses_par <- eventReactive(input$calc_elipses, list(m = M(), nsim = input$nsim))
  output$p_elipses <- renderPlot({
    validate(need(input$calc_elipses > 0, "Tocá “Calcular elipses”."))
    e <- elipses_par()
    withProgress(message = "Simulando paneles virtuales…", dibujar_elipses(e$m, e$nsim))
  }, res = 100)

  # ---------------- Descriptores
  g_circ <- reactive(g_circulo(mfa(), M(), dims(), input$r2, input$pan_filtro))
  output$p_circulo <- renderPlot(g_circ(), res = 100)
  terminos <- reactive({ d <- datos()$largo; if (length(input$sesiones)) d <- d[d$Sesion %in% input$sesiones, ]; frecuencia_terminos(d) })
  g_term <- reactive(g_terminos(terminos()))
  output$p_terminos <- renderPlot(g_term(), res = 100)
  output$p_nube <- renderPlot({
    fr <- terminos(); validate(need(nrow(fr) > 0, "Sin términos."))
    par(mar = c(0, 0, 0, 0)); set.seed(2)
    wordcloud::wordcloud(fr$Termino, fr$Panelistas, min.freq = 1, scale = c(4, 0.8), random.order = FALSE,
                         colors = c("#a78bfa", "#7c3aed", "#db2777", "#be185d"))
  }, res = 100)
  output$t_cor <- renderDT({
    m <- M(); co <- mfa()$quanti.var$cor
    df <- data.frame(Panelista = m$panelista, Descriptor = m$atributo, round(co[, seq_len(min(3, ncol(co))), drop = FALSE], 3), check.names = FALSE)
    names(df)[-(1:2)] <- paste("Dim", seq_len(ncol(df) - 2))
    datatable(df, rownames = FALSE, options = list(pageLength = 15))
  })

  # ---------------- Panelistas
  rv_cons <- reactive({ r <- mfa()$group$RV; r[M()$nombres, "MFA"] })
  g_rvc <- reactive(g_barras(rv_cons(), "Acuerdo de cada panelista con el consenso", "RV", 0.5, invertir = FALSE))
  output$p_rv_cons <- renderPlot(g_rvc(), res = 100)
  resid <- reactive({ cf <- gpa()$PANOVA$config; v <- cf[M()$nombres, "SSresidual"]; names(v) <- M()$nombres; v })
  g_res <- reactive(g_barras(resid(), "Residuo de Procrustes por panelista", "% de la variación total", invertir = TRUE))
  output$p_resid <- renderPlot(g_res(), res = 100)
  g_rvm <- reactive({ r <- mfa()$group$RV; g_rv(r[M()$nombres, M()$nombres]) })
  output$p_rv <- renderPlot(g_rvm(), res = 100)
  g_grp <- reactive(g_grupos(mfa(), dims()))
  output$p_grupos <- renderPlot(g_grp(), res = 100)
  output$p_ind <- renderPlot({ req(input$pan_ind %in% M()$nombres); g_individual(M(), input$pan_ind) }, res = 100)

  # ---------------- Clasificación
  hc <- reactive(correr_hcpc(mfa(), input$k))
  plot_arbol <- function() plot(hc(), choice = "tree", title = "Clasificación jerárquica de los vinos")
  output$p_arbol <- renderPlot(plot_arbol(), res = 100)
  output$t_grupos <- renderTable({
    cl <- hc()$data.clust$clust; v <- rownames(hc()$data.clust)
    data.frame(Grupo = sort(unique(cl)), Vinos = vapply(sort(unique(cl)), function(k) paste(v[cl == k], collapse = ", "), ""))
  })
  output$desc_grupos <- renderUI({
    dv <- hc()$desc.var$quanti
    if (is.null(dv)) return(p(class = "small text-muted", "Ningún descriptor caracteriza significativamente a los grupos."))
    tagList(lapply(names(dv), function(k) {
      x <- dv[[k]]; if (is.null(x) || !nrow(x)) return(NULL)
      x <- x[order(x[, "p.value"]), , drop = FALSE][seq_len(min(6, nrow(x))), , drop = FALSE]
      mas <- rownames(x)[x[, "v.test"] > 0]; menos <- rownames(x)[x[, "v.test"] < 0]
      div(class = "small mb-2", tags$b(paste("Grupo", k, ": ")),
          if (length(mas)) span("más ", tags$em(paste(sub("_", ": ", mas), collapse = ", "))),
          if (length(menos)) span("; menos ", tags$em(paste(sub("_", ": ", menos), collapse = ", "))))
    }))
  })

  # ---------------- Repetibilidad
  output$u_dup <- renderUI({
    dt <- duplicados(mfa())
    if (is.null(dt)) return(tagList(p("Este estudio no tiene duplicados."),
      ayuda("Se pueden agregar al crear el estudio (“Duplicados”): el mismo vino servido dos veces con otra letra, sin que el panelista lo sepa.")))
    tagList(renderTable(dt),
      p(class = "small", "Distancia entre el duplicado y su vino en el mapa de consenso (todas las dimensiones del MFA). El percentil dice qué",
        "porcentaje de las distancias entre vinos distintos es menor o igual: cuanto más bajo, mejor repitió el panel."),
      div(class = "alert alert-warning small", "Como el Perfil Flash es comparativo, un duplicado lejos de su vino puede indicar falta de repetibilidad ",
          tags$b("o"), " que los vinos del set son muy parecidos entre sí (Delarue, 7.3.4.3)."))
  })
  output$u_ses <- renderUI({
    R <- rv_sesiones(datos()$largo)
    if (is.null(R)) return(p("Hay una sola sesión. La repetibilidad completa requiere repetir la evaluación (Delarue), algo poco habitual en Perfil Flash."))
    tagList(p("RV entre los mapas de consenso de cada sesión (1 = el panel ubicó los vinos igual en ambas):"), renderTable(R, rownames = TRUE, digits = 3))
  })

  # ---------------- Descargas
  png_de <- function(g, w = 10, h = 8) downloadHandler(filename = function() paste0("perfil_flash_", format(Sys.time(), "%Y%m%d_%H%M"), ".png"),
    content = function(file) { ggsave(file, g(), width = w, height = h, dpi = 200, bg = "white") })
  output$d_consenso <- png_de(g_cons); output$d_circulo <- png_de(g_circ, 10, 10); output$d_terminos <- png_de(g_term)
  output$d_rv_cons <- png_de(g_rvc); output$d_resid <- png_de(g_res); output$d_rv <- png_de(g_rvm); output$d_grupos <- png_de(g_grp)
  output$d_elipses <- downloadHandler(filename = "elipses_perfil_flash.png", content = function(file) {
    png(file, 2000, 1600, res = 200); on.exit(dev.off()); dibujar_elipses(M(), input$nsim) })
  output$d_arbol <- downloadHandler(filename = "dendrograma_perfil_flash.png", content = function(file) { png(file, 2000, 1400, res = 200); plot_arbol(); dev.off() })

  tablas <- reactive({
    m <- M(); mf <- mfa(); gp <- gpa()
    co <- mf$quanti.var$cor
    list(
      Matriz = data.frame(Vino = rownames(m$d), m$d, check.names = FALSE),
      Coordenadas_MFA = data.frame(Vino = rownames(mf$ind$coord), round(mf$ind$coord, 4), check.names = FALSE),
      Coordenadas_GPA = data.frame(Vino = rownames(gp$consensus), round(gp$consensus, 4), check.names = FALSE),
      Inercia_MFA = data.frame(Dimension = seq_len(nrow(mf$eig)), round(mf$eig, 3), check.names = FALSE),
      RV_panelistas = data.frame(Panelista = rownames(mf$group$RV), round(mf$group$RV, 3), check.names = FALSE),
      Residuo_GPA = data.frame(Panelista = rownames(gp$PANOVA$config), round(gp$PANOVA$config, 3), check.names = FALSE),
      Descriptores = data.frame(Panelista = m$panelista, Descriptor = m$atributo, round(co, 4), check.names = FALSE),
      Terminos = terminos(),
      Duplicados = duplicados(mf) %||% data.frame(Nota = "Sin duplicados"),
      Formato_largo = datos()$largo)
  })
  output$d_excel <- downloadHandler(filename = function() paste0(gsub("[^A-Za-z0-9_-]+", "_", datos()$nombre), "_perfil_flash.xlsx"),
    content = function(file) writexl::write_xlsx(tablas(), file))
  output$d_matriz <- downloadHandler(filename = function() paste0(gsub("[^A-Za-z0-9_-]+", "_", datos()$nombre), "_matriz.csv"),
    content = function(file) utils::write.csv(data.frame(Producto = rownames(M()$d), M()$d, check.names = FALSE), file, row.names = FALSE))
  output$d_informe <- downloadHandler(
    filename = function() paste0(gsub("[^A-Za-z0-9_-]+", "_", datos()$nombre), "_informe.", if (input$formato == "word") "docx" else "html"),
    content = function(file) {
      withProgress(message = "Armando el informe…", {
        dir <- tempfile(); dir.create(dir)
        file.copy("informe.Rmd", dir); file.copy("R", dir, recursive = TRUE)
        out <- rmarkdown::render(file.path(dir, "informe.Rmd"),
          output_format = if (input$formato == "word") rmarkdown::word_document() else rmarkdown::html_document(self_contained = TRUE, toc = TRUE),
          params = list(largo = datos()$largo, nombre = datos()$nombre, sesiones = input$sesiones, dims = dims(), nsim = input$nsim, k = input$k),
          envir = new.env(parent = globalenv()), quiet = TRUE)
        file.copy(out, file)
      })
    })
  output$codigo_r <- renderText({
    m <- M()
    paste0('library(FactoMineR); library(SensoMineR)\n',
      'd <- read.csv("', gsub("[^A-Za-z0-9_-]+", "_", datos()$nombre), '_matriz.csv", row.names = 1, check.names = FALSE)\n',
      'grupos <- c(', paste(m$grupos, collapse = ", "), ')\n',
      'nombres <- c(', paste0('"', m$nombres, '"', collapse = ", "), ')\n',
      'afm <- MFA(d, group = grupos, type = rep("s", length(grupos)), name.group = nombres)\n',
      'gpa <- GPA(d, group = grupos, name.group = nombres)\n',
      'afm$group$RV            # acuerdo entre panelistas y con el consenso\n',
      'gpa$PANOVA$config       # residuo de Procrustes por panelista\n',
      'boot(d, method = "freechoice", group = grupos)   # elipses de confianza\n',
      'HCPC(afm, nb.clust = ', input$k, ')   # clasificación de los vinos\n')
  })
}

shinyApp(ui, server)
