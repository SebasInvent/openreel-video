/**
 * El contrato con SkyNet — la mitad que vive en el editor.
 *
 * SkyNet (el Estudio de Código Enigma) es quien decide QUÉ se corta: la persona escribe un encargo
 * en español, un análisis mide el audio, un modelo propone, y cada decisión se acepta o se descarta
 * de a una. Lo que llega aquí es el resultado de eso, ya resuelto. Este editor no vuelve a decidir:
 * monta.
 *
 * ## Por qué hay una copia de este archivo en el otro repositorio
 *
 * SkyNet es una app Next.js en otro repositorio y otro despliegue. No hay import posible entre las
 * dos mitades, así que este archivo es un GEMELO de `src/lib/estudio/traspasoAlEditor.ts` de SkyNet
 * y las pruebas de aquel comprueban que lo que arma pasa por lo que este exige. Si algo cambia, se
 * cambia en los dos y se sube `VERSION`: un contrato entre dos cosas que se despliegan por separado
 * y no lleva versión se rompe en silencio, y el síntoma aparece en la mitad que no se tocó.
 *
 * ## Milisegundos
 *
 * Todo lo que entra por aquí está en milisegundos ENTEROS, que es el dominio de SkyNet. Este editor
 * trabaja en segundos. La conversión ocurre en un solo sitio —`montaje.ts`— a propósito: repartida
 * en varios, cada uno redondea a su manera y el desfase aparece al final del video, lejos de donde
 * se causó.
 */

/** Sube cuando cambia la FORMA de lo que viaja. Un sobre de otra versión se rechaza, no se adivina. */
export const VERSION = 1;

/** Nombre del mensaje. Un `postMessage` sin tipo se confunde con los de las extensiones. */
export const MENSAJE_TRASPASO = "skynet:estudio:traspaso-al-editor";

/**
 * Aviso de que este editor ya está escuchando.
 *
 * Existe porque sin él hay una carrera que se pierde casi siempre: el padre monta el iframe y
 * manda el traspaso mientras este módulo todavía no ha registrado su `listener`, y el mensaje se
 * pierde sin dejar rastro. El padre espera este aviso y entonces manda.
 */
export const MENSAJE_LISTO = "skynet:editor:listo";

/** Cómo le fue al traspaso. El padre lo enseña: un traspaso que falla en silencio parece colgado. */
export const MENSAJE_RESULTADO = "skynet:editor:resultado";

export type FuenteDelMaterial =
  | { clase: "url"; url: string }
  | { clase: "bytes"; datos: Blob };

export interface MaterialDelTraspaso {
  nombre: string;
  tipoMime: string;
  /** Duración del material ÍNTEGRO, en milisegundos. Árbitro de todo lo demás. */
  duracionMs: number;
  fuente: FuenteDelMaterial;
}

export interface SegmentoDelTraspaso {
  desdeMs: number;
  hastaMs: number;
}

export interface DecisionDelTraspaso {
  id: string;
  tipo: string;
  desdeMs: number;
  hastaMs: number;
  porque: string;
  estado: "propuesta" | "aceptada" | "descartada";
  origen: "analisis" | "modelo" | "persona";
}

export interface TraspasoAlEditor {
  version: number;
  material: MaterialDelTraspaso;
  /** Lo que SOBREVIVE, en orden y ya resuelto en SkyNet. Aquí se pega; no se recalcula. */
  segmentos: SegmentoDelTraspaso[];
  /** El registro completo, descartadas incluidas. No se calcula nada con esto. */
  decisiones: DecisionDelTraspaso[];
}

export type MotivoInvalido =
  | "sin-material"
  | "sin-duracion"
  | "no-queda-nada"
  | "version-desconocida"
  | "forma-invalida";

export type LecturaDelTraspaso =
  | { ok: true; traspaso: TraspasoAlEditor }
  | { ok: false; motivo: MotivoInvalido; detalle: string };

