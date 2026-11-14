# Análisis del Perfil Flash (Delarue, cap. 7 de "Novel Techniques in Sensory Characterization and
# Consumer Profiling"): una tabla de rangos por panelista, analizadas juntas con GPA y MFA.

orden_nat <- function(x) gtools::mixedsort(unique(x))
es_dup <- function(x) grepl(" \\(dup\\)$", x)

# ------------------------------------------------------------------ lectura de archivos
# Acepta la "Matriz para MFA / GPA" o el "Formato largo" que descarga la app.
leer_archivo <- function(path, nombre = path) {
  ext <- tolower(tools::file_ext(nombre))
  lee <- function(sep, dec) utils::read.csv(path, sep = sep, dec = dec, check.names = FALSE, stringsAsFactors = FALSE,
                                           fileEncoding = "UTF-8-BOM")
  x <- tryCatch(lee(",", "."), error = function(e) NULL)
  if (is.null(x) || ncol(x) < 2) x <- lee(";", ",")
  if (all(c("Valuador", "Atributo", "Rango") %in% names(x))) {
    x$Rango <- as.numeric(gsub(",", ".", x$Rango))
    if (!"NombreProducto" %in% names(x)) x$NombreProducto <- x$CodigoProducto
    if (!"Sesion" %in% names(x)) x$Sesion <- "S1"
    if (!"Definicion" %in% names(x)) x$Definicion <- ""
    return(x)
  }
  # matriz: primera columna = producto; resto "Panelista_Descriptor"
  prod <- x[[1]]; m <- x[-1]
  pan <- sub("_.*$", "", names(m)); atr <- sub("^[^_]*_", "", names(m))
  if (any(pan == names(m))) stop("Las columnas de la matriz deben llamarse Panelista_Descriptor (ej. V1_Frutado).")
  data.frame(Sesion = "S1", Valuador = rep(pan, each = length(prod)), Atributo = rep(atr, each = length(prod)),
             NombreProducto = rep(prod, times = ncol(m)),
             Rango = as.numeric(gsub(",", ".", unlist(m))), Definicion = "", stringsAsFactors = FALSE)
}

# ------------------------------------------------------------------ matriz de trabajo
# filas = vinos; columnas = Panelista_Descriptor (rango medio si hay varias sesiones)
armar_matriz <- function(largo, sesiones = NULL) {
  if (length(sesiones)) largo <- largo[largo$Sesion %in% sesiones, ]
  if (!nrow(largo)) stop("No hay datos para las sesiones elegidas.")
  ag <- stats::aggregate(Rango ~ NombreProducto + Valuador + Atributo, data = largo, FUN = mean)
  pans <- orden_nat(ag$Valuador)
  prods <- orden_nat(ag$NombreProducto)
  cols <- list(); grupos <- c(); nombres <- c(); excl <- c()
  for (p in pans) {
    a <- ag[ag$Valuador == p, ]
    k <- 0
    for (at in sort(unique(a$Atributo))) {
      v <- a$Rango[a$Atributo == at][match(prods, a$NombreProducto[a$Atributo == at])]
      nom <- paste0(p, "_", at)
      if (anyNA(v)) { excl <- c(excl, paste(nom, "(faltan vinos)")); next }
      if (stats::sd(v) == 0) { excl <- c(excl, paste(nom, "(todos iguales)")); next }
      cols[[nom]] <- v; k <- k + 1
    }
    if (k > 0) { grupos <- c(grupos, k); nombres <- c(nombres, p) }
  }
  if (length(grupos) < 2) stop("Se necesitan al menos 2 panelistas con datos completos.")
  if (length(prods) < 3) stop("Se necesitan al menos 3 vinos.")
  d <- as.data.frame(cols, check.names = FALSE); rownames(d) <- prods
  defs <- unique(largo[nzchar(largo$Definicion %||% ""), c("Valuador", "Atributo", "Definicion")])
  list(d = d, grupos = grupos, nombres = nombres, excluidas = excl, defs = defs,
       panelista = rep(nombres, grupos), atributo = sub("^[^_]*_", "", names(d)))
}

