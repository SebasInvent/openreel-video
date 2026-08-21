import { useProjectStore } from "../../stores/project-store";
import {
  contextoCoincide,
  eventoVieneDelPadre,
  leerMensajeDeSkyNet,
  MENSAJE_OPENREEL_ABRIR,
  MENSAJE_OPENREEL_AUTOSAVE,
  MENSAJE_OPENREEL_AUTOSAVE_ACK,
  MENSAJE_OPENREEL_CANCELAR_RENDER,
  MENSAJE_OPENREEL_LISTO,
  MENSAJE_OPENREEL_RENDER,
  MENSAJE_OPENREEL_RENDERIZAR,
  MENSAJE_OPENREEL_RESULTADO,
  type AbrirOpenReel,
  type ContextoOpenReel,
  type RenderizarOpenReel,
  VERSION_OPENREEL,
} from "./contratoV2";
import { RUTA_EDITOR } from "./entrada";
import { montarProyecto, segmentosConservados } from "./montaje";
import { cancelarRenderActivo, renderizarYSubir } from "./renderV2";
import {
  crearSnapshotOpenReel,
  rehidratarSnapshotOpenReel,
  snapshotExigeConflicto,
} from "./snapshotV2";

interface SesionV2 {
  contexto: ContextoOpenReel;
  origen: string;
  mediaId: string;
  dejarDeEscucharProyecto: (() => void) | null;
  autosave: ReturnType<typeof setTimeout> | null;
  renderId: string | null;
  renderCancelado: boolean;
}

let sesion: SesionV2 | null = null;

function origenesConfigurados(): string {
  return (import.meta.env?.VITE_SKYNET_ORIGENES as string | undefined) ?? "";
}

export function escucharOpenReelV2(origenes = origenesConfigurados()): () => void {
  const recibir = async (evento: MessageEvent) => {
    if (!eventoVieneDelPadre(evento, origenes, window.parent)) return;
    const mensaje = leerMensajeDeSkyNet(evento.data);
    if (!mensaje) return;

    if (mensaje.tipo === MENSAJE_OPENREEL_ABRIR) {
      await abrirProyecto(mensaje, evento.origin);
      return;
    }
    if (!sesion || !contextoCoincide(mensaje.contexto, sesion.contexto, true)) return;

    if (mensaje.tipo === MENSAJE_OPENREEL_AUTOSAVE_ACK) {
      sesion.contexto = mensaje.contexto;
      return;
    }
    if (mensaje.tipo === MENSAJE_OPENREEL_RENDERIZAR) {
      if (sesion.renderId) return;
      void ejecutarRender(mensaje);
      return;
    }
    if (
      mensaje.tipo === MENSAJE_OPENREEL_CANCELAR_RENDER &&
      sesion.renderId === mensaje.solicitudId
    ) {
      sesion.renderCancelado = true;
      cancelarRenderActivo();
      responder(sesion.origen, {
        tipo: MENSAJE_OPENREEL_RENDER,
        contexto: sesion.contexto,
        solicitudId: mensaje.solicitudId,
        estado: "cancelado",
        progreso: 0,
      });
    }
  };

  window.addEventListener("message", recibir);
  if (window.parent !== window) {
    for (const origen of origenes.split(",").map((item) => item.trim()).filter(Boolean)) {
      window.parent.postMessage(
        { tipo: MENSAJE_OPENREEL_LISTO, version: VERSION_OPENREEL },
        origen,
      );
    }
  }
  return () => window.removeEventListener("message", recibir);
}

async function abrirProyecto(mensaje: AbrirOpenReel, origen: string): Promise<void> {
  if (
    snapshotExigeConflicto(mensaje.snapshot, mensaje.contexto.revision, mensaje.modo)
  ) {
    responder(origen, {
      tipo: MENSAJE_OPENREEL_RESULTADO,
      contexto: mensaje.contexto,
      resultado: {
        ok: false,
        motivo: "conflicto-edicion-manual",
        detalle:
          "SkyNet cambió después del último ajuste manual. Puedes conservar la copia o confirmar que quieres reconstruir la pista.",
        requiereConfirmacion: true,
      },
    });
    return;
  }

  let bytes: Blob;
  try {
    const respuesta = await fetch(mensaje.material.lectura.url, {
      headers: mensaje.material.lectura.headers,
    });
    if (!respuesta.ok) throw new Error(`MinIO respondió ${respuesta.status}.`);
    bytes = await respuesta.blob();
  } catch (error) {
    responder(origen, {
      tipo: MENSAJE_OPENREEL_RESULTADO,
      contexto: mensaje.contexto,
      resultado: {
        ok: false,
        motivo: "sin-bytes",
        detalle: error instanceof Error ? error.message : "No se pudo descargar el material.",
      },
    });
    return;
  }

  limpiarSesion();
  let mediaId = "";
  let recuperado = false;
  if (mensaje.snapshot && mensaje.modo === "conservar-manual") {
    const lectura = rehidratarSnapshotOpenReel(
      mensaje.snapshot,
      bytes,
      mensaje.material.lectura.url,
    );
    if (!lectura.ok) {
      responder(origen, {
        tipo: MENSAJE_OPENREEL_RESULTADO,
        contexto: mensaje.contexto,
        resultado: { ok: false, motivo: lectura.motivo, detalle: lectura.detalle },
      });
      return;
    }
    useProjectStore.getState().loadProject(lectura.proyecto);
    mediaId = mensaje.snapshot.mediaId;
    recuperado = true;
  } else {
    const archivo = new File([bytes], mensaje.material.nombre, {
      type: mensaje.material.tipoMime || bytes.type || "video/mp4",
    });
    const store = useProjectStore.getState();
    const importado = await store.importMedia(archivo);
    if (!importado.success || !importado.actionId) {
      responder(origen, {
        tipo: MENSAJE_OPENREEL_RESULTADO,
        contexto: mensaje.contexto,
        resultado: {
          ok: false,
          motivo: "no-se-importo",
          detalle: importado.error?.message ?? "OpenReel no pudo leer el material.",
        },
      });
      return;
    }
    mediaId = importado.actionId;
    const despues = useProjectStore.getState();
    const media = despues.getMediaItem(mediaId);
    if (!media) return;
    const traspaso = convertirAMontaje(mensaje);
    despues.loadProject(montarProyecto(traspaso, media, despues.project));
  }

  if (window.location.hash !== RUTA_EDITOR) window.location.hash = RUTA_EDITOR;
  sesion = {
    contexto: mensaje.contexto,
    origen,
    mediaId,
    dejarDeEscucharProyecto: null,
    autosave: null,
    renderId: null,
    renderCancelado: false,
  };
  sesion.dejarDeEscucharProyecto = useProjectStore.subscribe(
    (estado) => estado.project,
    () => programarAutosave(),
  );
  responder(origen, {
    tipo: MENSAJE_OPENREEL_RESULTADO,
    contexto: mensaje.contexto,
    resultado: { ok: true, recuperado },
  });
}

