/**
 * El montaje y el contrato de SkyNet.
 *
 * Lo que se defiende aquí, en orden de lo que más duele si se rompe:
 *
 * 1. **La conversión de unidades.** SkyNet manda milisegundos, este editor monta segundos. Un
 *    factor de mil equivocado no lanza ningún error: produce un video de 60 milisegundos o de 16
 *    horas, y las dos cosas se descubren tarde.
 * 2. **Qué trozo del material se ve.** `startTime` es dónde va el clip en la película; `inPoint` es
 *    qué parte del original se ve. Confundirlos monta el video entero desde el principio en cada
 *    clip, y parece un fallo del material.
 * 3. **La puerta del origen.** Sin ella cualquier página que incruste el editor manda montajes.
 */

import { describe, expect, it } from "vitest";
import { leerTraspaso, origenPermitido, VERSION, type TraspasoAlEditor } from "./contrato";
import { ajustesDesdeMaterial, montarLineaDeTiempo, resumenDelMontaje } from "./montaje";

const DUR = 60_000;

const traspaso = (extra: Partial<TraspasoAlEditor> = {}): TraspasoAlEditor => ({
  version: VERSION,
  material: {
    nombre: "entrevista.mp4",
    tipoMime: "video/mp4",
    duracionMs: DUR,
    fuente: { clase: "url", url: "https://minio.cliente.test/acme/entrevista.mp4" },
  },
  // Un corte de silencio entre 10 s y 12 s: lo que sobrevive son estos dos trozos.
  segmentos: [
    { desdeMs: 0, hastaMs: 10_000 },
    { desdeMs: 12_000, hastaMs: DUR },
  ],
  decisiones: [
    {
      id: "sil-0",
      tipo: "silencio",
      desdeMs: 10_000,
      hastaMs: 12_000,
      porque: "Nadie habla durante 2,0 s.",
      estado: "aceptada",
      origen: "analisis",
    },
  ],
  ...extra,
});

describe("milisegundos a segundos, en un solo sitio", () => {
  it("un segmento de 10 s se monta como 10 s, no como 10.000", () => {
    const { pista, duracion } = montarLineaDeTiempo(traspaso().segmentos, "med-1");
    expect(pista.clips[0].duration).toBe(10);
    expect(duracion).toBe(58); // 60 s de material menos los 2 s cortados
  });

  it("las posiciones se acumulan sin arrastrar error entre clips", () => {
    // Tres cortes seguidos con duraciones que no caen redondas en segundos: si se sumaran los
    // flotantes uno a uno, el último clip empezaría un poco corrido y el desfase se oiría al final.
    const segmentos = [
      { desdeMs: 0, hastaMs: 3_333 },
      { desdeMs: 4_000, hastaMs: 7_333 },
      { desdeMs: 8_000, hastaMs: 11_333 },
    ];
    const { pista, duracion } = montarLineaDeTiempo(segmentos, "med-1");
    expect(pista.clips.map((c) => c.startTime)).toEqual([0, 3.333, 6.666]);
    expect(duracion).toBe(9.999);
  });
});

describe("qué trozo del material se ve en cada clip", () => {
  it("el segundo clip arranca en el minuto 12 del ORIGINAL, no en el 0", () => {
    const { pista } = montarLineaDeTiempo(traspaso().segmentos, "med-1");
    const [primero, segundo] = pista.clips;

    expect(primero.inPoint).toBe(0);
    expect(primero.outPoint).toBe(10);

    // Aquí está el corte: el clip va pegado al anterior en la película (startTime 10)…
    expect(segundo.startTime).toBe(10);
    // …pero muestra el material a partir del segundo 12. Los 2 s de silencio no se ven.
    expect(segundo.inPoint).toBe(12);
    expect(segundo.outPoint).toBe(60);
  });

  it("los clips quedan pegados: el hueco es justo lo que se cortó", () => {
    const { pista } = montarLineaDeTiempo(traspaso().segmentos, "med-1");
    const [a, b] = pista.clips;
    // Un hueco aquí sería un negro donde antes había silencio: lo contrario de lo aceptado.
    expect(a.startTime + a.duration).toBe(b.startTime);
  });

  it("todos los clips apuntan al material importado", () => {
    const { pista } = montarLineaDeTiempo(traspaso().segmentos, "med-1");
    expect(pista.clips.every((c) => c.mediaId === "med-1")).toBe(true);
    expect(pista.clips.every((c) => c.trackId === pista.id)).toBe(true);
  });
});

