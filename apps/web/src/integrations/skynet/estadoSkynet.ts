/**
 * La sesión de SkyNet DENTRO del editor: el material, las decisiones y quién decide.
 *
 * ## La invariante, que es la misma de siempre
 *
 * **El modelo propone; la persona manda.** Ninguna decisión nace aceptada, ni siquiera las que
 * pide el propio usuario por el chat. Lo que cambia al traerlo aquí es solo el sitio: antes se
 * decidía en SkyNet y se mandaba el resultado; ahora se decide sobre la línea de tiempo, viéndola.
 *
 * ## Por qué la línea de tiempo se REHACE en vez de parchearse
 *
 * Aceptar un corte podría implementarse partiendo clips y borrando trozos con las acciones del
 * editor. Se hace al revés —se recalcula qué sobrevive y se vuelve a montar la pista— por una
 * razón de producto: así **lo que se ve es siempre exactamente la función de las decisiones
 * aceptadas**, y descartar algo lo devuelve intacto. Con parches incrementales, deshacer una
 * decisión de hace diez pasos es una operación distinta a no haberla aceptado nunca, y ahí es donde
 * los editores automáticos se vuelven imposibles de auditar.
 *
 * El precio, dicho para que nadie lo descubra a la mala: **los retoques manuales sobre la pista de
 * SkyNet se pierden al aceptar o descartar**, porque la pista se reconstruye. Otras pistas no se
 * tocan.
 */

import { create } from "zustand";
import { useProjectStore } from "../../stores/project-store";
import type { DecisionDelTraspaso, TraspasoAlEditor } from "./contrato";
import { montarLineaDeTiempo, segmentosConservados } from "./montaje";

interface EstadoSkynet {
  /** De dónde vino el traspaso. Es a quien se le contesta, y solo a ese origen. */
  origen: string | null;
  /** Duración del material íntegro. Árbitro de todo cálculo. */
  duracionMs: number;
  /** El medio importado, para poder rehacer la pista sin volver a importar. */
  mediaId: string | null;
  /** Carril elegido en SkyNet. Sube con cada encargo para que el criterio no se pierda. */
  carril: string;
  decisiones: DecisionDelTraspaso[];
  /** `true` mientras SkyNet consulta al modelo. La pantalla lo dice; nunca una ruleta muda. */
  pensando: boolean;
  aviso: string;

  sembrar(traspaso: TraspasoAlEditor, mediaId: string, origen: string): void;
  agregar(decisiones: DecisionDelTraspaso[]): void;
  resolver(id: string, estado: "aceptada" | "descartada"): void;
  setPensando(v: boolean): void;
  setAviso(a: string): void;
}

export const useEstadoSkynet = create<EstadoSkynet>((set, get) => ({
  origen: null,
  duracionMs: 0,
  mediaId: null,
  carril: "performance",
  decisiones: [],
  pensando: false,
  aviso: "",

  sembrar: (traspaso, mediaId, origen) =>
    set({
      origen,
      mediaId,
      duracionMs: traspaso.material.duracionMs,
      decisiones: traspaso.decisiones,
      aviso: "",
      pensando: false,
    }),

  agregar: (nuevas) =>
    set((s) => ({
      // Se anexan al final: llegan después, y el orden en que se decidió es parte del registro.
      decisiones: [...s.decisiones, ...nuevas],
    })),

  resolver: (id, estado) => {
    set((s) => ({
      decisiones: s.decisiones.map((d) =>
        // `origen: 'persona'` porque a partir de aquí la decisión es suya, la haya propuesto quien
        // la haya propuesto. Es lo que hace honesto el registro.
        d.id === id ? { ...d, estado, origen: "persona" as const } : d,
      ),
    }));
    rehacerLineaDeTiempo(get().duracionMs, get().decisiones, get().mediaId);
  },

  setPensando: (v) => set({ pensando: v }),
  setAviso: (a) => set({ aviso: a }),
}));

/**
 * Vuelve a montar la pista de SkyNet con lo que sobrevive ahora mismo.
 *
 * No hace nada si no queda material: una línea de tiempo vacía se lee como «se perdió el video» y
 * no como «cortaste de más», así que es mejor dejar lo último válido en pantalla y que el aviso
 * explique. Es la misma decisión que toma `construirTraspaso` en SkyNet al negarse a mandar.
 */
function rehacerLineaDeTiempo(
  duracionMs: number,
  decisiones: readonly DecisionDelTraspaso[],
  mediaId: string | null,
): void {
  if (!mediaId || duracionMs <= 0) return;
  const segmentos = segmentosConservados(duracionMs, decisiones);
  if (segmentos.length === 0) {
    useEstadoSkynet.setState({
      aviso: "Con lo aceptado no queda nada de video. Descarta algún corte.",
    });
    return;
  }

  const { pista, duracion } = montarLineaDeTiempo(segmentos, mediaId);
  const store = useProjectStore.getState();
  const anterior = store.project;
  store.loadProject({
    ...anterior,
    modifiedAt: Date.now(),
    timeline: { ...anterior.timeline, tracks: [pista], duration: duracion },
  });
}

/** Cuánto dura lo que hay ahora en la línea de tiempo, en milisegundos. */
export function duracionActualMs(duracionMs: number, decisiones: readonly DecisionDelTraspaso[]): number {
  return segmentosConservados(duracionMs, decisiones).reduce(
    (t, s) => t + (s.hastaMs - s.desdeMs),
    0,
  );
}
