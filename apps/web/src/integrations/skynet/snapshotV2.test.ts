import type { Project } from "@openreel/core";
import { describe, expect, it } from "vitest";
import {
  crearSnapshotOpenReel,
  rehidratarSnapshotOpenReel,
  snapshotExigeConflicto,
} from "./snapshotV2";

function proyecto(): Project {
  return {
    id: "proyecto-openreel",
    name: "Video",
    createdAt: 1,
    modifiedAt: 1,
    version: "1",
    settings: { width: 1920, height: 1080, frameRate: 30, sampleRate: 48_000, channels: 2 },
    mediaLibrary: {
      items: [
        {
          id: "medio-original",
          name: "video.mp4",
          type: "video",
          blob: new Blob(["bytes"], { type: "video/mp4" }),
        },
      ],
    },
    timeline: {
      tracks: [{ id: "pista-manual", name: "Ajuste manual", type: "video", clips: [] }],
      duration: 3,
      markers: [],
      subtitles: [],
    },
  } as unknown as Project;
}

describe("snapshot recuperable de SkyNet", () => {
  it("sale sin Blob y recupera los ajustes manuales con los bytes recién firmados", () => {
    const snapshot = crearSnapshotOpenReel(proyecto(), "medio-original", 9);
    expect(snapshot).not.toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain("bytes");
    const recuperado = rehidratarSnapshotOpenReel(
      snapshot!,
      new Blob(["nuevos"], { type: "video/mp4" }),
      "https://minio.test/video.mp4?firma=nueva",
    );
    expect(recuperado.ok).toBe(true);
    if (recuperado.ok) {
      expect(recuperado.proyecto.timeline.tracks[0].id).toBe("pista-manual");
      expect(recuperado.proyecto.mediaLibrary.items[0].blob).toBeInstanceOf(Blob);
    }
  });

  it("una receta más nueva produce conflicto en vez de reconstruir la pista", () => {
    const snapshot = crearSnapshotOpenReel(proyecto(), "medio-original", 9);
    expect(snapshotExigeConflicto(snapshot, 10, "conservar-manual")).toBe(true);
    expect(snapshotExigeConflicto(snapshot, 10, "reconstruir")).toBe(false);
  });
});