function convertirAMontaje(mensaje: AbrirOpenReel) {
  const decisiones = mensaje.decisiones
    .filter((decision) => decision.tipo === "corte")
    .map((decision) => ({
      id: String(decision.id ?? ""),
      tipo: String(decision.clase ?? "recorte"),
      desdeMs: Number(decision.desdeMs),
      hastaMs: Number(decision.hastaMs),
      porque: String(decision.porque ?? "Decisión de SkyNet"),
      estado: objeto(decision.resolucion)
        ? (decision.resolucion.estado as "aceptada" | "descartada")
        : ("propuesta" as const),
      origen: objeto(decision.propuestaPor)
        ? (decision.propuestaPor.clase as "analisis" | "modelo" | "persona")
        : ("persona" as const),
    }));
  return {
    version: 1,
    material: {
      nombre: mensaje.material.nombre,
      tipoMime: mensaje.material.tipoMime,
      duracionMs: mensaje.material.duracionMs,
      fuente: { clase: "url" as const, url: mensaje.material.lectura.url },
    },
    segmentos: segmentosConservados(mensaje.material.duracionMs, decisiones),
    decisiones,
  };
}

function programarAutosave(): void {
  if (!sesion) return;
  if (sesion.autosave) clearTimeout(sesion.autosave);
  sesion.autosave = setTimeout(() => {
    if (!sesion) return;
    const snapshot = crearSnapshotOpenReel(
      useProjectStore.getState().getFullProject(),
      sesion.mediaId,
      sesion.contexto.revision,
    );
    if (!snapshot) {
      responder(sesion.origen, {
        tipo: MENSAJE_OPENREEL_RESULTADO,
        contexto: sesion.contexto,
        resultado: {
          ok: false,
          motivo: "snapshot-demasiado-grande",
          detalle: "La copia de recuperación supera el límite. El borrador local sigue intacto.",
        },
      });
      return;
    }
    responder(sesion.origen, {
      tipo: MENSAJE_OPENREEL_AUTOSAVE,
      contexto: sesion.contexto,
      snapshot,
    });
  }, 1_200);
}

async function ejecutarRender(mensaje: RenderizarOpenReel): Promise<void> {
  if (!sesion) return;
  sesion.renderId = mensaje.solicitudId;
  sesion.renderCancelado = false;
  const contexto = sesion.contexto;
  const origen = sesion.origen;
  try {
    const resultado = await renderizarYSubir(
      useProjectStore.getState().getFullProject(),
      mensaje.destino,
      (progreso) =>
        responder(origen, {
          tipo: MENSAJE_OPENREEL_RENDER,
          contexto,
          solicitudId: mensaje.solicitudId,
          estado: "renderizando",
          progreso,
        }),
    );
    if (sesion?.renderCancelado) return;
    responder(origen, {
      tipo: MENSAJE_OPENREEL_RENDER,
      contexto,
      solicitudId: mensaje.solicitudId,
      estado: "listo",
      progreso: 100,
      resultado,
    });
  } catch (error) {
    if (sesion?.renderCancelado) return;
    responder(origen, {
      tipo: MENSAJE_OPENREEL_RENDER,
      contexto,
      solicitudId: mensaje.solicitudId,
      estado: "error",
      progreso: 0,
      error: error instanceof Error ? error.message : "Falló el render.",
    });
  } finally {
    if (sesion) sesion.renderId = null;
  }
}

function limpiarSesion(): void {
  if (!sesion) return;
  sesion.dejarDeEscucharProyecto?.();
  if (sesion.autosave) clearTimeout(sesion.autosave);
  sesion = null;
}

function responder(origen: string, mensaje: unknown): void {
  window.parent.postMessage(mensaje, origen);
}

function objeto(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === "object" && !Array.isArray(input);
}
