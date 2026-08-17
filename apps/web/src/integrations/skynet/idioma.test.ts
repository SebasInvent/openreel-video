/**
 * La capa de idioma del editor.
 *
 * Lo que se defiende acá no es «que traduzca» —eso es un diccionario— sino las dos propiedades que
 * hacen que esto sobreviva a un `git merge upstream/main`: que **lo no traducido siga funcionando
 * en inglés** y que **la clave sea el texto original**, para que un cambio de upstream se note en
 * pantalla en vez de aplicar una traducción a un texto que ya no existe.
 */

import { describe, expect, it } from "vitest";
import { cuantasTraducidas, t } from "./idioma";

describe("lo no traducido NO se rompe", () => {
  it("devuelve el original cuando no hay traducción", () => {
    // Es la propiedad que permite traducir de a poco: la pantalla queda en inglés en ese punto,
    // no vacía. Sin esto, cada frase nueva de upstream sería un hueco en blanco.
    expect(t("Some Brand New Upstream String")).toBe("Some Brand New Upstream String");
  });

  it("nunca devuelve vacío, ni para una cadena vacía", () => {
    expect(t("")).toBe("");
  });

  it("no inventa nada para algo que no es una frase", () => {
    expect(t("%s")).toBe("%s");
  });
});

describe("traduce lo que se toca al montar", () => {
  it("el riel de paneles", () => {
    expect(t("Media")).toBe("Material");
    expect(t("Effects")).toBe("Efectos");
    expect(t("Transitions")).toBe("Transiciones");
  });

  it("la línea de tiempo", () => {
    expect(t("Add track")).toBe("Añadir pista");
    expect(t("Split")).toBe("Partir");
  });

  it("el estado vacío del material, que es lo primero que se ve", () => {
    expect(t("No media imported")).toBe("Todavía no hay material");
    expect(t("Drag files here or click to import")).toBe(
      "Arrastra archivos acá o haz clic para importar",
    );
  });

  it("la exportación, que es donde termina el trabajo", () => {
    expect(t("Export")).toBe("Exportar");
  });
});

describe("la voz de la casa", () => {
  it("tutea y NO vosea", () => {
    // Regla dura de Invent. El voseo se cuela por «arrastrá», «hacé», «elegí», «poné».
    const voseo = /\b\w+(á|é|í)s?\b/;
    const excepciones = new Set(["Diseño en movimiento", "Historial de acciones"]);
    const sospechosas = [
      t("Drag files here or click to import"),
      t("Select a clip to view its properties"),
      t("Add to timeline"),
    ].filter((f) => !excepciones.has(f) && /\b(arrastrá|hacé|elegí|poné|mirá|tenés)\b/i.test(f));
    expect(sospechosas).toEqual([]);
    // Y la forma correcta sí está: «haz», «elige».
    expect(t("Drag files here or click to import")).toContain("haz clic");
    expect(t("Select a clip to view its properties")).toContain("Elige");
    void voseo;
  });
});

describe("el diccionario no encoge sin que nadie lo note", () => {
  it("mantiene al menos la cáscara del editor cubierta", () => {
    // Un trinquete flojo a propósito: no fija el número exacto (crecería con cada frase nueva y
    // sería ruido), pero sí impide que alguien vacíe el diccionario en un rebase y nadie lo vea.
    expect(cuantasTraducidas()).toBeGreaterThanOrEqual(70);
  });
});
