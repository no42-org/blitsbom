<script lang="ts">
  import type { CategoryBreakdownEntry } from '../state/filters';
  import { CATEGORY_METADATA } from '../license/classify';
  import { store } from '../state/store.svelte';
  import { computeArcs, type DonutGeometry } from './donut-arc';

  interface Props {
    breakdown: CategoryBreakdownEntry[];
  }

  let { breakdown }: Props = $props();

  const geom: DonutGeometry = { cx: 100, cy: 100, r: 55, rInner: 36 };

  // Tick labels: a short radial line + "count (percent%)" placed just
  // outside each non-empty segment.
  interface Tick {
    line: { x1: number; y1: number; x2: number; y2: number };
    label: { x: number; y: number };
    anchor: 'start' | 'middle' | 'end';
    dy: string;
    text: string;
  }

  const ticks = $derived.by<Tick[]>(() => {
    const total = ordered.reduce((s, o) => s + o.count, 0);
    if (total <= 0) return [];
    const nonEmpty = ordered.filter((o) => o.count > 0);
    // For a single full-ring segment, the percentage is 100% and a label
    // would crowd the donut — skip ticks entirely.
    if (nonEmpty.length <= 1) return [];

    const out: Tick[] = [];
    let cumulative = 0;
    // Hide tick labels for segments under 2% — they collide with neighbors
    // and the legend already shows the count.
    const minVisibleFraction = 0.02;
    for (const o of ordered) {
      if (o.count <= 0) {
        continue;
      }
      const fraction = o.count / total;
      // Always advance cumulative so the next segment's geometry is right;
      // only skip the LABEL for tiny slivers (legend still shows the count).
      const startA = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
      cumulative += o.count;
      const endA = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
      if (fraction < minVisibleFraction) continue;
      const midA = (startA + endA) / 2;

      const cosA = Math.cos(midA);
      const sinA = Math.sin(midA);

      const tickIn = { x: geom.cx + geom.r * cosA, y: geom.cy + geom.r * sinA };
      const tickOut = {
        x: geom.cx + (geom.r + 6) * cosA,
        y: geom.cy + (geom.r + 6) * sinA,
      };
      const labelPos = {
        x: geom.cx + (geom.r + 9) * cosA,
        y: geom.cy + (geom.r + 9) * sinA,
      };

      const anchor: Tick['anchor'] =
        cosA > 0.15 ? 'start' : cosA < -0.15 ? 'end' : 'middle';
      const dy = sinA > 0.3 ? '0.8em' : sinA < -0.3 ? '-0.1em' : '0.35em';

      const pct = Math.max(1, Math.round((o.count / total) * 100));
      out.push({
        line: { x1: tickIn.x, y1: tickIn.y, x2: tickOut.x, y2: tickOut.y },
        label: labelPos,
        anchor,
        dy,
        text: `${o.count} (${pct}%)`,
      });
    }
    return out;
  });

  // Index entries in metadata order so the donut + legend ordering is stable
  // across re-renders (segments don't shuffle as filters change).
  const ordered = $derived(
    CATEGORY_METADATA.map((meta) => {
      const entry = breakdown.find((b) => b.category === meta.id);
      return { meta, count: entry?.count ?? 0 };
    }),
  );

  const arcs = $derived(
    computeArcs(
      ordered.map((o) => ({ count: o.count })),
      geom,
    ),
  );

  const total = $derived(ordered.reduce((s, o) => s + o.count, 0));

  // Legend entries: only non-empty categories, in the fixed metadata order.
  const legendEntries = $derived(ordered.filter((o) => o.count > 0));

  function isActive(id: string): boolean {
    return store.categoryFilters.has(id as never);
  }
</script>

{#if total > 0}
  <section class="donut" aria-label="License breakdown by category">
    <h2 class="donut__heading">License breakdown</h2>
    <div class="donut__layout">
      <svg
        class="donut__svg"
        viewBox="0 0 200 200"
        role="img"
        aria-label="License category breakdown"
      >
        {#each arcs as arc (arc.index)}
          {@const meta = ordered[arc.index]?.meta}
          {#if meta}
            <path
              d={arc.d}
              fill={`var(--${meta.colorToken})`}
              class="donut__segment"
              class:donut__segment--active={isActive(meta.id)}
              role="button"
              tabindex="0"
              aria-pressed={isActive(meta.id)}
              aria-label={`${meta.label}: ${ordered[arc.index]!.count} components`}
              onclick={() => store.toggleCategory(meta.id)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  store.toggleCategory(meta.id);
                }
              }}
            />
          {/if}
        {/each}
        {#each ticks as tick}
          <line
            x1={tick.line.x1}
            y1={tick.line.y1}
            x2={tick.line.x2}
            y2={tick.line.y2}
            class="donut__tick"
          />
          <text
            x={tick.label.x}
            y={tick.label.y}
            dy={tick.dy}
            text-anchor={tick.anchor}
            class="donut__tick-label"
          >{tick.text}</text>
        {/each}
        <text
          x="100"
          y="104"
          text-anchor="middle"
          class="donut__center-count"
        >{total}</text>
      </svg>

      <ul class="legend">
        {#each legendEntries as entry (entry.meta.id)}
          <li>
            <button
              type="button"
              class="legend__row"
              class:legend__row--active={isActive(entry.meta.id)}
              onclick={() => store.toggleCategory(entry.meta.id)}
              aria-pressed={isActive(entry.meta.id)}
            >
              <span
                class="legend__swatch"
                style={`background: var(--${entry.meta.colorToken});`}
                aria-hidden="true"
              ></span>
              <span class="legend__label">{entry.meta.label}</span>
              <span class="legend__count">{entry.count}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </section>
{/if}

<style>
  .donut {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem;
    background: white;
    border: 1px solid var(--color-ink-200);
    border-radius: 12px;
  }
  .donut__heading {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-ink-500);
  }
  .donut__layout {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2rem;
    align-items: center;
  }
  .donut__svg {
    width: 25rem;
    height: 25rem;
  }
  .donut__segment {
    cursor: pointer;
    transition: transform 80ms ease, opacity 80ms ease;
    transform-origin: 100px 100px;
  }
  .donut__segment:hover {
    opacity: 0.85;
  }
  .donut__segment--active {
    /* Slight outward bump signals the active segment. */
    transform: scale(1.03);
  }
  .donut__tick {
    stroke: var(--color-ink-300);
    stroke-width: 0.5;
  }
  .donut__tick-label {
    font-size: 5px;
    fill: var(--color-ink-700);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .donut__center-count {
    font-size: 14px;
    font-weight: 600;
    fill: var(--color-ink-900);
    font-variant-numeric: tabular-nums;
  }

  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .legend__row {
    display: grid;
    grid-template-columns: 1rem 1fr auto;
    gap: 0.625rem;
    align-items: center;
    width: 100%;
    padding: 0.375rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
    transition: background-color 80ms ease, border-color 80ms ease;
  }
  .legend__row:hover {
    background: var(--color-ink-50);
  }
  .legend__row--active {
    background: color-mix(in srgb, var(--color-accent-500) 8%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-500) 35%, transparent);
  }
  .legend__swatch {
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--color-ink-900) 20%, transparent);
  }
  .legend__label {
    font-size: 0.875rem;
    color: var(--color-ink-700);
  }
  .legend__count {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
    color: var(--color-ink-600);
  }

  @media (max-width: 640px) {
    .donut__layout {
      grid-template-columns: 1fr;
      justify-items: center;
    }
    .legend {
      width: 100%;
    }
  }
</style>
