import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Core, EdgeFlag } from "../data";
import { lineage } from "../lineage";
import { deviceHref } from "../router";
import {
  DEFAULT_LAYOUT,
  layoutTimeline,
  type TimelineLayout,
  timeOf,
  yearTicks,
} from "../timeline";

cytoscape.use(dagre);

const MAX_NODES = 250;

export type LayoutKind = "timeline" | "tree";

export interface LineageGraphProps {
  core: Core;
  focal: number;
  up: number;
  down: number;
  layout: LayoutKind;
}

const COLORS = {
  ink: "#18233a",
  slate: "#5b6578",
  rule: "#c9cfd6",
  paper: "#f3f5f2",
  ancestor: "#2f6f5e",
  descendant: "#8a5a12",
  warn: "#b23a2e",
};

export function LineageGraph({ core, focal, up, down, layout }: LineageGraphProps) {
  const container = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const view = useMemo(
    () => lineage(core.graph, focal, up, down, MAX_NODES),
    [core, focal, up, down],
  );

  useEffect(() => {
    if (!container.current) return;
    const { ids, search } = core;
    const nodes = [...view.generation].map(([node, generation]) => ({
      node,
      generation,
      time: timeOf(ids[node] as string, search.year[node] ?? 0),
    }));
    const { clientWidth, clientHeight } = container.current;
    const timeline =
      layout === "timeline"
        ? layoutTimeline(
            nodes,
            view.edges.map((e) => [e.device, e.predicate]),
            focal,
            { ...DEFAULT_LAYOUT, viewport: { width: clientWidth, height: clientHeight } },
          )
        : null;
    const positions = timeline?.positions;

    const elements: cytoscape.ElementDefinition[] = nodes.map(({ node, generation }) => ({
      group: "nodes",
      data: { id: String(node), label: ids[node] },
      classes: generation === 0 ? "focal" : generation < 0 ? "ancestor" : "descendant",
      position: positions?.get(node),
    }));
    for (const e of view.edges) {
      elements.push({
        group: "edges",
        data: {
          id: `${e.device}>${e.predicate}`,
          source: String(e.predicate),
          target: String(e.device),
        },
        classes: e.flags & EdgeFlag.PREDICATE_AFTER_DEVICE ? "suspect" : "",
      });
    }
    if (timeline) elements.push(...tickElements(nodes, timeline));

    const cy = cytoscape({
      container: container.current,
      elements,
      layout: positions
        ? { name: "preset", fit: true, padding: 32 }
        : ({
            name: "dagre",
            rankDir: "LR",
            nodeSep: 8,
            rankSep: 70,
            fit: true,
            padding: 32,
          } as cytoscape.LayoutOptions),
      minZoom: 0.15,
      maxZoom: 2.5,
      wheelSensitivity: 0.3,
      autoungrabify: true,
      boxSelectionEnabled: false,
      style: STYLE,
    });
    cy.on("tap", "node[label]", (evt) => {
      if (!evt.target.hasClass("tick")) location.hash = deviceHref(evt.target.data("label"));
    });
    cy.on("mouseover", "node", (evt) => {
      if (!evt.target.hasClass("tick")) setHovered(Number(evt.target.id()));
    });
    cy.on("mouseout", "node", () => setHovered(null));
    return () => cy.destroy();
  }, [core, view, focal, layout]);

  const ancestors = [...view.generation.values()].filter((g) => g < 0).length;
  const descendants = view.generation.size - ancestors - 1;

  return (
    <figure class="lineage">
      <div
        ref={container}
        class="lineage-canvas"
        role="img"
        aria-label={`Lineage graph: ${ancestors} ancestors and ${descendants} descendants. The predicate and cited-by tables list the same devices.`}
      />
      <figcaption>
        <Hovered core={core} node={hovered} />
        <span class="legend">
          <span class="key key-ancestor">Predicates and their predicates</span>
          <span class="key key-descendant">Devices that cite it</span>
          <span class="key key-suspect">
            Predicate decided after the citing device was submitted
          </span>
        </span>
        {view.truncated && (
          <span class="note note-warn">
            Showing the first {MAX_NODES} devices. Reduce the generations to see a complete view.
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function Hovered({ core, node }: { core: Core; node: number | null }) {
  if (node === null)
    return (
      <span class="hover-info muted">Point at a device to see its name. Select it to open it.</span>
    );
  const { search } = core;
  return (
    <span class="hover-info">
      <strong>{core.ids[node]}</strong> {search.name[node] || "Not in openFDA 510(k) data"}
      {search.year[node] ? ` (${search.year[node]})` : ""}
    </span>
  );
}

function tickElements(
  nodes: { time: number }[],
  timeline: TimelineLayout,
): cytoscape.ElementDefinition[] {
  const ys = [...timeline.positions.values()].map((p) => p.y);
  const times = nodes.map((n) => n.time);
  const top = Math.min(...ys) - DEFAULT_LAYOUT.laneHeight * 1.5;
  return yearTicks(Math.min(...times), Math.max(...times), timeline.xOf).map(({ year, x }) => ({
    group: "nodes",
    data: { id: `tick-${year}`, tick: String(year) },
    classes: "tick",
    position: { x, y: top },
    selectable: false,
  }));
}

const STYLE: cytoscape.StylesheetJson = [
  {
    selector: "node",
    style: {
      shape: "round-rectangle",
      width: 70,
      height: 20,
      "background-color": COLORS.paper,
      "border-width": 1.5,
      "border-color": COLORS.slate,
      label: "data(label)",
      "font-family": "Public Sans, sans-serif",
      "font-size": 10,
      "font-weight": 600,
      color: COLORS.ink,
      "text-valign": "center",
      "text-halign": "center",
    },
  },
  { selector: "node.ancestor", style: { "border-color": COLORS.ancestor, color: COLORS.ancestor } },
  {
    selector: "node.descendant",
    style: { "border-color": COLORS.descendant, color: COLORS.descendant },
  },
  {
    selector: "node.focal",
    style: {
      "background-color": COLORS.ink,
      "border-color": COLORS.ink,
      color: COLORS.paper,
      width: 78,
      height: 24,
      "font-size": 11,
    },
  },
  {
    selector: "node.tick",
    style: {
      label: "data(tick)",
      "background-opacity": 0,
      "border-width": 0,
      color: COLORS.slate,
      "font-weight": 400,
      events: "no",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": COLORS.rule,
      "target-arrow-color": COLORS.rule,
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.7,
      "curve-style": "bezier",
    },
  },
  {
    selector: "edge.suspect",
    style: { "line-color": COLORS.warn, "target-arrow-color": COLORS.warn, "line-style": "dashed" },
  },
];
