import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  type Core,
  loadCore,
  loadNode,
  loadProductCodes,
  type NodeRecord,
  type ProductCode,
} from "../data";
import { useAsync } from "../hooks";
import {
  descendantFlags,
  descendants,
  predicateCoverageYear,
  predicateFlags,
  predicates,
} from "../lineage";
import { searchHref } from "../router";
import { DeviceTable, Pending } from "./common";
import type { LayoutKind, LineageGraphProps } from "./LineageGraph";

const CITED_BY_PAGE = 50;
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

interface Loaded {
  core: Core;
  record: NodeRecord | null;
  codes: Record<string, ProductCode>;
}

export function DevicePage({ id }: { id: string }) {
  const loaded = useAsync<Loaded>(async () => {
    const [core, record, codes] = await Promise.all([loadCore(), loadNode(id), loadProductCodes()]);
    return { core, record, codes };
  }, [id]);
  return (
    <section class="page device">
      <Pending value={loaded} label={id}>
        {({ core, record, codes }) => {
          const node = core.index.get(id);
          if (node === undefined || record === null)
            return (
              <>
                <h1>{id} isn't in this dataset</h1>
                <p>
                  Check the number, or{" "}
                  <a href={searchHref(id.slice(0, 3))}>browse nearby submissions</a>.
                </p>
              </>
            );
          return <Device key={id} core={core} node={node} id={id} record={record} codes={codes} />;
        }}
      </Pending>
    </section>
  );
}

function Device({
  core,
  node,
  id,
  record,
  codes,
}: {
  core: Core;
  node: number;
  id: string;
  record: NodeRecord;
  codes: Record<string, ProductCode>;
}) {
  const [up, setUp] = useState(3);
  const [down, setDown] = useState(1);
  const [layout, setLayout] = useState<LayoutKind>("timeline");
  const [citedShown, setCitedShown] = useState(CITED_BY_PAGE);

  const preds = predicates(core.graph, node);
  const predFlags = predicateFlags(core.graph, node);
  const descs = descendants(core.graph, node);
  const descFlags = descendantFlags(core.graph, node);
  const byYearDesc = descs
    .map((n, i) => ({ node: n, flags: descFlags[i] }))
    .sort((a, b) => (core.search.year[b.node] ?? 0) - (core.search.year[a.node] ?? 0));
  const code = record.product_code ? codes[record.product_code] : undefined;

  return (
    <>
      <p class="device-id">{id}</p>
      <h1 class="device-name">{record.device_name ?? "Not in openFDA 510(k) data"}</h1>
      {record.applicant && <p class="device-applicant">{record.applicant}</p>}
      <p class="actions">
        {record.record_url && (
          <a class="button" href={record.record_url} target="_blank" rel="noopener">
            Open the FDA record
          </a>
        )}
        {record.summary_pdf_url && (
          <a
            class="button button-quiet"
            href={record.summary_pdf_url}
            target="_blank"
            rel="noopener"
          >
            Open the 510(k) summary (PDF)
          </a>
        )}
      </p>

      <h2>Lineage</h2>
      <form class="lineage-controls" onSubmit={(e) => e.preventDefault()}>
        <label>
          Generations back
          <input
            type="range"
            min="0"
            max="8"
            value={up}
            onInput={(e) => setUp(Number(e.currentTarget.value))}
          />
          <output>{up}</output>
        </label>
        <label>
          Generations forward
          <input
            type="range"
            min="0"
            max="4"
            value={down}
            onInput={(e) => setDown(Number(e.currentTarget.value))}
          />
          <output>{down}</output>
        </label>
        <fieldset class="segmented">
          <legend class="visually-hidden">Layout</legend>
          {(["timeline", "tree"] as const).map((kind) => (
            <label key={kind}>
              <input
                type="radio"
                name="layout"
                value={kind}
                checked={layout === kind}
                onChange={() => setLayout(kind)}
              />
              {kind === "timeline" ? "By year" : "By generation"}
            </label>
          ))}
        </fieldset>
      </form>
      <LazyLineageGraph core={core} focal={node} up={up} down={down} layout={layout} />

      <div class="device-columns">
        <Details record={record} code={code} />
        <div>
          <h2>Predicates</h2>
          {preds.length > 0 ? (
            <DeviceTable
              core={core}
              caption={`Predicates cited by ${id}`}
              items={preds.map((n, i) => ({ node: n, flags: predFlags[i] }))}
            />
          ) : (
            <p class="empty">{noPredicateReason(core, record)}</p>
          )}

          <h2>Cited by</h2>
          {descs.length > 0 ? (
            <>
              <DeviceTable
                core={core}
                caption={`Devices citing ${id} as a predicate`}
                items={byYearDesc.slice(0, citedShown)}
              />
              {citedShown < descs.length && (
                <button type="button" class="more" onClick={() => setCitedShown(descs.length)}>
                  Show all {descs.length}
                </button>
              )}
            </>
          ) : (
            <p class="empty">No later clearance in this dataset names {id} as its predicate.</p>
          )}
        </div>
      </div>
    </>
  );
}

