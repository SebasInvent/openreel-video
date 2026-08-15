/**
 * EL PUNTO DE ENTRADA. Lo que SkyNet manda entra por aquí y sale como un proyecto cargado.
 *
 * Este editor no expone API: no publica nada en `window` y el único `addEventListener("message")`
 * del repositorio es el puente interno de ffmpeg. Así que la costura es esta —la misma que usa el
 * propio producto para sus plantillas, que construyen un proyecto y llaman `loadProject`
 * (`components/editor/inspector/TemplatesBrowserPanel.tsx:251`)— envuelta en un `listener` con la
 * puerta cerrada.
 *
 * ## El orden importa, y este es el porqué de cada paso
 *
 * 1. **Origen.** Antes de mirar el contenido. Sin esta puerta, cualquier página que consiga
 *    incrustar el editor puede reemplazar el proyecto abierto del usuario y, peor, hacer que este
 *    editor descargue una URL que ella elija.
 * 2. **Contrato.** `leerTraspaso` desconfía de todo: versión, forma, y que los segmentos quepan en
 *    el material.
 * 3. **Bytes.** Medido en este repositorio: `MediaItem.blob` **no es opcional en la práctica**.
 *    `Preview.tsx:2008` y `Preview.tsx:2321` se rinden con `if (!mediaItem?.blob) return null`, y
 *    `originalUrl` solo sirve de respaldo en el modo recorte y en las pistas de motion. Un proyecto
 *    con la URL y sin bytes carga una línea de tiempo perfecta sobre un monitor EN NEGRO — el peor
 *    fallo posible, porque parece que funcionó.
 * 4. **`importMedia`.** Se reutiliza la tubería del editor en vez de fabricar un `MediaItem` a
 *    mano: de ahí salen medidas, fotogramas, forma de onda y la persistencia en IndexedDB. Un
 *    `MediaItem` inventado con ceros hace que la exportación salga reescalada, porque
 *    `deriveSourceExportMatch` elige la calidad comparando medidas.
 * 5. **`loadProject`.** Con el medio ya dentro del proyecto nuevo.
 */

import { useProjectStore } from "../../stores/project-store";
import {
  MENSAJE_LISTO,
  MENSAJE_PROPUESTAS,
  MENSAJE_RESULTADO,
  MENSAJE_TRASPASO,
  leerTraspaso,
  origenPermitido,
  type MotivoInvalido,
  type RespuestaDeEncargo,
  type TraspasoAlEditor,
} from "./contrato";
import { useEstadoSkynet } from "./estadoSkynet";
import { montarLineaDeTiempo, montarProyecto, resumenDelMontaje } from "./montaje";

export type MotivoDeFallo = MotivoInvalido | "sin-bytes" | "no-se-importo" | "ocupado";

export type ResultadoDelTraspaso =
  | { ok: true; resumen: ReturnType<typeof resumenDelMontaje> }
  | { ok: false; motivo: MotivoDeFallo; detalle: string };

/** Lo que el editor entiende como «de dónde puede venir un traspaso». Nunca lleva comodín. */
function origenesConfigurados(): string {
  return (import.meta.env?.VITE_SKYNET_ORIGENES as string | undefined) ?? "";
}

/**
 * Consigue los bytes del material.
 *
 * Los dos casos no son «producción» y «desarrollo», son dos situaciones reales: el material ya
 * subido al MinIO del cliente, y el material que sigue en el equipo de quien lo grabó. Para el
 * segundo no vale mandar la cadena `blob:` — es una URL atada al documento que la creó y desde
 * este origen no se puede leer— así que viaja el `Blob` mismo por clonado estructurado.
 */