# ------------------------------------------------------------------ análisis
correr_mfa <- function(M) {
  FactoMineR::MFA(M$d, group = M$grupos, type = rep("s", length(M$grupos)), name.group = M$nombres,
                  ncp = min(5, nrow(M$d) - 1), graph = FALSE)
}
correr_gpa <- function(M) {
  suppressWarnings(FactoMineR::GPA(M$d, group = M$grupos, name.group = M$nombres, graph = FALSE))
}
correr_hcpc <- function(mfa, k = -1) {
  FactoMineR::HCPC(mfa, nb.clust = k, consol = FALSE, graph = FALSE, min = 2, max = max(2, min(10, nrow(mfa$ind$coord) - 1)))
}

# porcentajes de inercia del consenso GPA
pct_gpa <- function(gpa) {
  e <- gpa$PANOVA$dimension[seq_len(ncol(gpa$consensus)), "Consensus"]
  100 * e / sum(e)
}

# distancias de cada duplicado a su vino, comparadas con las distancias entre vinos distintos
duplicados <- function(mfa) {
  X <- mfa$ind$coord; p <- rownames(X)
  dups <- p[es_dup(p)]
  if (!length(dups)) return(NULL)
  orig <- p[!es_dup(p)]
  D <- as.matrix(stats::dist(X))
  entre <- D[orig, orig][upper.tri(D[orig, orig])]
  do.call(rbind, lapply(dups, function(dd) {
    o <- sub(" \\(dup\\)$", "", dd)
    if (!o %in% p) return(NULL)
    di <- D[dd, o]
    stats::setNames(data.frame(dd, o, round(di, 3), round(100 * mean(entre <= di), 1), names(sort(D[dd, setdiff(p, dd)]))[1]),
      c("Duplicado", "Vino", "Distancia", "Percentil entre vinos distintos", "Vino más cercano al duplicado"))
  }))
}

# parecido entre sesiones (si hubo repeticiones): RV entre las configuraciones de consenso
rv_sesiones <- function(largo) {
  ses <- orden_nat(largo$Sesion)
  if (length(ses) < 2) return(NULL)
  conf <- lapply(ses, function(s) tryCatch({ M <- armar_matriz(largo, s); correr_mfa(M)$ind$coord }, error = function(e) NULL))
  names(conf) <- ses; conf <- conf[!vapply(conf, is.null, TRUE)]
  if (length(conf) < 2) return(NULL)
  comunes <- Reduce(intersect, lapply(conf, rownames))
  R <- outer(names(conf), names(conf), Vectorize(function(a, b)
    FactoMineR::coeffRV(conf[[a]][comunes, , drop = FALSE], conf[[b]][comunes, , drop = FALSE])$rv))
  dimnames(R) <- list(names(conf), names(conf)); round(R, 3)
}

# frecuencia de términos (cuántos panelistas usaron cada uno, sin distinguir mayúsculas)
frecuencia_terminos <- function(largo) {
  u <- unique(data.frame(p = largo$Valuador, t = tolower(trimws(largo$Atributo))))
  f <- sort(table(u$t), decreasing = TRUE)
  data.frame(Termino = names(f), Panelistas = as.integer(f), stringsAsFactors = FALSE)
}

# control del cap. 7: suma de rangos = p(p+1)/2 en cada panelista × sesión × descriptor
control_sumas <- function(largo) {
  a <- stats::aggregate(Rango ~ Sesion + Valuador + Atributo, data = largo, FUN = function(v) c(s = sum(v), n = length(v)))
  s <- a$Rango[, "s"]; n <- a$Rango[, "n"]
  a[abs(s - n * (n + 1) / 2) > 1e-6, c("Sesion", "Valuador", "Atributo")]
}
`%||%` <- function(a, b) if (is.null(a)) b else a
