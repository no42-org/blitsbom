/**
 * Pure SVG donut-arc math.
 *
 *   computeArcs([{count: 3}, {count: 1}], 100)
 *
 * yields path-d strings for each segment, sized for an SVG viewBox where
 * the donut is centered at (cx, cy) with outer radius r and inner radius
 * r - thickness. A single-segment input renders a full ring (handled
 * specially because SVG arcs can't draw a 360° arc as a single path).
 */

export interface ArcInput {
  readonly count: number;
}

export interface Arc {
  /** SVG path "d" attribute for the donut segment. */
  d: string;
  /** Index of the source input — useful for keyed iteration. */
  index: number;
}

export interface DonutGeometry {
  /** Center x, y. */
  cx: number;
  cy: number;
  /** Outer radius. */
  r: number;
  /** Inner radius (must be < r). */
  rInner: number;
}

const TWO_PI = Math.PI * 2;

export function computeArcs(
  inputs: readonly ArcInput[],
  geom: DonutGeometry,
): Arc[] {
  const total = inputs.reduce((sum, i) => sum + i.count, 0);
  if (total <= 0) return [];

  // Single non-empty bucket → render as a full ring (use two half-arcs).
  const nonEmpty = inputs.filter((i) => i.count > 0);
  if (nonEmpty.length === 1) {
    const idx = inputs.indexOf(nonEmpty[0]!);
    return [{ index: idx, d: fullRingPath(geom) }];
  }

  const arcs: Arc[] = [];
  let cumulative = 0;
  inputs.forEach((input, index) => {
    if (input.count <= 0) return;
    const startAngle = (cumulative / total) * TWO_PI;
    cumulative += input.count;
    const endAngle = (cumulative / total) * TWO_PI;
    arcs.push({ index, d: arcPath(startAngle, endAngle, geom) });
  });
  return arcs;
}

function fullRingPath({ cx, cy, r, rInner }: DonutGeometry): string {
  // Two semicircles for the outer edge, two for the inner — drawn in
  // opposite directions so the fill-rule produces a clean ring.
  return [
    `M ${cx + r} ${cy}`,
    `A ${r} ${r} 0 1 1 ${cx - r} ${cy}`,
    `A ${r} ${r} 0 1 1 ${cx + r} ${cy}`,
    `Z`,
    `M ${cx + rInner} ${cy}`,
    `A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy}`,
    `A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy}`,
    `Z`,
  ].join(' ');
}

function arcPath(
  startAngle: number,
  endAngle: number,
  { cx, cy, r, rInner }: DonutGeometry,
): string {
  // Start angle 0 is at 12 o'clock; rotate -PI/2 to align.
  const rot = -Math.PI / 2;
  const a0 = startAngle + rot;
  const a1 = endAngle + rot;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const xi1 = cx + rInner * Math.cos(a1);
  const yi1 = cy + rInner * Math.sin(a1);
  const xi0 = cx + rInner * Math.cos(a0);
  const yi0 = cy + rInner * Math.sin(a0);

  return [
    `M ${x0} ${y0}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`,
    `L ${xi1} ${yi1}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${xi0} ${yi0}`,
    `Z`,
  ].join(' ');
}
