# Gráficos (ggplot2) del Perfil Flash
library(ggplot2)

PALETA <- c("#4f46e5", "#db2777", "#059669", "#d97706", "#0891b2", "#7c3aed", "#dc2626", "#65a30d",
            "#0d9488", "#c026d3", "#ea580c", "#2563eb", "#9333ea", "#16a34a", "#e11d48", "#0284c7")
col_pan <- function(n) rep(PALETA, length.out = n)

tema <- function() {
  theme_minimal(base_size = 13) +
    theme(panel.grid.minor = element_blank(), plot.title = element_text(face = "bold"),
          legend.position = "bottom", plot.title.position = "plot")
}
ejes <- function() list(geom_hline(yintercept = 0, linetype = 2, colour = "grey70"),
                        geom_vline(xintercept = 0, linetype = 2, colour = "grey70"))
etq <- function(dim, pct) sprintf("Dim %d (%.1f%%)", dim, pct)

# mapa de vinos (consenso), con puntos parciales de cada panelista opcionales
g_consenso <- function(coord, pct, dims = 1:2, parciales = NULL, titulo = "") {
  df <- data.frame(vino = rownames(coord), x = coord[, dims[1]], y = coord[, dims[2]])
  df$tipo <- ifelse(es_dup(df$vino), "Duplicado", "Vino")
  p <- ggplot(df, aes(x, y)) + ejes()
  if (!is.null(parciales)) {
    pa <- merge(parciales, df[, c("vino", "x", "y")], by = "vino", suffixes = c("", ".c"))
    p <- p + geom_segment(data = pa, aes(x = x.c, y = y.c, xend = x, yend = y, colour = panelista), alpha = 0.5) +
      geom_point(data = pa, aes(colour = panelista), size = 1.6, alpha = 0.8) +
      scale_colour_manual(values = col_pan(length(unique(pa$panelista))), name = "Panelista")
  }
  p + geom_point(aes(shape = tipo), size = 3.8, colour = "#1e1b4b") +
    ggrepel::geom_text_repel(aes(label = vino), fontface = "bold", size = 4.4, colour = "#1e1b4b", max.overlaps = 50) +
    scale_shape_manual(values = c(Vino = 16, Duplicado = 1), name = NULL) +
    coord_equal() + labs(x = etq(dims[1], pct[dims[1]]), y = etq(dims[2], pct[dims[2]]), title = titulo) + tema()
}

# círculo de correlaciones de los descriptores (MFA)
g_circulo <- function(mfa, M, dims = 1:2, r2min = 0.5, panelistas = NULL) {
  co <- mfa$quanti.var$cor
  df <- data.frame(var = rownames(co), x = co[, dims[1]], y = co[, dims[2]], panelista = M$panelista, atributo = M$atributo)
  df <- df[(df$x^2 + df$y^2) >= r2min, ]
  if (length(panelistas)) df <- df[df$panelista %in% panelistas, ]
  circ <- data.frame(x = cos(seq(0, 2 * pi, length.out = 200)), y = sin(seq(0, 2 * pi, length.out = 200)))
  pct <- mfa$eig[, 2]
  ggplot(df, aes(x, y)) + ejes() + geom_path(data = circ, colour = "grey60") +
    geom_segment(aes(x = 0, y = 0, xend = x, yend = y, colour = panelista), arrow = arrow(length = unit(0.18, "cm")), alpha = 0.85) +
    ggrepel::geom_text_repel(aes(label = paste0(panelista, ": ", atributo), colour = panelista), size = 3.4, max.overlaps = 80, show.legend = FALSE) +
    scale_colour_manual(values = col_pan(length(M$nombres)), breaks = M$nombres, name = "Panelista") +
    coord_equal(xlim = c(-1.1, 1.1), ylim = c(-1.1, 1.1)) +
    labs(x = etq(dims[1], pct[dims[1]]), y = etq(dims[2], pct[dims[2]]),
         title = "Descriptores (correlación con las dimensiones del MFA)",
         subtitle = sprintf("Se muestran los que tienen r² ≥ %.2f en este plano", r2min)) + tema()
}

