/*
  Insignia.test.tsx — la etiqueta de estado.
*/

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Insignia } from "../../src/componentes/Insignia";

describe("Insignia", () => {
  it("muestra su texto", () => {
    render(<Insignia texto="Fase 4" color="miel" />);

    expect(screen.getByText("Fase 4")).toBeInTheDocument();
  });
});