/**
 * Valida un sobre recibido.
 *
 * Deliberadamente desconfiada: lo que entra por `postMessage` no es una llamada a función, es un
 * dato de fuera, y cualquier pestaña puede mandar uno. Aquí no se asume nada — ni que los números
 * sean números, ni que los segmentos quepan en el material.
 */
export function leerTraspaso(crudo: unknown): LecturaDelTraspaso {
  if (!crudo || typeof crudo !== "object") {
    return { ok: false, motivo: "forma-invalida", detalle: "El mensaje no es un objeto." };
  }
  const o = crudo as Record<string, unknown>;

  if (o.version !== VERSION) {
    return {
      ok: false,
      motivo: "version-desconocida",
      detalle: `Este editor entiende la versión ${VERSION} del traspaso y llegó ${String(o.version)}.`,
    };
  }

  const material = o.material as Record<string, unknown> | undefined;
  const fuente = material?.fuente as Record<string, unknown> | undefined;
  const fuenteValida =
    (fuente?.clase === "url" && typeof fuente.url === "string" && fuente.url.length > 0) ||
    (fuente?.clase === "bytes" && fuente.datos instanceof Blob);
  if (!material || typeof material.nombre !== "string" || !material.nombre || !fuenteValida) {
    return { ok: false, motivo: "sin-material", detalle: "El sobre no trae material utilizable." };
  }

  const duracionMs = Number(material.duracionMs);
  if (!Number.isFinite(duracionMs) || duracionMs <= 0) {
    return { ok: false, motivo: "sin-duracion", detalle: "El sobre no dice cuánto dura." };
  }

  const segmentos: SegmentoDelTraspaso[] = [];
  for (const s of Array.isArray(o.segmentos) ? o.segmentos : []) {
    if (!s || typeof s !== "object") continue;
    const t = s as Record<string, unknown>;
    const desdeMs = Number(t.desdeMs);
    const hastaMs = Number(t.hastaMs);
    if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs)) continue;
    // Se recorta al material en vez de confiar: un segmento que se pasa del final produce un clip
    // cuyo `outPoint` no existe, y el monitor lo pinta como cuadros congelados al terminar.
    const inicio = Math.max(0, Math.min(desdeMs, duracionMs));
    const fin = Math.max(0, Math.min(hastaMs, duracionMs));
    if (fin - inicio >= 1) segmentos.push({ desdeMs: inicio, hastaMs: fin });
  }
  if (segmentos.length === 0) {
    return {
      ok: false,
      motivo: "no-queda-nada",
      detalle: "El sobre no trae ni un segmento que se pueda montar.",
    };
  }

  const decisiones = (Array.isArray(o.decisiones) ? o.decisiones : []).filter(
    (d): d is DecisionDelTraspaso =>
      !!d && typeof d === "object" && typeof (d as DecisionDelTraspaso).porque === "string",
  );

  return {
    ok: true,
    traspaso: {
      version: VERSION,
      material: material as unknown as MaterialDelTraspaso,
      segmentos,
      decisiones,
    },
  };
}

/**
 * ¿Este origen tiene permiso para mandar traspasos?
 *
 * La lista viene de `VITE_SKYNET_ORIGENES` (separados por coma) y **nunca hay comodín**. Es la
 * única puerta entre «SkyNet manda un montaje» y «cualquier página que consiga incrustar el editor
 * manda un montaje»: sin esto, una pestaña ajena puede reemplazar el proyecto abierto del usuario
 * y —peor— hacer que el editor baje una URL que ella elija.
 */
export function origenPermitido(origen: string, permitidos: string): boolean {
  // Un origen OPACO —iframe con `sandbox` sin `allow-same-origin`, un `data:`, un `file:`— llega
  // como la CADENA "null", no como vacío. Se rechaza antes de comparar: si alguien escribiera
  // `null` en la lista de permitidos, cualquier documento opaco del mundo entraría de golpe.
  if (!origen || origen === "null") return false;
  const lista = permitidos
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return lista.includes(origen);
}
