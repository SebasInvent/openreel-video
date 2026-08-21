import { describe, expect, it } from "vitest";
import {
  contextoCoincide,
  eventoVieneDelPadre,
  leerMensajeDeSkyNet,
  MENSAJE_OPENREEL_ABRIR,
  VERSION_OPENREEL,
} from "./contratoV2";

const contexto = {
  version: VERSION_OPENREEL,
  orgId: "org-a",
  proyectoEditorId: "video_proyecto_12345",
  revision: 4,
  correlacionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
} as const;

function abrir(extra: Record<string, unknown> = {}) {
  return {
    tipo: MENSAJE_OPENREEL_ABRIR,
    contexto,
    material: {
      id: "material-uno",
      nombre: "video.mp4",
      tipoMime: "video/mp4",
      duracionMs: 60_000,
      lectura: {
        metodo: "GET",
        url: "https://minio.example.com/bucket/video.mp4?firma=1",
        headers: {},
        venceEn: 100_000,
      },
    },
    decisiones: [],
    snapshot: null,
    modo: "conservar-manual",
    ...extra,
  };
}

describe("contrato OpenReel v2", () => {
  it("rechaza v1 y exige correlación y revisión", () => {
    expect(leerMensajeDeSkyNet(abrir(), 1)).not.toBeNull();
    expect(
      leerMensajeDeSkyNet(
        abrir({ contexto: { ...contexto, version: 1 } }),
        1,
      ),
    ).toBeNull();
    expect(
      leerMensajeDeSkyNet(
        abrir({ contexto: { ...contexto, correlacionId: "" } }),
        1,
      ),
    ).toBeNull();
    expect(
      leerMensajeDeSkyNet(
        abrir({ contexto: { ...contexto, revision: undefined } }),
        1,
      ),
    ).toBeNull();
  });

  it("rechaza una referencia firmada vencida o HTTP remota", () => {
    const base = abrir().material;
    expect(
      leerMensajeDeSkyNet(
        abrir({ material: { ...base, lectura: { ...base.lectura, venceEn: 5_000 } } }),
        1,
      ),
    ).toBeNull();
    expect(
      leerMensajeDeSkyNet(
        abrir({
          material: {
            ...base,
            lectura: { ...base.lectura, url: "http://minio.example.com/video.mp4" },
          },
        }),
        1,
      ),
    ).toBeNull();
  });

  it("rechaza una decisión con semántica mezclada", () => {
    expect(
      leerMensajeDeSkyNet(
        abrir({
          decisiones: [
            {
              id: "d-1",
              tipo: "texto",
              desdeMs: 0,
              hastaMs: 1000,
              porque: "Rótulo",
              propuestaPor: { clase: "modelo", actorId: "kimi", propuestaEn: 1 },
              resolucion: null,
              clase: "silencio",
            },
          ],
        }),
        1,
      ),
    ).toBeNull();
  });

  it("origen permitido y source del padre son dos guardas distintas", () => {
    const padre = {} as MessageEvent["source"];
    const ajena = {} as MessageEvent["source"];
    expect(
      eventoVieneDelPadre(
        { origin: "https://skynet.test", source: padre },
        "https://skynet.test",
        padre,
      ),
    ).toBe(true);
    expect(
      eventoVieneDelPadre(
        { origin: "https://skynet.test", source: ajena },
        "https://skynet.test",
        padre,
      ),
    ).toBe(false);
  });

  it("el ack solo puede avanzar la revisión de la misma correlación", () => {
    expect(contextoCoincide({ ...contexto, revision: 5 }, contexto, true)).toBe(true);
    expect(contextoCoincide({ ...contexto, revision: 3 }, contexto, true)).toBe(false);
    expect(
      contextoCoincide(
        { ...contexto, revision: 5, correlacionId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff" },
        contexto,
        true,
      ),
    ).toBe(false);
  });
});
