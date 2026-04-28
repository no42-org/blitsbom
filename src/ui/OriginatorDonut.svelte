<script lang="ts">
  import type { OriginatorBreakdownEntry } from '../state/filters';
  import { store } from '../state/store.svelte';
  import { computeArcs, type DonutGeometry } from './donut-arc';

  interface Props {
    breakdown: OriginatorBreakdownEntry[];
  }

  let { breakdown }: Props = $props();

  const geom: DonutGeometry = { cx: 100, cy: 100, r: 55, rInner: 36 };

  // Cycling palette for the top-N "named" originators. Synthetic buckets
  // ("Other", "Unknown") use dedicated tokens so they read as neutral.
  const PALETTE_TOKENS = [
    'color-originator-1',
    'color-originator-2',
    'color-originator-3',
    'color-originator-4',
    'color-originator-5',
    'color-originator-6',
    'color-originator-7',
    'color-originator-8',
  ];

  // Map each named originator to its rank among NAMED entries so palette
  // colors stay stable when "Other" / "Unknown" shift position in the
  // sorted list. The breakdown's named entries are already count-desc.
  const namedRank = $derived.by<Map<string, number>>(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const e of breakdown) {
      if (!e.synthetic) m.set(e.id, i++);
    }
    return m;
  });

  function colorTokenFor(entry: OriginatorBreakdownEntry): string {
    if (entry.id === '__originator_other__') return 'color-originator-other';
    if (entry.id === '__originator_unknown__') return 'color-originator-unknown';
    const rank = namedRank.get(entry.id) ?? 0;
    return PALETTE_TOKENS[rank % PALETTE_TOKENS.length]!;
  }

  const arcs = $derived(
    computeArcs(
      breakdown.map((b) => ({ count: b.count })),
      geom,
    ),
  );

  const total = $derived(breakdown.reduce((s, b) => s + b.count, 0));

  function isActive(id: string): boolean {
    return store.originatorFilters.has(id);
  }

  const anyActive = $derived(store.originatorFilters.size > 0);
  const dimmedFill = 'var(--color-ink-200)';

  function fillFor(entry: OriginatorBreakdownEntry): string {
    const token = colorTokenFor(entry);
    if (!anyActive || isActive(entry.id)) return `var(--${token})`;
    return dimmedFill;
  }

  // Tick labels: short radial line + "count (percent%)" placed just outside
  // each non-trivial slice. Mirrors LicenseDonut's tick logic.
  interface Tick {
    line: { x1: number; y1: number; x2: number; y2: number };
    label: { x: number; y: number };
    anchor: 'start' | 'middle' | 'end';
    dy: string;
    text: string;
  }

  const ticks = $derived.by<Tick[]>(() => {
    if (total <= 0) return [];
    const nonEmpty = breakdown.filter((b) => b.count > 0);
    if (nonEmpty.length <= 1) return [];

    const out: Tick[] = [];
    let cumulative = 0;
    const minVisibleFraction = 0.02;
    for (const b of breakdown) {
      if (b.count <= 0) continue;
      const fraction = b.count / total;
      const startA = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
      cumulative += b.count;
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
      const pct = Math.max(1, Math.round((b.count / total) * 100));
      out.push({
        line: { x1: tickIn.x, y1: tickIn.y, x2: tickOut.x, y2: tickOut.y },
        label: labelPos,
        anchor,
        dy,
        text: `${b.count} (${pct}%)`,
      });
    }
    return out;
  });
</script>

{#if total > 0}
  <section class="donut" aria-label="Originator breakdown">
    <h2 class="donut__heading">Licenses by Originator</h2>
    <div class="donut__layout">
      <svg
        class="donut__svg"
        viewBox="0 0 200 200"
        role="img"
        aria-label="Originator breakdown"
      >
        {#each arcs as arc (arc.index)}
          {@const entry = breakdown[arc.index]}
          {#if entry}
            <path
              d={arc.d}
              fill={fillFor(entry)}
              stroke-width="1"
              stroke-linejoin="round"
              class="donut__segment"
              class:donut__segment--active={isActive(entry.id)}
              class:donut__segment--dimmed={anyActive && !isActive(entry.id)}
              role="button"
              tabindex="0"
              aria-pressed={isActive(entry.id)}
              aria-label={`${entry.label}: ${entry.count} components`}
              onclick={() => store.toggleOriginator(entry.id)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  store.toggleOriginator(entry.id);
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
        {#each breakdown as entry (entry.id)}
          <li>
            <button
              type="button"
              class="legend__row"
              class:legend__row--active={isActive(entry.id)}
              class:legend__row--dimmed={anyActive && !isActive(entry.id)}
              onclick={() => store.toggleOriginator(entry.id)}
              aria-pressed={isActive(entry.id)}
              title={entry.label}
            >
              <span
                class="legend__swatch"
                style={`background: ${fillFor(entry)};`}
                aria-hidden="true"
              ></span>
              <span class="legend__label">{entry.label}</span>
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
    background: var(--color-surface);
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
    stroke: var(--color-segment-gap);
  }
  .donut__segment:hover {
    opacity: 0.85;
  }
  .donut__segment--active {
    transform: scale(1.08);
  }
  .donut__segment--dimmed {
    transition: fill 120ms ease;
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
    /* Originator names can be long and there can be ~10 rows; cap height
     * and let the list scroll rather than blow up the card vertically. */
    max-height: 22rem;
    overflow-y: auto;
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
  .legend__row--dimmed .legend__label,
  .legend__row--dimmed .legend__count {
    color: var(--color-ink-400);
  }
  .legend__swatch {
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--color-ink-900) 20%, transparent);
    flex-shrink: 0;
  }
  .legend__label {
    font-size: 0.875rem;
    color: var(--color-ink-700);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
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
