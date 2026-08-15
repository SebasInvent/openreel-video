/**
 * El montaje: los segmentos que decidió SkyNet se vuelven una línea de tiempo de este editor.
 *
 * Es PURO a propósito — no toca la tienda, ni la red, ni el DOM. Todo lo que necesita entra por
 * parámetro y todo lo que hace sale por el retorno, así que se puede probar entero sin levantar el
 * editor. Lo que decide es demasiado fácil de equivocar en silencio como para dejarlo dentro de un
 * `useEffect`: un desfase de milisegundos aquí no lanza ningún error, solo produce un video mal
 * cortado que nadie mira hasta que ya se exportó.
 *
 * ## La conversión de unidades vive aquí y en ningún otro sitio
 *
 * SkyNet razona en milisegundos ENTEROS; este editor, en segundos con decimales. La división entre
 * mil ocurre en {@link montarLineaDeTiempo} y solo ahí. Las posiciones se acumulan en milisegundos
 * y se dividen al final: sumar segundos con decimales arrastra el error de un corte al siguiente,
 * y con veinte cortes el desfase ya se oye.
 *
 * ## Qué es cada cosa, porque los tres números se confunden
 *
 * - `startTime` — dónde va el clip en la PELÍCULA que se está montando.
 * - `inPoint` / `outPoint` — qué trozo del MATERIAL ORIGINAL se ve en ese clip.
 *
 * Un corte de silencio no borra nada del material: produce dos clips que apuntan a trozos distintos
 * del mismo archivo, pegados uno detrás de otro. Por eso se puede deshacer sin haber perdido nada.
 */

import { createClip, createTrack } from "@openreel/core";
import type { MediaItem, Project, ProjectSettings, Timeline, Track } from "@openreel/core";
import type { SegmentoDelTraspaso, TraspasoAlEditor } from "./contrato";

/** Lienzo por defecto cuando el material no dice sus medidas. Vertical: es lo que se produce. */
const LIENZO_POR_DEFECTO = { width: 1080, height: 1920, frameRate: 30 };

/**
 * Ajustes del proyecto tomados del MATERIAL, no de un preajuste.
 *
 * Importa más de lo que parece: `deriveSourceExportMatch` (`services/export-source-match.ts`)
 * elige la calidad de exportación buscando el video cuyas medidas coinciden con el lienzo. Si el
 * lienzo no coincidiera con el material, la exportación saldría reescalada sin que nadie lo pida.
 */
export function ajustesDesdeMaterial(media: MediaItem | null | undefined): ProjectSettings {
  const m = media?.metadata;
  const width = m?.width && m.width > 0 ? m.width : LIENZO_POR_DEFECTO.width;
  const height = m?.height && m.height > 0 ? m.height : LIENZO_POR_DEFECTO.height;
  const frameRate = m?.frameRate && m.frameRate > 0 ? m.frameRate : LIENZO_POR_DEFECTO.frameRate;
  return {
    width,
    height,
    frameRate,
    sampleRate: m?.sampleRate && m.sampleRate > 0 ? m.sampleRate : 48000,
    channels: m?.channels && m.channels > 0 ? m.channels : 2,
  };
}

export interface LineaDeTiempoMontada {
  pista: Track;
  /** Duración total de la película montada, en segundos. */
  duracion: number;
}

/**
 * Qué SOBREVIVE tras aplicar las decisiones aceptadas. **Gemela de la de SkyNet**, a conciencia.
 *
 * El contrato manda los segmentos ya resueltos justamente para que esta cuenta viviera en un solo
 * sitio, y eso valía mientras SkyNet fuera quien editaba. Ahora el chat vive AQUÍ: aceptar o
 * descartar tiene que redibujar la línea de tiempo al instante, y preguntarle a SkyNet en cada clic
 * convertiría el gesto principal del producto en una ida y vuelta por la red.
 *
 * Así que la autoridad se mueve con la línea de tiempo — **quien la tiene, la calcula**. La copia
 * se guarda con el MISMO vector de prueba que la de SkyNet: si una de las dos deriva, una de las
 * dos suites se cae.
 */
