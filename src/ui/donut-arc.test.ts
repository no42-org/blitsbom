import { describe, expect, it } from 'vitest';
import { computeArcs } from './donut-arc';

const GEOM = { cx: 50, cy: 50, r: 40, rInner: 25 };

describe('computeArcs', () => {
  it('returns no arcs when total count is zero', () => {
    expect(computeArcs([], GEOM)).toEqual([]);
    expect(computeArcs([{ count: 0 }, { count: 0 }], GEOM)).toEqual([]);
  });

  it('returns a single full-ring path when only one bucket has count', () => {
    const arcs = computeArcs([{ count: 5 }, { count: 0 }, { count: 0 }], GEOM);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.index).toBe(0);
    expect(arcs[0]!.d.startsWith('M ')).toBe(true);
  });

  it('emits one arc per non-empty bucket and skips empties', () => {
    const arcs = computeArcs(
      [{ count: 3 }, { count: 0 }, { count: 1 }],
      GEOM,
    );
    expect(arcs).toHaveLength(2);
    expect(arcs.map((a) => a.index)).toEqual([0, 2]);
  });

  it('produces large-arc flag for segments > 180°', () => {
    // 75% of total → angle 270° → largeArc=1
    const arcs = computeArcs([{ count: 3 }, { count: 1 }], GEOM);
    const big = arcs.find((a) => a.index === 0)!;
    // Arc-flag position: the digit just after the rotation flags.
    expect(big.d).toMatch(/A 40 40 0 1 1/);
  });
});