function Details({ record, code }: { record: NodeRecord; code: ProductCode | undefined }) {
  const rows: [string, string | undefined][] = [
    ["Decision", record.decision_description ?? record.decision_code],
    ["Decided", record.decision_date && date.format(new Date(record.decision_date))],
    ["Received", record.date_received && date.format(new Date(record.date_received))],
    [
      "Product code",
      record.product_code &&
        [record.product_code, code?.name, code?.class && `Class ${code.class}`]
          .filter(Boolean)
          .join(", "),
    ],
    ["Regulation", code?.regulation ? `21 CFR ${code.regulation}` : undefined],
    ["Review panel", record.advisory_committee_description],
    ["Submission type", record.clearance_type],
    ["Public document", record.statement_or_summary],
    ["Third-party review", record.third_party_flag === "Y" ? "Yes" : undefined],
    [
      "Location",
      [record.city, record.state, record.country_code].filter(Boolean).join(", ") || undefined,
    ],
  ];
  return (
    <dl class="details">
      {rows
        .filter(([, value]) => value)
        .map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function noPredicateReason(core: Core, record: NodeRecord): string {
  if (!record.known)
    return "This number is cited as a predicate but isn't in the openFDA 510(k) data.";
  if (record.type !== "510k") return "Predicate links are only extracted for 510(k) clearances.";
  if (record.no_predicate_found)
    return "Reviewed by hand: the summary doesn't identify a predicate by number.";
  if (record.statement_or_summary === "Statement")
    return "This clearance has a 510(k) statement instead of a summary, so its predicates aren't public.";
  const coverage = predicateCoverageYear(core.graph, core.search.year);
  const decided = record.decision_date ? Number(record.decision_date.slice(0, 4)) : 0;
  if (decided >= coverage)
    return `Not processed yet. Predicate links currently cover devices decided through ${coverage}.`;
  return "No predicate number was found in this clearance's summary.";
}

let lineageGraph: Promise<ComponentType<LineageGraphProps>> | undefined;

/** Cytoscape is most of the bundle, and only this page needs it. */
function LazyLineageGraph(props: LineageGraphProps) {
  const [Graph, setGraph] = useState<ComponentType<LineageGraphProps> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    lineageGraph ??= import("./LineageGraph").then((m) => m.LineageGraph);
    lineageGraph.then(
      (component) => setGraph(() => component),
      () => {
        lineageGraph = undefined;
        setFailed(true);
      },
    );
  }, []);
  if (failed)
    return (
      <p class="status status-error">Couldn't load the graph. Reload the page to try again.</p>
    );
  if (!Graph) return <p class="status">Loading the graph…</p>;
  return <Graph {...props} />;
}
