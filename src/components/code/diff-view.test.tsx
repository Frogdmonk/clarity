import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DiffView } from "./diff-view";

describe("DiffView", () => {
  it("renders student code as escaped text, never markup", () => {
    const html = renderToStaticMarkup(<DiffView before={"a"} after={'<img src=x onerror="alert(1)">'} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
