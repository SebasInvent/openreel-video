/**
 * QUE EL MONTAJE ATERRICE. La prueba que faltaba y que habría cazado el fallo del 15-ago.
 *
 * `montaje.test.ts` cubre las funciones puras: dado un traspaso, qué clips salen. Eso estaba bien
 * y no bastaba — porque lo que se rompió no fue el cálculo, fue el ATERRIZAJE: el proyecto entraba
 * en la tienda y el usuario seguía viendo la pantalla de bienvenida, así que «funcionaba» en todas
 * las pruebas y no se veía nada en la pantalla.
 *
 * Acá se ejerce `aplicarTraspaso` de punta a punta contra la tienda REAL del editor: entra un
 * traspaso con bytes, y se comprueba que al final del camino hay un proyecto cargado, con sus
 * clips, apuntando al medio importado, y con la ruta puesta en la línea de tiempo.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "../../stores/project-store";
import { aplicarTraspaso, RUTA_EDITOR } from "./entrada";
import type { TraspasoAlEditor } from "./contrato";

vi.mock("../../services/auto-save", () => ({
  autoSaveManager: {
    startAutoSave: vi.fn(),
    stopAutoSave: vi.fn(),
    triggerSave: vi.fn(),
    getRecentSaves: vi.fn().mockResolvedValue([]),
    loadSave: vi.fn(),
    deleteSave: vi.fn(),
  },
  initializeAutoSave: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/media-storage", () => ({
  saveMediaBlob: vi.fn().mockResolvedValue(undefined),
  loadMediaBlob: vi.fn().mockResolvedValue(null),
  deleteMediaBlob: vi.fn().mockResolvedValue(undefined),
  loadProjectMedia: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../bridges/media-bridge", () => ({
  getMediaBridge: vi.fn(() => ({
    isInitialized: vi.fn().mockReturnValue(true),
    // Medidas REALES de un vertical: si el lienzo no las tomara, la exportación saldría
    // reescalada sin que nadie lo pida (`deriveSourceExportMatch` compara con el lienzo).
    importFile: vi.fn().mockResolvedValue({
      success: true,
      media: {
        blob: null,
        thumbnails: [],
        metadata: {
          duration: 20,
          width: 1080,
          height: 1920,
          frameRate: 30,
          codec: "h264",
          sampleRate: 48000,
          channels: 2,
          hasVideo: true,
          hasAudio: false,
        },
        waveformData: { peaks: null },
      },
    }),
    generateThumbnailsForMedia: vi.fn().mockResolvedValue([]),
    generateFilmstripThumbnails: vi.fn().mockResolvedValue([]),
  })),
  initializeMediaBridge: vi.fn().mockResolvedValue(undefined),
}));

/** Los dos silencios del material de prueba: 6–9 s y 15–17 s sobre 20 s. */
const TRASPASO: TraspasoAlEditor = {
  version: 1,
  material: {
    nombre: "prueba.mp4",
    tipoMime: "video/mp4",
    duracionMs: 20_000,
    fuente: { clase: "bytes", datos: new Blob(["0123456789"], { type: "video/mp4" }) },
  },
  segmentos: [
    { desdeMs: 0, hastaMs: 6_000 },
    { desdeMs: 9_000, hastaMs: 15_000 },
    { desdeMs: 17_000, hastaMs: 20_000 },
  ],
  decisiones: [
    {
      id: "sil-0",
      tipo: "silencio",
      desdeMs: 6_000,
      hastaMs: 9_000,
      porque: "Nadie habla durante 3,0 s.",
      estado: "aceptada",
      origen: "analisis",
    },
    {
      id: "sil-1",
      tipo: "silencio",
      desdeMs: 15_000,
      hastaMs: 17_000,
      porque: "Nadie habla durante 2,0 s.",
      estado: "aceptada",
      origen: "analisis",
    },
  ],
};

describe("el montaje aterriza en la tienda del editor", () => {
  beforeEach(() => {
    useProjectStore.getState().createNewProject();
    window.location.hash = "";
  });

  it("deja los tres trozos que sobreviven como clips de la linea de tiempo", async () => {
    const r = await aplicarTraspaso(TRASPASO);
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const { project } = useProjectStore.getState();
    const clips = project.timeline.tracks.flatMap((t) => t.clips);
    expect(clips).toHaveLength(3);

    // Pegados uno detrás de otro: el hueco es justo lo que se cortó.
    expect(clips.map((c) => c.startTime)).toEqual([0, 6, 12]);
    // Y cada uno mira el trozo correcto del material ORIGINAL — acá es donde se ve el corte.
    expect(clips.map((c) => c.inPoint)).toEqual([0, 9, 17]);
    expect(clips.map((c) => c.outPoint)).toEqual([6, 15, 20]);
  });

  it("el video montado dura lo que decia SkyNet, no lo que duraba el material", async () => {
    await aplicarTraspaso(TRASPASO);
    // 20 s menos los 3 s y los 2 s de silencio = 15 s.
    expect(useProjectStore.getState().project.timeline.duration).toBe(15);
  });

  it("el medio importado queda DENTRO del proyecto nuevo", async () => {
    // `loadProject` reemplaza el proyecto: si el medio se quedara en el anterior, los clips
    // apuntarían con `mediaId` a algo que ya no existe y el monitor saldría en negro.
    await aplicarTraspaso(TRASPASO);
    const { project } = useProjectStore.getState();
    const ids = project.mediaLibrary.items.map((m) => m.id);
    expect(ids).toHaveLength(1);
    for (const c of project.timeline.tracks.flatMap((t) => t.clips)) {
      expect(ids).toContain(c.mediaId);
    }
  });

  it("EL FALLO DEL 15-ago: deja la ruta en la linea de tiempo, no en la bienvenida", async () => {
    // Sin esto el proyecto entra en la tienda y el usuario se queda mirando «From idea to
    // export». Todo verde, nada visible — que es exactamente como se reportó.
    await aplicarTraspaso(TRASPASO);
    expect(window.location.hash).toBe(RUTA_EDITOR);
  });

  it("el lienzo toma las medidas del material, no un preajuste", async () => {
    await aplicarTraspaso(TRASPASO);
    expect(useProjectStore.getState().project.settings).toMatchObject({
      width: 1080,
      height: 1920,
      frameRate: 30,
    });
  });

  it("sin bytes no se monta nada, y lo dice", async () => {
    const r = await aplicarTraspaso({
      ...TRASPASO,
      material: { ...TRASPASO.material, fuente: { clase: "url", url: "https://no.existe.test/x.mp4" } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("sin-bytes");
  });
});
