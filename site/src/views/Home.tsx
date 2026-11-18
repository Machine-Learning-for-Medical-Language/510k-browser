import { SearchBox } from "../App";
import { loadCore, loadMeta } from "../data";
import { useAsync } from "../hooks";
import { mostCited, predicateCoverageYear } from "../lineage";
import { DeviceTable, Pending } from "./common";

const fmt = new Intl.NumberFormat("en-US");

export function Home() {
  const meta = useAsync(loadMeta, []);
  const core = useAsync(loadCore, []);

  return (
    <section class="page home">
      <h1 class="home-title">
        Every 510(k) clearance leans on an earlier device. Follow the chain.
      </h1>
      <p class="lede">
        To clear a device through the 510(k) pathway, a manufacturer shows it is substantially
        equivalent to a <em>predicate</em>: a device already on the market. Search a clearance to
        see what it was compared to, and what was later cleared on top of it.
      </p>
      <SearchBox large />
      <Pending value={meta} label="build details">
        {(m) => (
          <p class="fineprint">
            {fmt.format(m.counts.devices)} clearances and {fmt.format(m.counts.edges)} predicate
            links. Device records from the openFDA export of {m.sources.devices_export_date}.
          </p>
        )}
      </Pending>

      <Pending value={core} label="the predicate graph">
        {(c) => (
          <>
            <h2>Most-cited predicates</h2>
            <p class="section-note">
              The devices other clearances name as their predicate most often.
            </p>
            <DeviceTable
              core={c}
              caption="Most-cited predicate devices"
              items={mostCited(c.graph, 12).map((node) => ({ node }))}
            />
            <p class="fineprint">
              Predicate links currently cover devices decided through{" "}
              {predicateCoverageYear(c.graph, c.search.year)}. Newer clearances are being added as
              their summaries are processed.
            </p>
          </>
        )}
      </Pending>
    </section>
  );
}
