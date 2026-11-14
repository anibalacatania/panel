# Lectura de un estudio de Perfil Flash desde Firestore (API REST), con el token de la sesión
# del administrador que la app "panel" le pasa a Shiny. Las reglas de seguridad de Firebase se
# aplican igual que en la app: sin un token de administrador no se puede leer nada privado.

fs_base <- function(proyecto) {
  b <- Sys.getenv("PF_FIRESTORE_BASE", "https://firestore.googleapis.com/v1")  # (solo para pruebas)
  sprintf("%s/projects/%s/databases/(default)/documents", b, proyecto)
}

# valor de Firestore -> valor de R
fs_valor <- function(v) {
  if (is.null(v)) return(NULL)
  t <- names(v)[1]
  switch(t,
    stringValue = v$stringValue,
    integerValue = as.numeric(v$integerValue),
    doubleValue = as.numeric(v$doubleValue),
    booleanValue = isTRUE(v$booleanValue),
    nullValue = NA,
    timestampValue = v$timestampValue,
    mapValue = lapply(v$mapValue$fields %||% list(), fs_valor),
    arrayValue = lapply(v$arrayValue$values %||% list(), fs_valor),
    NA)
}
`%||%` <- function(a, b) if (is.null(a)) b else a
fs_doc <- function(d) lapply(d$fields %||% list(), fs_valor)

fs_pedir <- function(url, token, query = list()) {
  req <- httr2::request(url) |>
    httr2::req_auth_bearer_token(token) |>
    httr2::req_url_query(!!!query) |>
    httr2::req_timeout(60) |>
    httr2::req_error(is_error = function(resp) FALSE)
  resp <- httr2::req_perform(req)
  st <- httr2::resp_status(resp)
  if (st == 401 || st == 403) stop("Firebase no dio permiso (la sesión venció o no es de un administrador). Volvé a abrir el análisis desde la app.")
  if (st == 404) stop("No se encontró el estudio en Firebase.")
  if (st >= 400) stop(sprintf("Error %s al leer Firebase.", st))
  httr2::resp_body_json(resp, simplifyVector = FALSE)
}

# Lee estudio + diseño privado + respuestas y arma el formato largo
fs_leer_estudio <- function(proyecto, eid, token) {
  base <- fs_base(proyecto)
  est <- fs_doc(fs_pedir(sprintf("%s/estudios/%s", base, eid), token))
  priv <- fs_doc(fs_pedir(sprintf("%s/estudios/%s/privado/diseno", base, eid), token))
  docs <- list(); tok <- NULL
  repeat {
    q <- list(pageSize = 300); if (!is.null(tok)) q$pageToken <- tok
    r <- fs_pedir(sprintf("%s/estudios/%s/respuestas", base, eid), token, q)
    docs <- c(docs, r$documents %||% list())
    tok <- r$nextPageToken
    if (is.null(tok)) break
  }
  resp <- lapply(docs, fs_doc)
  list(estudio = est, largo = armar_largo(est, priv, resp))
}

armar_largo <- function(est, priv, resp) {
  filas <- strsplit(unlist(priv$filas %||% list()), "|", fixed = TRUE)
  info <- if (length(filas)) {
    m <- do.call(rbind, lapply(filas, function(x) x[1:6]))
    data.frame(Sesion = m[, 1], Valuador = m[, 2], Orden = as.numeric(m[, 3]), CodigoProducto = m[, 4],
               NombreProducto = m[, 5], Rep = m[, 6], stringsAsFactors = FALSE)
  } else data.frame()
  out <- lapply(resp, function(r) {
    v <- r$valores %||% list()
    if (!length(v)) return(NULL)
    def <- r$def %||% list()
    data.frame(Sesion = r$Sesion, Valuador = r$Valuador, Orden = as.numeric(r$Orden), CodigoProducto = r$CodigoProducto,
               Atributo = names(v), Rango = as.numeric(unlist(v)),
               Definicion = vapply(names(v), function(a) as.character(def[[a]] %||% ""), ""),
               stringsAsFactors = FALSE, row.names = NULL)
  })
  largo <- do.call(rbind, out)
  if (is.null(largo) || !nrow(largo)) stop("El estudio todavía no tiene respuestas.")
  largo <- merge(largo, info, by = c("Sesion", "Valuador", "Orden", "CodigoProducto"), all.x = TRUE)
  largo$NombreProducto[is.na(largo$NombreProducto)] <- largo$CodigoProducto[is.na(largo$NombreProducto)]
  largo[order(largo$Sesion, largo$Valuador, largo$Atributo, largo$Orden), ]
}