export function segmentosConservados(
  duracionMs: number,
  decisiones: readonly { desdeMs: number; hastaMs: number; estado: string }[],
): SegmentoDelTraspaso[] {
  if (duracionMs <= 0) return [];
  const cortes = decisiones
    .filter((d) => d.estado === "aceptada")
    .map((d) => ({
      desdeMs: Math.max(0, Math.min(d.desdeMs, duracionMs)),
      hastaMs: Math.max(0, Math.min(d.hastaMs, duracionMs)),
    }))
    .filter((t) => t.hastaMs > t.desdeMs)
    .sort((a, b) => a.desdeMs - b.desdeMs);

  // Fusionar solapes: dos cortes encimados no pueden restar dos veces el mismo tiempo.
  const fusionados: SegmentoDelTraspaso[] = [];
  for (const c of cortes) {
    const ultimo = fusionados[fusionados.length - 1];
    if (ultimo && c.desdeMs <= ultimo.hastaMs) ultimo.hastaMs = Math.max(ultimo.hastaMs, c.hastaMs);
    else fusionados.push({ ...c });
  }

  const conservados: SegmentoDelTraspaso[] = [];
  let cursor = 0;
  for (const c of fusionados) {
    if (c.desdeMs > cursor) conservados.push({ desdeMs: cursor, hastaMs: c.desdeMs });
    cursor = Math.max(cursor, c.hastaMs);
  }
  if (cursor < duracionMs) conservados.push({ desdeMs: cursor, hastaMs: duracionMs });
  return conservados;
}

/**
 * Convierte los segmentos en clips pegados uno detrás de otro.
 *
 * Cada segmento es un trozo del material que SOBREVIVIÓ a las decisiones. Se colocan sin huecos:
 * el hueco es justo lo que se cortó, y dejarlo produciría un video con negros donde antes había
 * silencios — el resultado contrario al que la persona aceptó.
 */
export function montarLineaDeTiempo(
  segmentos: readonly SegmentoDelTraspaso[],
  mediaId: string,
  nombrePista = "SkyNet",
): LineaDeTiempoMontada {
  const pista = createTrack("video", nombrePista);

  let posicionMs = 0;
  const clips = segmentos.map((s) => {
    const duracionMs = Math.max(0, s.hastaMs - s.desdeMs);
    // `createClip` da la forma canónica del editor (transform, effects, keyframes…). Se parte de
    // ella en vez de escribir el objeto a mano: el día que el tipo `Clip` gane un campo
    // obligatorio, esto lo hereda en vez de dejar de compilar aquí.
    const base = createClip(mediaId, pista.id, posicionMs / 1000, duracionMs / 1000);
    const clip = {
      ...base,
      // Dónde EMPIEZA y TERMINA dentro del material original. Es lo único que `createClip` no
      // puede saber: para él todo clip arranca en cero.
      inPoint: s.desdeMs / 1000,
      outPoint: s.hastaMs / 1000,
    };
    posicionMs += duracionMs;
    return clip;
  });

  return { pista: { ...pista, clips }, duracion: posicionMs / 1000 };
}

/**
 * El proyecto completo que se le entrega a `loadProject`.
 *
 * `loadProject` REEMPLAZA el proyecto abierto, así que el `MediaItem` que se acaba de importar
 * tiene que venir dentro: si se quedara solo en el proyecto anterior, la línea de tiempo apuntaría
 * con `mediaId` a un medio que ya no existe y el monitor saldría en negro sin un solo error.
 */
export function montarProyecto(
  traspaso: TraspasoAlEditor,
  media: MediaItem,
  anterior: Project,
): Project {
  const { pista, duracion } = montarLineaDeTiempo(traspaso.segmentos, media.id);

  const timeline: Timeline = {
    tracks: [pista],
    subtitles: [],
    duration: duracion,
    markers: [],
  };

  return {
    ...anterior,
    name: traspaso.material.nombre,
    modifiedAt: Date.now(),
    settings: ajustesDesdeMaterial(media),
    mediaLibrary: { items: [media] },
    timeline,
    // Se entra con la línea de tiempo limpia: lo que llega de SkyNet es un montaje nuevo, no un
    // parche sobre lo que hubiera abierto. Arrastrar textos o formas del proyecto anterior dejaría
    // rótulos de otro video encima de este.
    textClips: [],
    shapeClips: [],
    svgClips: [],
    stickerClips: [],
  };
}

/**
 * El resumen que se le devuelve a SkyNet cuando el montaje entra.
 *
 * Lleva los números para que el otro lado pueda COMPARARLOS con los suyos y enseñar el resultado.
 * Que coincidan es la comprobación de que las dos mitades entendieron lo mismo; que no coincidan
 * es un fallo que hay que ver, no uno que se descubra al exportar.
 */
export function resumenDelMontaje(traspaso: TraspasoAlEditor, duracionSeg: number) {
  return {
    clips: traspaso.segmentos.length,
    duracionMs: Math.round(duracionSeg * 1000),
    aceptadas: traspaso.decisiones.filter((d) => d.estado === "aceptada").length,
    descartadas: traspaso.decisiones.filter((d) => d.estado === "descartada").length,
  };
}