describe("el lienzo sale del material, no de un preajuste", () => {
  it("toma medidas y cuadros del medio importado", () => {
    // Si el lienzo no coincidiera con el material, `deriveSourceExportMatch` elegiría otra calidad
    // y la exportación saldría reescalada sin que nadie lo pidiera.
    const ajustes = ajustesDesdeMaterial({
      metadata: { width: 1920, height: 1080, frameRate: 25, sampleRate: 44100, channels: 1 },
    } as never);
    expect(ajustes).toMatchObject({ width: 1920, height: 1080, frameRate: 25 });
  });

  it("un material sin medidas cae en vertical, que es lo que se produce", () => {
    expect(ajustesDesdeMaterial(null)).toMatchObject({ width: 1080, height: 1920, frameRate: 30 });
  });
});

describe("la puerta del origen", () => {
  it("acepta solo lo que está en la lista", () => {
    const lista = "https://skynet.codigoenigma.com, http://localhost:3000";
    expect(origenPermitido("https://skynet.codigoenigma.com", lista)).toBe(true);
    expect(origenPermitido("http://localhost:3000", lista)).toBe(true);
  });

  it("sin configuración no acepta a nadie, y NO hay comodín", () => {
    expect(origenPermitido("https://skynet.codigoenigma.com", "")).toBe(false);
    expect(origenPermitido("https://cualquiera.test", "*")).toBe(false);
  });

  it("un origen parecido no cuela", () => {
    const lista = "https://skynet.codigoenigma.com";
    expect(origenPermitido("https://skynet.codigoenigma.com.malo.test", lista)).toBe(false);
    expect(origenPermitido("http://skynet.codigoenigma.com", lista)).toBe(false);
    expect(origenPermitido("", lista)).toBe(false);
  });

  it("un origen OPACO no entra, ni aunque alguien escriba «null» en la lista", () => {
    // Un iframe con `sandbox` sin `allow-same-origin`, un `data:` o un `file:` mandan la CADENA
    // "null" como origen. Sin este caso, poner `null` en la configuración abriría la puerta a
    // cualquier documento opaco del mundo de una sola vez.
    expect(origenPermitido("null", "null")).toBe(false);
    expect(origenPermitido("null", "https://skynet.codigoenigma.com")).toBe(false);
  });
});

describe("el contrato desconfía de lo que entra", () => {
  it("acepta un traspaso bien formado", () => {
    expect(leerTraspaso(traspaso()).ok).toBe(true);
  });

  it("rechaza una versión que no entiende en vez de interpretarla a medias", () => {
    const r = leerTraspaso({ ...traspaso(), version: VERSION + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("version-desconocida");
  });

  it("recorta al material un segmento que se pasa del final", () => {
    // Sin esto el clip tendría un `outPoint` que no existe y el monitor pintaría cuadros
    // congelados al terminar — un fallo que parece un problema del video del cliente.
    const r = leerTraspaso({ ...traspaso(), segmentos: [{ desdeMs: 0, hastaMs: DUR * 3 }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.traspaso.segmentos).toEqual([{ desdeMs: 0, hastaMs: DUR }]);
  });

  it("un sobre sin segmentos montables se rechaza", () => {
    const r = leerTraspaso({ ...traspaso(), segmentos: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("no-queda-nada");
  });

  it("tira la basura y los segmentos de duración cero, sin tumbar el sobre entero", () => {
    // Un clip de 0 s en la línea de tiempo no se puede ni seleccionar para quitarlo.
    const r = leerTraspaso({
      ...traspaso(),
      segmentos: [
        { desdeMs: 0, hastaMs: 5_000 },
        null,
        { desdeMs: "x", hastaMs: 9 },
        { desdeMs: 3_000, hastaMs: 3_000 },
        { desdeMs: 7_000, hastaMs: 9_000 },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.traspaso.segmentos).toEqual([
        { desdeMs: 0, hastaMs: 5_000 },
        { desdeMs: 7_000, hastaMs: 9_000 },
      ]);
    }
  });

  it("rechaza lo que no trae material utilizable", () => {
    const t = traspaso();
    const r = leerTraspaso({ ...t, material: { ...t.material, fuente: { clase: "url", url: "" } } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("sin-material");
  });

  it("rechaza lo que ni siquiera es un objeto", () => {
    expect(leerTraspaso(null).ok).toBe(false);
    expect(leerTraspaso("traspaso").ok).toBe(false);
  });
});

describe("el resumen que vuelve a SkyNet", () => {
  it("cuenta clips, duración y decisiones para que el otro lado pueda comparar", () => {
    const { duracion } = montarLineaDeTiempo(traspaso().segmentos, "med-1");
    expect(resumenDelMontaje(traspaso(), duracion)).toEqual({
      clips: 2,
      duracionMs: 58_000,
      aceptadas: 1,
      descartadas: 0,
    });
  });
});
