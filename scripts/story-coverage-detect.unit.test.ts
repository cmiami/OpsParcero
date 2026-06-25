import { describe, it, expect } from "vitest";
import {
  hasProps,
  isInteractive,
  isPrimitiveComponent,
} from "./story-coverage-detect.mjs";

describe("hasProps (#19 — broadened beyond *Props)", () => {
  it("catches React.ComponentProps / VariantProps / HTMLAttributes", () => {
    expect(hasProps(`function C(p: React.ComponentProps<"div">) {}`)).toBe(true);
    expect(hasProps(`type X = VariantProps<typeof v>`)).toBe(true);
    expect(hasProps(`React.HTMLAttributes<HTMLDivElement>`)).toBe(true);
  });
  it("still catches a named *Props interface", () => {
    expect(hasProps(`interface CardProps { title: string }`)).toBe(true);
  });
  it("is false for a prop-less component", () => {
    expect(hasProps(`function C() { return null }`)).toBe(false);
  });
});

describe("isInteractive (#19 — Radix primitives)", () => {
  it("catches a wrapped Radix interactive primitive", () => {
    expect(
      isInteractive(`import * as S from "@radix-ui/react-switch"`),
    ).toBe(true);
  });
  it("catches handler props + local state", () => {
    expect(isInteractive(`onChange?: () => void`)).toBe(true);
    expect(isInteractive(`const [x, setX] = useState(0)`)).toBe(true);
  });
  it("is false for a static display component", () => {
    expect(isInteractive(`function C() { return <p>hi</p> }`)).toBe(false);
  });
});

describe("isPrimitiveComponent (#19 — ui/ exemption)", () => {
  it("flags shadcn ui/ wrappers, not product components", () => {
    expect(isPrimitiveComponent("src/components/ui/card.tsx")).toBe(true);
    expect(
      isPrimitiveComponent("src/components/organisms/fix/guided-fix-panel.tsx"),
    ).toBe(false);
  });
});
