import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS } from "@/lib/engine/config";
import { rankRoutes } from "@/lib/engine/score";
import { deltaLabel, reasonText, srCardLabel } from "@/lib/ui/format";
import { NOW, candidate } from "./fixtures";

const opts = { departure: NOW, now: NOW };

describe("card copy", () => {
  it("only the true fastest says Fastest; a tie says Same time without claiming it is slower", () => {
    const ranked = rankRoutes(
      [candidate("a", { expected: 40 }), candidate("b", { expected: 40 })],
      DEFAULT_WEIGHTS,
      opts,
    );
    const labels = ranked.map(deltaLabel);
    expect(labels.filter((l) => l === "Fastest")).toHaveLength(1);
    expect(labels).toContain("Same time");
    const tied = ranked.find((r) => !r.isFastest)!;
    expect(reasonText(tied.reasons[0])).not.toMatch(/slower/);
  });

  it("screen-reader label states time, range, delta, calm, and confidence", () => {
    const ranked = rankRoutes(
      [candidate("fast", { expected: 38, features: { signals: 60 } }), candidate("calm", { expected: 42 })],
      DEFAULT_WEIGHTS,
      opts,
    );
    const calm = ranked.find((r) => r.candidate.route.id === "calm")!;
    expect(srCardLabel(calm)).toMatch(
      /42 minutes, likely between 38 and 48\. 4 minutes longer than fastest, calmer by 100 percent\./,
    );
    expect(srCardLabel(calm)).toContain("Live.");
  });
});