# representación de los panelistas (grupos del MFA)
g_grupos <- function(mfa, dims = 1:2) {
  gc <- mfa$group$coord
  df <- data.frame(p = rownames(gc), x = gc[, dims[1]], y = gc[, dims[2]])
  pct <- mfa$eig[, 2]
  ggplot(df, aes(x, y)) + geom_point(size = 3, colour = "#db2777") +
    ggrepel::geom_text_repel(aes(label = p), size = 4) +
    coord_equal(xlim = c(0, 1), ylim = c(0, 1)) +
    labs(x = etq(dims[1], pct[dims[1]]), y = etq(dims[2], pct[dims[2]]), title = "Panelistas (representación de los grupos)",
         subtitle = "Cerca del 1 en una dimensión = ese panelista la percibió con fuerza") + tema()
}

g_barras <- function(valores, titulo, xlab, umbral = NULL, invertir = FALSE) {
  df <- data.frame(p = names(valores), v = as.numeric(valores))
  df$p <- factor(df$p, levels = df$p[order(df$v, decreasing = invertir)])
  g <- ggplot(df, aes(v, p)) + geom_col(fill = "#7c3aed") + geom_text(aes(label = sprintf("%.2f", v)), hjust = -0.15, size = 3.6) +
    labs(x = xlab, y = NULL, title = titulo) + tema() + scale_x_continuous(expand = expansion(mult = c(0, 0.15)))
  if (!is.null(umbral)) g <- g + geom_vline(xintercept = umbral, linetype = 2, colour = "#dc2626")
  g
}

g_rv <- function(R) {
  df <- as.data.frame(as.table(R)); names(df) <- c("a", "b", "rv"); df$rv <- pmin(1, pmax(0, df$rv))
  ggplot(df, aes(a, b, fill = rv)) + geom_tile(colour = "white") + geom_text(aes(label = sprintf("%.2f", rv)), size = 3) +
    scale_fill_gradient(low = "#fef3c7", high = "#7c3aed", limits = c(0, 1), name = "RV") +
    labs(x = NULL, y = NULL, title = "Parecido entre panelistas (coeficiente RV)") + tema() +
    theme(axis.text.x = element_text(angle = 45, hjust = 1))
}

g_terminos <- function(fr, n = 25) {
  fr <- utils::head(fr, n); fr$Termino <- factor(fr$Termino, levels = rev(fr$Termino))
  ggplot(fr, aes(Panelistas, Termino)) + geom_col(fill = "#d97706") +
    labs(x = "Panelistas que lo usaron", y = NULL, title = "Términos más usados") + tema()
}

# mapa individual de un panelista (ACP de su tabla), para ver cómo ordenó los vinos
g_individual <- function(M, p) {
  X <- M$d[, M$panelista == p, drop = FALSE]
  if (ncol(X) < 2) {
    df <- data.frame(vino = rownames(X), v = X[, 1])
    return(ggplot(df, aes(v, 0)) + geom_point(size = 3) + ggrepel::geom_text_repel(aes(label = vino)) +
             labs(x = paste("Rango en", colnames(X)), y = NULL, title = paste("Panelista", p, "(un solo descriptor)")) + tema())
  }
  pc <- FactoMineR::PCA(X, graph = FALSE)
  df <- data.frame(vino = rownames(pc$ind$coord), x = pc$ind$coord[, 1], y = pc$ind$coord[, 2])
  va <- data.frame(a = sub("^[^_]*_", "", rownames(pc$var$coord)), x = pc$var$coord[, 1], y = pc$var$coord[, 2])
  k <- max(abs(c(df$x, df$y))) * 0.9
  ggplot(df, aes(x, y)) + ejes() +
    geom_segment(data = va, aes(x = 0, y = 0, xend = x * k, yend = y * k), colour = "#db2777", arrow = arrow(length = unit(0.15, "cm"))) +
    geom_text(data = va, aes(x = x * k * 1.12, y = y * k * 1.12, label = a), colour = "#be185d", size = 3.6) +
    geom_point(size = 3, colour = "#1e1b4b") + ggrepel::geom_text_repel(aes(label = vino), fontface = "bold") +
    coord_equal() + labs(x = etq(1, pc$eig[1, 2]), y = etq(2, pc$eig[2, 2]), title = paste("Mapa individual del panelista", p)) + tema()
}
