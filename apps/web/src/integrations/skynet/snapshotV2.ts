import type { Project } from "@openreel/core";
import type { SnapshotOpenReel } from "./contratoV2";

const MAX_SNAPSHOT_BYTES = 700_000;

export type LecturaSnapshot =
  | { ok: true; proyecto: Project }
  | { ok: false; motivo: "demasiado-grande" | "forma-invalida"; detalle: string };

export function crearSnapshotOpenReel(
  proyecto: Project,
  mediaId: string,
  revisionSkyNet: number,
): SnapshotOpenReel | null {
  try {
    const json = JSON.stringify(proyecto, (_clave, valor) =>
      typeof Blob !== "undefined" && valor instanceof Blob ? undefined : valor,
    );
    if (!json || new TextEncoder().encode(json).byteLength > MAX_SNAPSHOT_BYTES) return null;
    return {
      version: 1,
      revisionSkyNet,
      guardadoEn: Date.now(),
      mediaId,
      proyecto: JSON.parse(json) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export function rehidratarSnapshotOpenReel(
  snapshot: SnapshotOpenReel,
  bytes: Blob,
  originalUrl: string,
): LecturaSnapshot {
  try {
    const json = JSON.stringify(snapshot.proyecto);
    if (!json || new TextEncoder().encode(json).byteLength > MAX_SNAPSHOT_BYTES) {
      return { ok: false, motivo: "demasiado-grande", detalle: "La copia guardada supera el límite." };
    }
    const proyecto = JSON.parse(json) as Project;
    if (
      !proyecto ||
      typeof proyecto.id !== "string" ||
      !proyecto.timeline ||
      !Array.isArray(proyecto.timeline.tracks) ||
      !proyecto.mediaLibrary ||
      !Array.isArray(proyecto.mediaLibrary.items)
    ) {
      return { ok: false, motivo: "forma-invalida", detalle: "La copia guardada ya no es compatible." };
    }
    const indice = proyecto.mediaLibrary.items.findIndex((item) => item.id === snapshot.mediaId);
    if (indice < 0) {
      return { ok: false, motivo: "forma-invalida", detalle: "La copia no referencia el material original." };
    }
    const items = [...proyecto.mediaLibrary.items];
    items[indice] = { ...items[indice], blob: bytes, originalUrl };
    return {
      ok: true,
      proyecto: {
        ...proyecto,
        modifiedAt: Date.now(),
        mediaLibrary: { ...proyecto.mediaLibrary, items },
      },
    };
  } catch {
    return { ok: false, motivo: "forma-invalida", detalle: "La copia guardada no se pudo leer." };
  }
}

export function snapshotExigeConflicto(
  snapshot: SnapshotOpenReel | null,
  revisionActual: number,
  modo: "conservar-manual" | "reconstruir",
): boolean {
  return !!snapshot && snapshot.revisionSkyNet !== revisionActual && modo === "conservar-manual";
}
