/**
 * Gemelo del contrato v2 de SkyNet.
 *
 * Este archivo no se puede importar desde el repositorio Next.js. Por eso valida en runtime la
 * versión, el alcance y cada referencia temporal. El listener que lo use además debe exigir origen
 * permitido Y `event.source === window.parent`; compartir origen no convierte otra ventana en el
 * padre que abrió la sesión.
 */

export const VERSION_OPENREEL = 2;
export const MENSAJE_OPENREEL_LISTO = "skynet:editor:listo-v2";
export const MENSAJE_OPENREEL_ABRIR = "skynet:estudio:abrir-v2";
export const MENSAJE_OPENREEL_RESULTADO = "skynet:editor:resultado-v2";
export const MENSAJE_OPENREEL_AUTOSAVE = "skynet:editor:autosave-v2";
export const MENSAJE_OPENREEL_AUTOSAVE_ACK = "skynet:estudio:autosave-ack-v2";
export const MENSAJE_OPENREEL_RENDERIZAR = "skynet:estudio:renderizar-v2";
export const MENSAJE_OPENREEL_RENDER = "skynet:editor:render-v2";
export const MENSAJE_OPENREEL_CANCELAR_RENDER = "skynet:estudio:cancelar-render-v2";

export interface ContextoOpenReel {
  version: typeof VERSION_OPENREEL;
  orgId: string;
  proyectoEditorId: string;
  revision: number;
  correlacionId: string;
}

export interface ReferenciaFirmadaOpenReel {
  metodo: "GET" | "PUT";
  url: string;
  headers: Record<string, string>;
  venceEn: number;
}

export interface SnapshotOpenReel {
  version: 1;
  revisionSkyNet: number;
  guardadoEn: number;
  mediaId: string;
  proyecto: Record<string, unknown>;
}

export interface AbrirOpenReel {
  tipo: typeof MENSAJE_OPENREEL_ABRIR;
  contexto: ContextoOpenReel;
  material: {
    id: string;
    nombre: string;
    tipoMime: string;
    duracionMs: number;
    lectura: ReferenciaFirmadaOpenReel;
  };
  decisiones: Array<Record<string, unknown>>;
  snapshot: SnapshotOpenReel | null;
  modo: "conservar-manual" | "reconstruir";
}

export interface RenderizarOpenReel {
  tipo: typeof MENSAJE_OPENREEL_RENDERIZAR;
  contexto: ContextoOpenReel;
  solicitudId: string;
  destino: ReferenciaFirmadaOpenReel;
  nombre: string;
}

export type MensajeDeSkyNet =
  | AbrirOpenReel
  | RenderizarOpenReel
  | { tipo: typeof MENSAJE_OPENREEL_AUTOSAVE_ACK; contexto: ContextoOpenReel }
  | {
      tipo: typeof MENSAJE_OPENREEL_CANCELAR_RENDER;
      contexto: ContextoOpenReel;
      solicitudId: string;
    };

export function leerMensajeDeSkyNet(input: unknown, ahora = Date.now()): MensajeDeSkyNet | null {
  if (!objeto(input) || typeof input.tipo !== "string") return null;
  const contexto = leerContexto(input.contexto);
  if (!contexto) return null;
  if (input.tipo === MENSAJE_OPENREEL_AUTOSAVE_ACK) {
    return { tipo: MENSAJE_OPENREEL_AUTOSAVE_ACK, contexto };
  }
  if (
    input.tipo === MENSAJE_OPENREEL_CANCELAR_RENDER &&
    typeof input.solicitudId === "string"
  ) {
    return { tipo: MENSAJE_OPENREEL_CANCELAR_RENDER, contexto, solicitudId: input.solicitudId };
  }
  if (input.tipo === MENSAJE_OPENREEL_RENDERIZAR) {
    const destino = leerReferencia(input.destino, "PUT", ahora);
    if (!destino || typeof input.solicitudId !== "string" || typeof input.nombre !== "string") {
      return null;
    }
    return {
      tipo: MENSAJE_OPENREEL_RENDERIZAR,
      contexto,
      solicitudId: input.solicitudId,
      destino,
      nombre: input.nombre.slice(0, 180),
    };
  }
  if (input.tipo !== MENSAJE_OPENREEL_ABRIR || !objeto(input.material)) return null;
  const material = input.material;
  const lectura = leerReferencia(material.lectura, "GET", ahora);
  if (
    !lectura ||
    typeof material.id !== "string" ||
    typeof material.nombre !== "string" ||
    typeof material.tipoMime !== "string" ||
    !Number.isFinite(material.duracionMs) ||
    Number(material.duracionMs) <= 0 ||
    (input.modo !== "conservar-manual" && input.modo !== "reconstruir")
  )
    return null;
  const snapshot = input.snapshot === null ? null : leerSnapshot(input.snapshot);
  if (input.snapshot !== null && !snapshot) return null;
  if (!Array.isArray(input.decisiones) || input.decisiones.length > 500) return null;
  const decisiones = input.decisiones.map(leerDecision);
  if (decisiones.some((decision) => !decision)) return null;
  return {
    tipo: MENSAJE_OPENREEL_ABRIR,
    contexto,
    material: {
      id: material.id,
      nombre: material.nombre.slice(0, 180),
      tipoMime: material.tipoMime,
      duracionMs: Number(material.duracionMs),
      lectura,
    },
    decisiones: decisiones as Array<Record<string, unknown>>,
    snapshot,
    modo: input.modo,
  };
}

