import {
  getExportEngine,
  type ExportResult,
  type Project,
  type VideoExportSettings,
} from "@openreel/core";
import type { ReferenciaFirmadaOpenReel } from "./contratoV2";

interface Temporal {
  writable: FileSystemWritableFileStream;
  archivo(): Promise<Blob>;
  limpiar(): Promise<void>;
}

export async function renderizarYSubir(
  proyecto: Project,
  destino: ReferenciaFirmadaOpenReel,
  alProgreso: (progreso: number, fase: string) => void,
): Promise<{ tamanoBytes: number; tipoMime: "video/mp4" }> {
  const temporal = await crearTemporal();
  try {
    const engine = getExportEngine();
    await engine.initialize();
    const settings = ajustes1080p(proyecto);
    const generator = engine.exportVideo(proyecto, settings, temporal.writable);
    let final: ExportResult | undefined;
    for (;;) {
      const paso = await generator.next();
      if (paso.done) {
        final = paso.value;
        break;
      }
      alProgreso(Math.max(0, Math.min(99, paso.value.progress * 100)), paso.value.phase);
    }
    if (!final?.success) throw new Error(final?.error?.message ?? "OpenReel no pudo renderizar.");
    const archivo = await temporal.archivo();
    if (!archivo.size) throw new Error("OpenReel produjo un archivo vacío.");
    const respuesta = await fetch(destino.url, {
      method: "PUT",
      headers: destino.headers,
      body: archivo,
    });
    if (!respuesta.ok) throw new Error(`MinIO rechazó la entrega (${respuesta.status}).`);
    alProgreso(100, "subido");
    return { tamanoBytes: archivo.size, tipoMime: "video/mp4" };
  } finally {
    await temporal.limpiar();
  }
}

export function cancelarRenderActivo(): void {
  getExportEngine().cancel();
}

function ajustes1080p(proyecto: Project): Partial<VideoExportSettings> {
  const ancho = Math.max(1, proyecto.settings.width);
  const alto = Math.max(1, proyecto.settings.height);
  const escala = Math.min(1, Math.sqrt((1920 * 1080) / (ancho * alto)));
  return {
    width: par(ancho * escala),
    height: par(alto * escala),
    frameRate: Math.min(60, Math.max(1, proyecto.settings.frameRate)),
    format: "mp4",
    codec: "h264",
    bitrate: 12_000,
    quality: 85,
  };
}

function par(valor: number): number {
  const entero = Math.max(2, Math.round(valor));
  return entero % 2 === 0 ? entero : entero - 1;
}

async function crearTemporal(): Promise<Temporal> {
  const storage = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (typeof storage?.getDirectory === "function") {
    const raiz = await storage.getDirectory();
    const nombre = `.skynet-render-${Date.now()}-${crypto.randomUUID()}.mp4`;
    const handle = await raiz.getFileHandle(nombre, { create: true });
    const writable = await handle.createWritable();
    return {
      writable,
      archivo: () => handle.getFile(),
      limpiar: () => raiz.removeEntry(nombre).catch(() => undefined),
    };
  }

  let buffer = new Uint8Array(16 * 1024 * 1024);
  let longitud = 0;
  let cursor = 0;
  const crecer = (necesario: number) => {
    if (necesario <= buffer.length) return;
    let tamano = buffer.length;
    while (tamano < necesario) tamano *= 2;
    const siguiente = new Uint8Array(tamano);
    siguiente.set(buffer.subarray(0, longitud));
    buffer = siguiente;
  };
  const writable = {
    seek(posicion: number) {
      cursor = posicion;
      return Promise.resolve();
    },
    write(dato: unknown) {
      const bytes =
        dato instanceof ArrayBuffer
          ? new Uint8Array(dato)
          : ArrayBuffer.isView(dato)
            ? new Uint8Array(dato.buffer, dato.byteOffset, dato.byteLength)
            : null;
      if (!bytes) return Promise.resolve();
      crecer(cursor + bytes.byteLength);
      buffer.set(bytes, cursor);
      cursor += bytes.byteLength;
      longitud = Math.max(longitud, cursor);
      return Promise.resolve();
    },
    truncate(tamano: number) {
      longitud = Math.min(longitud, tamano);
      cursor = Math.min(cursor, longitud);
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
    abort: () => Promise.resolve(),
  } as unknown as FileSystemWritableFileStream;
  return {
    writable,
    archivo: async () => new Blob([buffer.slice(0, longitud)], { type: "video/mp4" }),
    limpiar: async () => {
      buffer = new Uint8Array(0);
    },
  };
}
