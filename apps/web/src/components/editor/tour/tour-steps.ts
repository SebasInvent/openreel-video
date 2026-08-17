export interface TourStep {
  id: string;
  target: string | null;
  title: string;
  description: string;
  tips?: string[];
  position: "center" | "top" | "bottom" | "left" | "right";
}

/**
 * El recorrido de bienvenida, en español.
 *
 * Se traduce AQUÍ y no con `t()` a propósito: esto no son etiquetas sueltas, es copy — párrafos que
 * hay que escribir, no palabras que sustituir. Pasarlo por el diccionario obligaría a usar frases
 * largas como clave y a mantenerlas idénticas carácter a carácter; a la primera coma que cambie
 * upstream, el paso entero volvería al inglés sin que nadie lo note.
 *
 * El precio: un `merge upstream/main` que reescriba el tour dará conflicto en este archivo. Es lo
 * correcto — un conflicto se ve y se resuelve; una traducción que deja de aplicar, no.
 *
 * Tuteo rolo, nunca voseo.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Bienvenido al Estudio",
    description:
      "Un mapa rápido del editor: las herramientas a la izquierda, la reproducción en el centro, la línea de tiempo abajo y las propiedades a la derecha.",
    position: "center",
  },
  {
    id: "assets",
    target: "[data-tour='assets']",
    title: "Material y herramientas",
    description:
      "Este panel cambia según la herramienta que elijas en el riel: acá importas material y añades texto, gráficos, efectos y transiciones.",
    tips: [
      "En Material están los videos, audios e imágenes que importaste",
      "Usa el riel de la izquierda para pasar a Texto, Gráficos, Efectos o Transiciones",
      "Arrastra cualquier cosa de este panel a la línea de tiempo",
      "Importar y grabar están arriba del panel",
    ],
    position: "right",
  },
  {
    id: "timeline",
    target: "[data-tour='timeline']",
    title: "Línea de tiempo",
    description:
      "Acomoda los clips en pistas, recorta sus bordes, parte lo que sobra y usa el zoom que está a la derecha de la barra.",
    tips: [
      "Pulsa S para partir el clip seleccionado",
      "Arrastra el borde de un clip para recortarlo",
      "Añade pista cuando necesites otro carril de video o audio",
    ],
    position: "top",
  },
  {
    id: "preview",
    target: "[data-tour='preview']",
    title: "Reproductor",
    description:
      "El reproductor del centro muestra el cuadro actual y los controles. Acá recortas, ajustas el encuadre y revisas antes de exportar.",
    tips: [
      "Los controles de reproducción están bajo el lienzo",
      "El punto verde significa que la vista previa está activa",
      "Pantalla completa y ajuste están en los controles del reproductor",
    ],
    position: "left",
  },
  {
    id: "inspector",
    target: "[data-tour='inspector']",
    title: "Propiedades",
    description:
      "Elige un clip para editarlo. Acá aparecen transformación, color, efectos, velocidad y animación.",
    tips: [
      "Las pestañas de arriba cambian entre grupos de propiedades",
      "El color y los efectos son de cada clip, no de todo el video",
      "Los controles que admiten animación muestran sus opciones al elegir un clip",
    ],
    position: "left",
  },
  {
    id: "complete",
    target: null,
    title: "Listo",
    description:
      "Ya sabes dónde está cada cosa. En el riel del extremo izquierdo puedes volver a abrir este recorrido, los ajustes y las utilidades del proyecto.",
    position: "center",
  },
];

export const ONBOARDING_KEY = "openreel-onboarding-complete";
