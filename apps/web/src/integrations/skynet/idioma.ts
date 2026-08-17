/**
 * El editor, en español — sin librería de i18n y sin big-bang.
 *
 * ## Por qué la CLAVE es la frase en inglés
 *
 * Parece pobre al lado de un `editor.media.import`, y es justo al revés. Este repositorio es un
 * FORK: lo que se traduce hoy se va a encontrar mañana con un `git merge upstream/main` que cambia
 * componentes enteros. Con claves inventadas, cada cambio de upstream deja una clave huérfana que
 * no rompe nada y **se queda en inglés en silencio** — el peor resultado, porque nadie lo nota.
 *
 * Con la frase inglesa como clave pasan tres cosas que valen más que la elegancia:
 *
 * 1. **Lo no traducido se ve, y funciona.** `t("Add track")` sin entrada devuelve `"Add track"`:
 *    la pantalla queda en inglés en ese punto, no vacía ni rota.
 * 2. **Traducir es incremental.** Se pueden añadir cien frases hoy y cien mañana sin tocar código.
 * 3. **El rebase no miente.** Si upstream cambia «Add track» por otra cosa, la traducción deja de
 *    aplicar y se ve en pantalla, en vez de aplicarse a un texto que ya no existe.
 *
 * ## Por qué no i18next
 *
 * Aquí hay UN idioma de destino y ~4.000 cadenas repartidas en 287 componentes. Una librería añade
 * proveedor, carga asíncrona, plurales y un formato de archivo — infraestructura para un problema
 * que no tenemos. Si algún día el editor se vende en dos idiomas, esta función se sustituye por la
 * librería y las claves ya están puestas: son las frases originales, que es lo que cualquier
 * extractor de i18n habría generado igual.
 *
 * ## Alcance, dicho sin adornos
 *
 * Está traducida la CÁSCARA del editor —lo que se toca al montar— no las 287 pantallas. Lo que
 * falte sale en inglés y se puede ir sumando aquí sin tocar un solo componente.
 */

/**
 * Diccionario. La clave es el texto original, tal cual aparece en el componente.
 *
 * Tuteo rolo, nunca voseo: es la voz de la casa y aplica igual acá que en SkyNet.
 */
const ES: Readonly<Record<string, string>> = {
  // ── Barra superior y navegación ───────────────────────────────────────────
  "Video Editor": "Editor de video",
  "Motion Design": "Diseño en movimiento",
  Export: "Exportar",
  "Back to home": "Volver al inicio",
  "Action history": "Historial de acciones",
  "Audio mixer": "Mezclador de audio",
  Undo: "Deshacer",
  Redo: "Rehacer",
  Save: "Guardar",
  Saving: "Guardando",
  Saved: "Guardado",
  Settings: "Ajustes",

  // ── Riel de paneles ───────────────────────────────────────────────────────
  Media: "Material",
  Text: "Texto",
  Graphics: "Gráficos",
  Effects: "Efectos",
  Transitions: "Transiciones",
  Audio: "Audio",
  Captions: "Subtítulos",
  Templates: "Plantillas",

  // ── Panel de material ─────────────────────────────────────────────────────
  Import: "Importar",
  "Import Media": "Importar material",
  "Add media": "Añadir material",
  "Add to timeline": "Añadir a la línea de tiempo",
  Record: "Grabar",
  "No media imported": "Todavía no hay material",
  "Drag files here or click to import": "Arrastra archivos acá o haz clic para importar",
  "Asset not found": "No encuentro ese archivo",

  // ── Línea de tiempo ───────────────────────────────────────────────────────
  "Add track": "Añadir pista",
  "Add Track": "Añadir pista",
  Track: "Pista",
  Split: "Partir",
  Delete: "Borrar",
  Duplicate: "Duplicar",
  Copy: "Copiar",
  Paste: "Pegar",
  Cut: "Cortar",
  Lock: "Bloquear",
  Unlock: "Desbloquear",
  Mute: "Silenciar",
  Unmute: "Quitar silencio",
  Hide: "Ocultar",
  Show: "Mostrar",
  Solo: "Solo",
  "Zoom in": "Acercar",
  "Zoom out": "Alejar",
  "Fit to window": "Ajustar a la ventana",

  // ── Reproductor e inspector ───────────────────────────────────────────────
  Player: "Reproductor",
  Play: "Reproducir",
  Pause: "Pausar",
  "No selection": "Nada seleccionado",
  "Select a clip to view its properties": "Elige un clip para ver sus propiedades",
  Properties: "Propiedades",
  Transform: "Transformación",
  Position: "Posición",
  Scale: "Escala",
  Rotation: "Rotación",
  Opacity: "Opacidad",
  Volume: "Volumen",
  Speed: "Velocidad",
  Duration: "Duración",

  // ── Texto y títulos ───────────────────────────────────────────────────────
  "Add Title": "Añadir título",
  "Caption text here": "Escribe el subtítulo acá",
  Caption: "Subtítulo",
  "Add title presets and caption elements.": "Títulos listos y subtítulos.",
  "Create shapes, arrows, and SVG overlays.": "Formas, flechas y superposiciones SVG.",

  // ── Exportación ───────────────────────────────────────────────────────────
  Exporting: "Exportando",
  "Export Video": "Exportar video",
  Quality: "Calidad",
  Format: "Formato",
  Resolution: "Resolución",
  Cancel: "Cancelar",
  Close: "Cerrar",
  Done: "Listo",

  "AI Generate": "Generar con IA",
  Recipes: "Recetas",
  "Project Templates": "Plantillas de proyecto",
  "Project Media": "Material del proyecto",
  // ── Errores y estados ─────────────────────────────────────────────────────
  Loading: "Cargando",
  "Loading editor...": "Abriendo el editor…",
  Error: "Error",
  "Try again": "Intentar de nuevo",
};

/**
 * Traduce si hay traducción; si no, devuelve el original.
 *
 * **Nunca devuelve vacío ni la clave decorada.** Un texto sin traducir sale en inglés y la pantalla
 * sigue siendo usable — que es la diferencia entre una traducción incremental y una a medias.
 */
export function t(original: string): string {
  return ES[original] ?? original;
}

/** Cuántas frases hay traducidas. La usa la prueba que vigila que el diccionario no encoja. */
export function cuantasTraducidas(): number {
  return Object.keys(ES).length;
}
