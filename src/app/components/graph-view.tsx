"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { GraphViewNode, GraphViewLink } from "@/lib/content/links";
import { t } from "@/lib/i18n";

interface GraphViewProps {
  nodes: GraphViewNode[];
  links: GraphViewLink[];
  /** Shorter height for an inline "local graph" pane (vs the full-page graph). */
  compact?: boolean;
  /** Node id to render as the focused center (Obsidian local-graph style). */
  focusId?: string;
  locale?: string;
}

// Logical canvas (the SVG viewBox); pan/zoom is applied as a <g> transform on top.
const W = 800;
const H = 600;
const CX = W / 2;
const CY = H / 2;

// Simulation constants — tuned for blog-scale graphs (tens–low hundreds of nodes).
// DAMPING/ALPHA_DECAY are deliberately gentle so the layout drifts calmly into
// place over a few seconds (Obsidian-like) rather than snapping or thrashing.
const REPULSION = 2400;
// Rest length of a link. Connected nodes sit a bit farther apart than the bare
// collision minimum, so related notes get more breathing room for their labels.
const LINK_DIST = 116;
const SPRING = 0.03;
const CENTER = 0.006;
// High damping (low friction) + slow decay → nodes glide gently and keep drifting
// for a few seconds instead of snapping into place.
const DAMPING = 0.9;
const ALPHA_DECAY = 0.994;
const ALPHA_MIN = 0.004;
// Extra gap enforced between any two node circles so they never overlap. Dragging
// a node shoves its neighbors out by this much (Obsidian-style collision).
const COLLIDE_PAD = 10;
// Alpha injected when the reader grabs a node, so the layout re-settles and the
// dragged node pushes the rest instead of the sim sitting frozen.
const REHEAT = 0.5;
// Max distance a node may move in a single frame. Caps the first-frame jolt
// (alpha=1 far from equilibrium) so the start glides slowly instead of snapping.
const MAX_STEP = 6;
// How fast the auto-fit camera eases toward its target each frame (0..1). Low =
// smooth glide instead of a per-frame jump.
const FIT_EASE = 0.12;
// Golden angle — spreads the initial spiral evenly without a mechanical ring.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface SimNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
}

interface Pt {
  x: number;
  y: number;
}

function nodeRadius(degree: number): number {
  return 4 + Math.min(degree, 12) * 1.4;
}

/**
 * GraphView — zero-dependency force-directed graph rendered as SVG.
 *
 * The simulation runs client-side via requestAnimationFrame; the physics array
 * lives in a ref while the rendered positions live in state (so render never
 * reads a ref). Initial positions are a deterministic ring, so the
 * server-rendered SVG matches the first client paint. Pan (drag background),
 * zoom (wheel), node drag, and click-to-navigate are supported.
 */
