import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { WorkspaceModeTabs } from "./WorkspaceModeTabs";
// Se pregunta por el nombre TRADUCIDO, que es el que el usuario ve. Fijar aquí el inglés dejaría
// la prueba comprobando un idioma que la interfaz ya no habla — verde y midiendo otra cosa.
import { t } from "@/integrations/skynet/idioma";

describe("WorkspaceModeTabs", () => {
  it("renders the two workspace modes and reports selection", () => {
    const onSelectMode = vi.fn();

    render(
      <WorkspaceModeTabs
        activeMode="video"
        ariaLabel="Editor workspaces"
        onSelectMode={onSelectMode}
      />,
    );

    expect(screen.getByRole("tab", { name: t("Video Editor") })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tab", { name: t("Motion Design") }),
    ).toHaveAttribute("aria-selected", "false");

    fireEvent.click(screen.getByRole("tab", { name: t("Motion Design") }));

    expect(onSelectMode).toHaveBeenCalledWith("motion");
  });
});