async function conseguirBytes(traspaso: TraspasoAlEditor): Promise<Blob | null> {
  const fuente = traspaso.material.fuente;
  if (fuente.clase === "bytes") return fuente.datos;
  try {
    const r = await fetch(fuente.url);
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}

/**
 * La ruta del editor, en el formato que entiende `hooks/use-router.ts`.
 *
 * Se escribe el hash a pelo en vez de usar `useRouter()` porque esto no es un componente de React:
 * el router lee `window.location.hash` y escucha `hashchange`, así que asignarlo produce
 * exactamente el mismo efecto que `navigate("editor")` desde dentro del árbol.
 */
export const RUTA_EDITOR = '#/editor';

function irAlEditor(): void {
  if (window.location.hash !== RUTA_EDITOR) window.location.hash = RUTA_EDITOR;
}

/**
 * Aplica un traspaso ya validado. Separada del `listener` para poder probarla sin `postMessage`.
 */
export async function aplicarTraspaso(
  traspaso: TraspasoAlEditor,
  /** De dónde vino. Con él se siembra el chat: es a quien le va a contestar. */
  origen?: string,
): Promise<ResultadoDelTraspaso> {
  const bytes = await conseguirBytes(traspaso);
  if (!bytes) {
    return {
      ok: false,
      motivo: "sin-bytes",
      detalle: "No pude descargar el material. Sin sus bytes la línea de tiempo sale en negro.",
    };
  }

  const archivo = new File([bytes], traspaso.material.nombre, {
    type: traspaso.material.tipoMime || bytes.type || "video/mp4",
  });

  const store = useProjectStore.getState();
  const importado = await store.importMedia(archivo);
  // `importMedia` devuelve el id del medio en `actionId` (`stores/project/media-slice.ts`).
  const mediaId = importado.actionId;
  if (!importado.success || !mediaId) {
    return {
      ok: false,
      motivo: "no-se-importo",
      detalle: importado.error?.message ?? "El editor no pudo leer ese archivo.",
    };
  }

  // Se relee la tienda: `importMedia` acaba de escribir en ella, y el `MediaItem` que hace falta
  // es el que quedó ahí —con sus medidas y su forma de onda—, no el que había antes de importar.
  const despues = useProjectStore.getState();
  const media = despues.getMediaItem(mediaId);
  if (!media) {
    return {
      ok: false,
      motivo: "no-se-importo",
      detalle: "El material se importó pero no quedó en la biblioteca.",
    };
  }

  const proyecto = montarProyecto(traspaso, media, despues.project);
  despues.loadProject(proyecto);

  // ABRIR EL EDITOR. Sin esto el montaje entra en la tienda y **no se ve**: la raíz de esta app es
  // la pantalla de bienvenida («From idea to export»), no la línea de tiempo, y `App.tsx` decide
  // cuál pinta a partir de la ruta del hash. O sea que sin esta línea el usuario acepta sus cortes,
  // se le dice «el editor lo montó» y se queda mirando una pantalla de inicio — que es exactamente
  // lo que se reportó el 15-ago. Va DESPUÉS de `loadProject` para que la línea de tiempo se monte
  // con el proyecto ya puesto y no con el anterior.
  irAlEditor();

  // El chat hereda las decisiones que vinieron con el montaje: la conversación no empieza en
  // blanco, empieza donde la dejaste en SkyNet.
  if (origen) useEstadoSkynet.getState().sembrar(traspaso, media.id, origen);

  const { duracion } = montarLineaDeTiempo(traspaso.segmentos, media.id);
  return { ok: true, resumen: resumenDelMontaje(traspaso, duracion) };
}

/** Un traspaso a la vez. Dos a la vez se pisan en `loadProject` y gana el que termine último. */
let enCurso = false;

/**
 * Registra el punto de entrada y avisa al padre de que ya escucha.
 *
 * El aviso no es cortesía: sin él hay una carrera que se pierde casi siempre. El padre monta el
 * iframe y manda el traspaso mientras este módulo todavía no ha registrado su `listener`; el
 * mensaje se pierde y no queda rastro de por qué. Con el aviso, el padre manda cuando hay quien oiga.
 *
 * @returns una función para dejar de escuchar.
 */
export function escucharTraspasos(origenes = origenesConfigurados()): () => void {
  const alRecibir = async (evento: MessageEvent) => {
    // 1 · La puerta. Antes de mirar el contenido.
    if (!origenPermitido(evento.origin, origenes)) return;
    // Dos mensajes entran por aquí: el TRASPASO (montaje nuevo) y las PROPUESTAS (respuesta a un
    // encargo escrito en el chat). Cualquier otro se ignora sin ruido: en una pestaña cualquiera
    // manda mensajes, y contestarlos sería convertir el editor en un oráculo.
    const datos = evento.data as { tipo?: string; traspaso?: unknown } | null;
    if (!datos || (datos.tipo !== MENSAJE_TRASPASO && datos.tipo !== MENSAJE_PROPUESTAS)) return;

    const responder = (resultado: ResultadoDelTraspaso) => {
      // Se responde al origen concreto, nunca a `"*"`: la respuesta dice qué material se montó.
      (evento.source as WindowProxy | null)?.postMessage(
        { tipo: MENSAJE_RESULTADO, resultado },
        { targetOrigin: evento.origin },
      );
    };

    // LAS PROPUESTAS QUE VUELVEN. Es la otra mitad del canal: el editor preguntó y SkyNet
    // contesta. Nunca llegan aplicadas — entran a la lista como propuestas y decide la persona.
    if (datos.tipo === MENSAJE_PROPUESTAS) {
      const r = (datos as { respuesta?: RespuestaDeEncargo }).respuesta;
      const est = useEstadoSkynet.getState();
      est.setPensando(false);
      if (!r) return;
      if (r.ok) {
        est.agregar(r.decisiones);
        if (r.aviso) est.setAviso(r.aviso);
      } else {
        est.setAviso(r.detalle);
      }
      return;
    }

    if (enCurso) {
      responder({
        ok: false,
        motivo: "ocupado",
        detalle: "Hay un montaje en curso. Espera a que termine antes de mandar otro.",
      });
      return;
    }

    // 2 · El contrato.
    const lectura = leerTraspaso(datos.traspaso);
    if (!lectura.ok) {
      responder({ ok: false, motivo: lectura.motivo, detalle: lectura.detalle });
      return;
    }

    enCurso = true;
    try {
      responder(await aplicarTraspaso(lectura.traspaso, evento.origin));
    } catch (e) {
      responder({
        ok: false,
        motivo: "no-se-importo",
        detalle: e instanceof Error ? e.message : String(e),
      });
    } finally {
      enCurso = false;
    }
  };

  // Sin `as EventListener`: la sobrecarga de `addEventListener` ya tipa `"message"` como
  // `MessageEvent` (vía `WindowEventMap`), así que el cast no aportaba nada — y además NO COMPILA:
  // `EventListener` recibe `Event`, y TypeScript se niega a convertir un manejador de `MessageEvent`
  // porque `Event` no tiene `data` ni `origin`. Medido el 15-ago: `pnpm build` fallaba con dos
  // TS2352 aquí, o sea que este archivo nunca se habia construido.
  window.addEventListener("message", alRecibir);

  // Al padre y solo al padre, y solo si el editor está incrustado.
  if (window.parent !== window) {
    for (const origen of origenes.split(",").map((o) => o.trim()).filter(Boolean)) {
      window.parent.postMessage({ tipo: MENSAJE_LISTO }, origen);
    }
  }

  return () => window.removeEventListener("message", alRecibir);
}