export function GraphView({
  nodes,
  links,
  compact = false,
  focusId,
  locale,
}: GraphViewProps) {
  const loc = locale ?? "en";
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const indexById = useMemo(
    () => new Map(nodes.map((n, i) => [n.id, i])),
    [nodes]
  );

  // Undirected adjacency for Obsidian-style hover highlighting (focus a node →
  // dim everything not connected to it).
  const adjacency = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const l of links) {
      (adj.get(l.source) ?? adj.set(l.source, new Set()).get(l.source)!).add(
        l.target
      );
      (adj.get(l.target) ?? adj.set(l.target, new Set()).get(l.target)!).add(
        l.source
      );
    }
    return adj;
  }, [links]);

  // Deterministic golden-angle spiral for the initial (server-rendered) frame.
  // A moderate radius keeps the nodes loosely clustered so they drift gently
  // outward into place (more life than a static ring, no violent burst).
  // Rounded to 2 decimals so Math.cos/sin's ~1e-14 divergence between the server
  // and browser JS engines can't reach the rendered string → no hydration
  // mismatch. The live simulation (client-only) uses full-precision values.
  const initialPositions = useMemo<Pt[]>(() => {
    const spread = 80;
    const round = (v: number) => Math.round(v * 100) / 100;
    return nodes.map((_, i) => {
      const radius = spread * Math.sqrt(i + 0.5);
      const angle = i * GOLDEN_ANGLE;
      return {
        x: round(CX + radius * Math.cos(angle)),
        y: round(CY + radius * Math.sin(angle)),
      };
    });
  }, [nodes]);

  const simRef = useRef<SimNode[] | null>(null);
  // Simulation energy + RAF handle live in refs so pointer handlers can reheat a
  // settled layout (e.g. when a node is grabbed) without restarting the effect.
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const reheatRef = useRef<((amount: number) => void) | null>(null);
  const [positions, setPositions] = useState<Pt[]>(initialPositions);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Pointer interaction state kept in a ref (no re-render churn).
  const drag = useRef<
    | { kind: "pan"; startX: number; startY: number; ox: number; oy: number }
    | { kind: "node"; index: number; moved: boolean }
    | null
  >(null);

  // Once the reader pans/zooms/drags, stop auto-fitting so we never fight them.
  const userAdjusted = useRef(false);

  // ── Simulation loop ───────────────────────────────────────
  useEffect(() => {
    const sim: SimNode[] = initialPositions.map((p) => ({
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      pinned: false,
    }));
    simRef.current = sim;
    // Per-node collision radius (circle radius + a fixed gap). Cached once.
    const radii = nodes.map((n) => nodeRadius(n.degree) + COLLIDE_PAD);
    alphaRef.current = 1;

    // One fixed physics step. Kept separate from the render frame so the sim
    // advances at a constant rate regardless of the display's refresh rate.
    const stepPhysics = () => {
      const alpha = alphaRef.current;
      for (const n of sim) {
        if (n.pinned) continue;
        let fx = 0;
        let fy = 0;
        for (const m of sim) {
          if (m === n) continue;
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const d2 = dx * dx + dy * dy + 0.01;
          const f = REPULSION / d2;
          const d = Math.sqrt(d2);
          fx += (f * dx) / d;
          fy += (f * dy) / d;
        }
        fx += (CX - n.x) * CENTER;
        fy += (CY - n.y) * CENTER;
        n.vx = (n.vx + fx * alpha) * DAMPING;
        n.vy = (n.vy + fy * alpha) * DAMPING;
      }
      for (const l of links) {
        const si = indexById.get(l.source);
        const ti = indexById.get(l.target);
        if (si === undefined || ti === undefined) continue;
        const s = sim[si];
        const t = sim[ti];
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = ((d - LINK_DIST) * SPRING * alpha) / d;
        if (!s.pinned) {
          s.vx += dx * force;
          s.vy += dy * force;
        }
        if (!t.pinned) {
          t.vx -= dx * force;
          t.vy -= dy * force;
        }
      }
      for (const n of sim) {
        if (n.pinned) continue;
        // Clamp per-step speed so the layout never lurches (gentle Obsidian feel).
        const sp = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (sp > MAX_STEP) {
          const scale = MAX_STEP / sp;
          n.vx *= scale;
          n.vy *= scale;
        }
        n.x += n.vx;
        n.y += n.vy;
      }
      // Hard collision pass (position-based, like d3-force collide): no two node
      // circles overlap. A pinned (dragged) node shoves the other, so dragging
      // pushes the rest out of the way instead of overlapping them.
      for (let a = 0; a < sim.length; a++) {
        for (let b = a + 1; b < sim.length; b++) {
          const na = sim[a];
          const nb = sim[b];
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const minD = radii[a] + radii[b];
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d >= minD) continue;
          if (d === 0) {
            // Exact overlap: nudge deterministically (index-based) to break the tie.
            if (!nb.pinned) nb.x += 0.5 + (b % 2);
            continue;
          }
          const overlap = (minD - d) / d;
          const ox = dx * overlap;
          const oy = dy * overlap;
          if (na.pinned && !nb.pinned) {
            nb.x += ox * 0.85; // dragged node shoves the other — snappy but eased
            nb.y += oy * 0.85;
          } else if (!na.pinned && nb.pinned) {
            na.x -= ox * 0.85;
            na.y -= oy * 0.85;
          } else if (!na.pinned && !nb.pinned) {
            // Free pair: resolve overlap gradually so a shove eases apart instead
            // of popping in one frame.
            na.x -= ox * 0.2;
            na.y -= oy * 0.2;
            nb.x += ox * 0.2;
            nb.y += oy * 0.2;
          }
        }
      }
      alphaRef.current = alpha * ALPHA_DECAY;
    };

    // Fixed-timestep driver: accumulate real elapsed time and run whole physics
    // steps of FIXED ms. This decouples simulation speed from the refresh rate —
    // a 144Hz display settles in the same wall-clock time as a 60Hz one.
    const FIXED = 1000 / 60;
    const MAX_SUBSTEPS = 3;
    let last: number | null = null;
    let acc = 0;

    const tick = (now: number) => {
      if (last === null) last = now;
      let dt = now - last;
      last = now;
      if (dt > 100) dt = 100; // backgrounded tab — don't fast-forward the sim
      acc += dt;
      let stepped = false;
      let sub = 0;
      while (acc >= FIXED && sub < MAX_SUBSTEPS) {
        stepPhysics();
        acc -= FIXED;
        sub++;
        stepped = true;
      }
      if (acc > FIXED) acc = FIXED; // shed backlog to avoid a spiral of death
      if (stepped) setPositions(sim.map((n) => ({ x: n.x, y: n.y })));
      // Auto-fit camera eases toward its target every frame (not per physics step)
      // for smoothness — the per-frame snap is what read as a "wild" animation.
      if (!userAdjusted.current) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const n of sim) {
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.x > maxX) maxX = n.x;
          if (n.y > maxY) maxY = n.y;
        }
        const pad = 70;
        const cw = Math.max(maxX - minX, 1);
        const ch = Math.max(maxY - minY, 1);
        // Cap zoom-in so a 1–2 node cluster doesn't balloon to fill the frame.
        const tk = Math.min((W - 2 * pad) / cw, (H - 2 * pad) / ch, 1.6);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const tx = CX - tk * cx;
        const ty = CY - tk * cy;
        setTransform((t) => ({
          k: t.k + (tk - t.k) * FIT_EASE,
          x: t.x + (tx - t.x) * FIT_EASE,
          y: t.y + (ty - t.y) * FIT_EASE,
        }));
      }
      if (alphaRef.current > ALPHA_MIN) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null; // settled — loop parked until reheated
      }
    };

    // Reheat a settled layout: bump alpha and restart the loop if it has parked.
    // Pointer handlers call this (via reheatRef) when a node is grabbed/dragged.
    reheatRef.current = (amount: number) => {
      alphaRef.current = Math.max(alphaRef.current, amount);
      if (rafRef.current === null) {
        last = null; // recalibrate the clock so the first frame doesn't over-step
        acc = 0;
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      reheatRef.current = null;
    };
  }, [initialPositions, links, indexById, nodes]);

  // ── Coordinate helpers ────────────────────────────────────
  const toLogical = useCallback(
    (clientX: number, clientY: number): Pt => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const vx = ((clientX - rect.left) / rect.width) * W;
      const vy = ((clientY - rect.top) / rect.height) * H;
      return {
        x: (vx - transform.x) / transform.k,
        y: (vy - transform.y) / transform.k,
      };
    },
    [transform]
  );

  // ── Pointer handlers ──────────────────────────────────────
  const onPointerDownNode = (index: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "node", index, moved: false };
    const sim = simRef.current;
    if (sim) sim[index].pinned = true;
    // Wake the layout so neighbors start reacting as the node is dragged.
    reheatRef.current?.(REHEAT);
  };

  const onPointerDownBg = (e: React.PointerEvent) => {
    drag.current = {
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      ox: transform.x,
      oy: transform.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = ((e.clientX - d.startX) / rect.width) * W;
      const dy = ((e.clientY - d.startY) / rect.height) * H;
      if (dx !== 0 || dy !== 0) userAdjusted.current = true;
      setTransform((t) => ({ ...t, x: d.ox + dx, y: d.oy + dy }));
    } else {
      d.moved = true;
      userAdjusted.current = true;
      const sim = simRef.current;
      if (!sim) return;
      const p = toLogical(e.clientX, e.clientY);
      const n = sim[d.index];
      n.x = p.x;
      n.y = p.y;
      n.vx = 0;
      n.vy = 0;
      // Keep the sim warm so the dragged node keeps shoving its neighbors.
      reheatRef.current?.(REHEAT);
      setPositions(sim.map((m) => ({ x: m.x, y: m.y })));
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (d && d.kind === "node") {
      const sim = simRef.current;
      if (sim) sim[d.index].pinned = false;
      // A press with no drag movement is a click → navigate.
      if (!d.moved) router.push(nodes[d.index].url);
    }
    drag.current = null;
  };

  // Native, non-passive wheel listener so we can preventDefault. React's synthetic
  // onWheel is registered passively, so the page scrolls instead of zooming and the
  // gesture never "takes". Cursor-anchored; computes everything from the current
  // transform inside the updater to avoid a stale closure.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const vx = ((e.clientX - rect.left) / rect.width) * W;
      const vy = ((e.clientY - rect.top) / rect.height) * H;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      userAdjusted.current = true;
      setTransform((t) => {
        const k = Math.min(4, Math.max(0.25, t.k * factor));
        // Keep the point under the cursor stationary while zooming.
        const px = (vx - t.x) / t.k;
        const py = (vy - t.y) / t.k;
        return { k, x: vx - px * k, y: vy - py * k };
      });
    };
    svg.addEventListener("wheel", onWheelNative, { passive: false });
    return () => svg.removeEventListener("wheel", onWheelNative);
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {t(loc, "common.noLinksYet")}
      </div>
    );
  }

  // Obsidian-style search: matching nodes stay lit, the rest dim out.
  const q = query.trim().toLowerCase();
  const queryActive = q !== "";
  const matchesQuery = (title: string) =>
    !queryActive || title.toLowerCase().includes(q);

  // Label de-clutter: in dense areas only render labels that don't collide.
  // Priority order — the hovered node first, then by degree — so the important
  // nodes keep their labels; a hidden label reappears when you hover its node.
  // Recomputed each frame from `positions`; O(n²) but trivial at blog scale.
  const hoverIdx = hover !== null ? indexById.get(hover) ?? -1 : -1;
  const labelVisible = new Set<number>();
  if (compact) {
    // The local graph is small and exists to show a note's connections — never
    // hide its labels; de-cluttering is only for the dense full graph.
    nodes.forEach((_, i) => labelVisible.add(i));
  } else {
    const order = nodes.map((_, i) => i).sort((a, b) => {
      if (a === hoverIdx) return -1;
      if (b === hoverIdx) return 1;
      return nodes[b].degree - nodes[a].degree || a - b;
    });
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    for (const i of order) {
      const p = positions[i];
      if (!p) continue;
      const rr = nodeRadius(nodes[i].degree);
      const w = Math.max(nodes[i].title.length * 5.2, 8); // ~char width at 9px
      const box = {
        l: p.x - w / 2,
        r: p.x + w / 2,
        t: p.y + rr + 2,
        b: p.y + rr + 13,
      };
      const clash = placed.some(
        (o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t
      );
      if (!clash) {
        placed.push(box);
        labelVisible.add(i);
      }
    }
  }

  return (
    <div className={`relative ${compact ? "h-[340px]" : "h-[70vh]"} w-full`}>
      {!compact ? (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(loc, "common.searchNotes")}
          aria-label={t(loc, "common.searchGraph")}
          className="absolute left-3 top-3 z-10 w-48 rounded-md border border-zinc-200 bg-white/90 px-2.5 py-1 text-sm text-zinc-700 shadow-sm backdrop-blur placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200"
        />
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full touch-none select-none rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
      onPointerDown={onPointerDownBg}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      role="img"
      aria-label={t(loc, "common.contentGraph")}
    >
      <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
        {links.map((l, i) => {
          const s = positions[indexById.get(l.source) ?? -1];
          const t = positions[indexById.get(l.target) ?? -1];
          if (!s || !t) return null;
          const incident = hover === l.source || hover === l.target;
          // Dim an edge unless a hovered node touches it, or — when searching —
          // at least one endpoint matches the query.
          const sNode = nodes[indexById.get(l.source) ?? -1];
          const tNode = nodes[indexById.get(l.target) ?? -1];
          const queryHides =
            queryActive &&
            !matchesQuery(sNode?.title ?? "") &&
            !matchesQuery(tNode?.title ?? "");
          const dim = (hover !== null && !incident) || queryHides;
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              className={
                incident
                  ? "stroke-indigo-400"
                  : "stroke-zinc-300 dark:stroke-zinc-700"
              }
              strokeWidth={incident ? 1.6 : 1}
              opacity={dim ? 0.12 : 1}
            />
          );
        })}
        {nodes.map((n, i) => {
          const p = positions[i];
          if (!p) return null;
          const r = nodeRadius(n.degree);
          const isCenter = focusId !== undefined && n.id === focusId;
          const matchQuery = matchesQuery(n.title);
          const hovered = hover === n.id;
          // Emphasis (color/ring): hovered node, local-graph center, or a search hit.
          const isFocus =
            hovered ||
            (hover === null && isCenter) ||
            (hover === null && queryActive && matchQuery);
          const isNeighbor = hover !== null && adjacency.get(hover)?.has(n.id);
          const dim =
            (hover !== null && !isFocus && !isNeighbor) ||
            (queryActive && !matchQuery);
          // On hover the node grows and its label nudges down + scales up, with
          // every change eased via CSS so colors fade in instead of snapping.
          const rDisplay = hovered ? r * 1.45 : r;
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              className="cursor-pointer"
              opacity={dim ? 0.18 : 1}
              style={{ transition: "opacity 200ms ease" }}
              onPointerDown={onPointerDownNode(i)}
              onPointerEnter={() => setHover(n.id)}
              onPointerLeave={() => setHover(null)}
            >
              <circle
                r={rDisplay}
                className={`${
                  n.type === "post" ? "fill-indigo-500" : "fill-amber-500"
                } ${
                  isFocus
                    ? "stroke-indigo-300"
                    : "stroke-zinc-50 dark:stroke-zinc-900"
                }`}
                strokeWidth={isFocus ? 2.5 : 1.5}
                style={{
                  transition:
                    "r 180ms ease-out, fill 220ms ease, stroke 220ms ease, stroke-width 220ms ease",
                }}
              />
              {labelVisible.has(i) ? (
                <text
                  x={0}
                  y={rDisplay + (hovered ? 14 : 12)}
                  textAnchor="middle"
                  className={`pointer-events-none ${
                    isFocus
                      ? "fill-zinc-900 dark:fill-zinc-50 font-medium"
                      : "fill-zinc-500 dark:fill-zinc-400"
                  }`}
                  style={{
                    fontSize: hovered ? "11px" : "9px",
                    transition:
                      "font-size 180ms ease-out, y 180ms ease-out, fill 220ms ease",
                  }}
                >
                  {n.title}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
      </svg>
    </div>
  );
}