export function contextoCoincide(
  recibido: ContextoOpenReel,
  esperado: ContextoOpenReel,
  permitirRevisionNueva = false,
): boolean {
  return (
    recibido.version === esperado.version &&
    recibido.orgId === esperado.orgId &&
    recibido.proyectoEditorId === esperado.proyectoEditorId &&
    recibido.correlacionId === esperado.correlacionId &&
    (recibido.revision === esperado.revision ||
      (permitirRevisionNueva && recibido.revision > esperado.revision))
  );
}

export function eventoVieneDelPadre(
  evento: Pick<MessageEvent, "origin" | "source">,
  origenes: string,
  padre: unknown,
): boolean {
  const permitidos = origenes
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && item !== "null");
  return permitidos.includes(evento.origin) && !!padre && evento.source === padre;
}

function leerContexto(input: unknown): ContextoOpenReel | null {
  if (
    !objeto(input) ||
    input.version !== VERSION_OPENREEL ||
    !id(input.orgId) ||
    !id(input.proyectoEditorId) ||
    !Number.isInteger(input.revision) ||
    Number(input.revision) < 1 ||
    typeof input.correlacionId !== "string" ||
    !/^[a-f0-9-]{20,60}$/i.test(input.correlacionId)
  )
    return null;
  return {
    version: VERSION_OPENREEL,
    orgId: input.orgId,
    proyectoEditorId: input.proyectoEditorId,
    revision: Number(input.revision),
    correlacionId: input.correlacionId,
  };
}

function leerReferencia(
  input: unknown,
  metodo: "GET" | "PUT",
  ahora: number,
): ReferenciaFirmadaOpenReel | null {
  if (!objeto(input) || input.metodo !== metodo || typeof input.url !== "string") return null;
  try {
    const url = new URL(input.url);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password) {
      return null;
    }
  } catch {
    return null;
  }
  if (!Number.isFinite(input.venceEn) || Number(input.venceEn) <= ahora + 5_000) return null;
  const headers = objeto(input.headers)
    ? Object.fromEntries(
        Object.entries(input.headers).filter(
          ([clave, valor]) => typeof clave === "string" && typeof valor === "string",
        ),
      ) as Record<string, string>
    : {};
  return { metodo, url: input.url, headers, venceEn: Number(input.venceEn) };
}

function leerSnapshot(input: unknown): SnapshotOpenReel | null {
  if (
    !objeto(input) ||
    input.version !== 1 ||
    !Number.isInteger(input.revisionSkyNet) ||
    Number(input.revisionSkyNet) < 1 ||
    typeof input.mediaId !== "string" ||
    !objeto(input.proyecto)
  )
    return null;
  return {
    version: 1,
    revisionSkyNet: Number(input.revisionSkyNet),
    guardadoEn: Number(input.guardadoEn) || Date.now(),
    mediaId: input.mediaId,
    proyecto: input.proyecto,
  };
}

function leerDecision(input: unknown): Record<string, unknown> | null {
  if (!objeto(input) || typeof input.id !== "string" || typeof input.porque !== "string") return null;
  if (!objeto(input.propuestaPor)) return null;
  const propuesta = input.propuestaPor;
  if (
    !["analisis", "modelo", "persona"].includes(String(propuesta.clase)) ||
    typeof propuesta.actorId !== "string" ||
    !Number.isFinite(propuesta.propuestaEn)
  )
    return null;
  if (input.resolucion !== null) {
    if (!objeto(input.resolucion)) return null;
    if (
      !["aceptada", "descartada"].includes(String(input.resolucion.estado)) ||
      typeof input.resolucion.actorId !== "string" ||
      !Number.isFinite(input.resolucion.resueltaEn)
    )
      return null;
  }
  const desdeMs = Number(input.desdeMs);
  const hastaMs = Number(input.hastaMs);
  if (!Number.isFinite(desdeMs) || desdeMs < 0 || !Number.isFinite(hastaMs) || hastaMs <= desdeMs) {
    return null;
  }
  if (
    input.tipo === "corte" &&
    ["silencio", "ritmo", "recorte"].includes(String(input.clase))
  )
    return input;
  if (
    input.tipo === "texto" &&
    typeof input.texto === "string" &&
    input.texto.trim() &&
    ["arriba", "centro", "abajo"].includes(String(input.posicion))
  )
    return input;
  if (
    input.tipo === "velocidad" &&
    Number.isFinite(input.factor) &&
    Number(input.factor) >= 0.25 &&
    Number(input.factor) <= 4
  )
    return input;
  return null;
}

function objeto(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === "object" && !Array.isArray(input);
}

function id(input: unknown): input is string {
  return typeof input === "string" && /^[A-Za-z0-9_-]{2,120}$/.test(input);
}
