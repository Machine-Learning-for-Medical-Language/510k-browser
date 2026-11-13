import { useEffect, useState } from "preact/hooks";
import { normalizeId } from "./data";
import { deviceHref, searchHref, useRoute } from "./router";
import { About } from "./views/About";
import { DevicePage } from "./views/DevicePage";
import { Home } from "./views/Home";
import { SearchResults } from "./views/SearchResults";

export function App() {
  const route = useRoute();

  useEffect(() => {
    scrollTo(0, 0);
  }, [route]);

  return (
    <>
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <header class="masthead">
        <a class="wordmark" href="#/">
          510(k) Browser
        </a>
        {route.view !== "home" && <SearchBox initial={route.view === "search" ? route.q : ""} />}
        <nav>
          <a href="#/about">About the data</a>
        </nav>
      </header>
      <main id="main">
        {route.view === "home" && <Home />}
        {route.view === "search" && <SearchResults route={route} />}
        {route.view === "device" && <DevicePage id={route.id} />}
        {route.view === "about" && <About />}
        {route.view === "missing" && (
          <section class="page">
            <h1>Page not found</h1>
            <p>
              There's nothing at <code>{route.hash}</code>. <a href="#/">Go to search</a>.
            </p>
          </section>
        )}
      </main>
    </>
  );
}

export function SearchBox({ initial = "", large = false }: { initial?: string; large?: boolean }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);

  const submit = (event: Event) => {
    event.preventDefault();
    const q = value.trim();
    if (!q) return;
    const id = normalizeId(q);
    location.hash = id ? deviceHref(id) : searchHref(q);
  };

  return (
    <search>
      <form class={large ? "search search-large" : "search"} onSubmit={submit}>
        <label class="visually-hidden" for={large ? "q-large" : "q"}>
          Search 510(k) clearances
        </label>
        <input
          id={large ? "q-large" : "q"}
          type="search"
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
          placeholder="K-number, device name, company or product code"
          autocomplete="off"
          spellcheck={false}
        />
        <button type="submit">Search</button>
      </form>
    </search>
  );
}
