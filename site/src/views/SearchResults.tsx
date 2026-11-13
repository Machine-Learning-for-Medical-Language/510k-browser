import { useMemo, useState } from "preact/hooks";
import { loadCore } from "../data";
import { useAsync } from "../hooks";
import { type Route, searchHref } from "../router";
import { buildIndex, type SearchIndex, search } from "../search";
import { DeviceTable, Pending } from "./common";

const fmt = new Intl.NumberFormat("en-US");
const PAGE = 100;

let indexCache: SearchIndex | undefined;

export function SearchResults({ route }: { route: Extract<Route, { view: "search" }> }) {
  const core = useAsync(loadCore, []);
  return (
    <section class="page">
      <Pending value={core} label="the search index">
        {(c) => {
          indexCache ??= buildIndex(c);
          return (
            <Results
              key={`${route.q}|${route.yearFrom}|${route.yearTo}`}
              index={indexCache}
              route={route}
            />
          );
        }}
      </Pending>
    </section>
  );
}

function Results({
  index,
  route,
}: {
  index: SearchIndex;
  route: Extract<Route, { view: "search" }>;
}) {
  const [shown, setShown] = useState(PAGE);
  const { q, yearFrom, yearTo } = route;
  const result = useMemo(
    () => search(index, q, { yearFrom, yearTo }, Number.POSITIVE_INFINITY),
    [index, q, yearFrom, yearTo],
  );

  const applyYears = (event: Event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const from = Number(form.get("from")) || undefined;
    const to = Number(form.get("to")) || undefined;
    location.hash = searchHref(q, from, to);
  };

  return (
    <>
      <h1>
        {result.total === 0 ? "No matches" : `${fmt.format(result.total)} matches`} for “{q}”
      </h1>
      <form class="filters" onSubmit={applyYears}>
        <label>
          Decided from <input name="from" type="number" min="1976" max="2100" value={yearFrom} />
        </label>
        <label>
          to <input name="to" type="number" min="1976" max="2100" value={yearTo} />
        </label>
        <button type="submit">Filter</button>
        {(yearFrom || yearTo) && <a href={searchHref(q)}>Clear years</a>}
      </form>
      {result.total === 0 ? (
        <p>
          Try fewer words, a company name, or a three-letter product code such as{" "}
          <a href={searchHref("DQY")}>DQY</a>.
        </p>
      ) : (
        <>
          <p class="section-note">Most-cited first, then newest.</p>
          <DeviceTable
            core={index.core}
            caption={`Search results for ${q}`}
            items={result.nodes.slice(0, shown).map((node) => ({ node }))}
          />
          {shown < result.total && (
            <button type="button" class="more" onClick={() => setShown(shown + PAGE)}>
              Show {Math.min(PAGE, result.total - shown)} more
            </button>
          )}
        </>
      )}
    </>
  );
}
