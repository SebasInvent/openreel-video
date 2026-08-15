/**
 * EL CHAT DE SKYNET, dentro del editor.
 *
 * Escribes lo que quieres en español y las propuestas aparecen aquí mismo, sobre la línea de tiempo
 * que estás mirando. Cada una trae su porqué y **ninguna se aplica sola**: aceptar o descartar es
 * un gesto tuyo, y la línea de tiempo se redibuja al instante.
 *
 * ## De dónde sale cada propuesta, y por qué se dice
 *
 * El color y la etiqueta distinguen lo **medido en el audio** de lo **propuesto por el modelo**. Un
 * corte medido da siempre igual; uno nacido de una frase puede equivocarse. Pedir la misma confianza
 * para los dos sería esconder la diferencia justo donde la persona decide.
 *
 * ## Por qué el encargo sube a SkyNet en vez de llamar al modelo desde aquí
 *
 * Porque este editor es una app pública y la llave se leería abriendo devtools. SkyNet la tiene del
 * lado del servidor, y de paso le cobra el gasto a la organización correcta con su cupo. Ver
 * `MENSAJE_ENCARGO` en `contrato.ts`.
 */

import { useState } from "react";
import { MENSAJE_ENCARGO, VERSION } from "./contrato";
import { duracionActualMs, useEstadoSkynet } from "./estadoSkynet";

/** `mm:ss.d` — el mismo formato que usa SkyNet, para poder comparar de un vistazo. */
function timecode(ms: number): string {
  const s = Math.max(0, ms);
  const min = Math.floor(s / 60000);
  const seg = Math.floor((s % 60000) / 1000);
  const dec = Math.floor((s % 1000) / 100);
  return `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}.${dec}`;
}

export function PanelSkynet() {
  const { origen, duracionMs, decisiones, pensando, aviso, carril, resolver, setPensando, setAviso } =
    useEstadoSkynet();
  const [texto, setTexto] = useState("");

  // Sin traspaso no hay nada que editar desde aquí: el panel no se pinta y el editor queda intacto.
  if (!origen || duracionMs <= 0) return null;

  const pendientes = decisiones.filter((d) => d.estado === "propuesta");
  const aceptadas = decisiones.filter((d) => d.estado === "aceptada");
  const finalMs = duracionActualMs(duracionMs, decisiones);

  const mandar = () => {
    const t = texto.trim();
    if (!t || pensando) return;
    setPensando(true);
    setAviso("");
    // Solo suben la MEDICIÓN y el encargo. El material ya está aquí; no viaja nunca.
    const silencios = decisiones
      .filter((d) => d.tipo === "silencio")
      .map((d) => ({ desdeMs: d.desdeMs, hastaMs: d.hastaMs }));
    window.parent.postMessage(
      {
        tipo: MENSAJE_ENCARGO,
        encargo: { version: VERSION, texto: t, carril, duracionMs, silencios },
      },
      origen,
    );
    setTexto("");
  };

  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 12,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <div>
        <strong style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Pídeselo con tus palabras
        </strong>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter manda; Shift+Enter salta línea. Es un encargo corto, no un ensayo.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              mandar();
            }
          }}
          rows={3}
          disabled={pensando}
          placeholder="Quita las pausas largas y déjalo por debajo de un minuto"
          style={{ width: "100%", marginTop: 8, padding: 8, resize: "none" }}
        />
        <button type="button" onClick={mandar} disabled={pensando || !texto.trim()}>
          {pensando ? "Pensando…" : "Proponer cortes"}
        </button>
        {/* Nunca una ruleta muda: se dice qué está pasando. */}
        {pensando ? <span style={{ marginLeft: 8, fontSize: 12 }}>Leyendo la medición</span> : null}
      </div>

      {aviso ? <p style={{ fontSize: 13, margin: 0 }}>{aviso}</p> : null}

      <p style={{ fontSize: 12, margin: 0 }}>
        Material {timecode(duracionMs)} · Resultado <strong>{timecode(finalMs)}</strong>
        {aceptadas.length ? ` · ${aceptadas.length} aceptadas` : ""}
        {pendientes.length ? ` · ${pendientes.length} esperando que decidas` : ""}
      </p>

      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {decisiones.map((d) => (
          <li
            key={d.id}
            style={{
              padding: 10,
              borderRadius: 8,
              opacity: d.estado === "descartada" ? 0.45 : 1,
              border: "1px solid rgba(128,128,128,.35)",
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 11 }}>
              <code>
                {timecode(d.desdeMs)}–{timecode(d.hastaMs)}
              </code>
              {/* De dónde salió. La diferencia se ENSEÑA, no se esconde. */}
              <span>{d.origen === "modelo" ? "Propuesto por el modelo" : "Medido en el audio"}</span>
            </div>
            <p style={{ margin: "6px 0", fontSize: 13 }}>{d.porque}</p>
            {d.estado === "propuesta" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => resolver(d.id, "aceptada")}>
                  Aceptar
                </button>
                <button type="button" onClick={() => resolver(d.id, "descartada")}>
                  Descartar
                </button>
              </div>
            ) : (
              // Lo descartado NO se borra: el registro de lo que se quitó es parte del producto.
              <em style={{ fontSize: 12 }}>
                {d.estado === "aceptada" ? "Aceptada" : "Descartada"}
              </em>
            )}
          </li>
        ))}
        {decisiones.length === 0 ? (
          <li style={{ fontSize: 13, opacity: 0.7 }}>
            Todavía no hay ninguna. Pídele algo y te van a ir apareciendo acá.
          </li>
        ) : null}
      </ol>
    </aside>
  );
}
