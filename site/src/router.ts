import { useEffect, useState } from "preact/hooks";

export type Route =
  | { view: "home" }
  | { view: "search"; q: string; yearFrom?: number; yearTo?: number }
  | { view: "device"; id: string }
  | { view: "about" }
  | { view: "missing"; hash: string };

/** Hash routes, so deep links work on GitHub Pages without server rewrites. */
export function parseHash(hash: string): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?", 2);
  const params = new URLSearchParams(query);
  const segments = path.split("/").filter(Boolean);
  const num = (key: string) => {
    const value = Number(params.get(key));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  };
  switch (segments[0]) {
    case undefined:
      return { view: "home" };
    case "search":
      return { view: "search", q: params.get("q") ?? "", yearFrom: num("from"), yearTo: num("to") };
    case "device":
      return segments[1] ? { view: "device", id: segments[1].toUpperCase() } : { view: "home" };
    case "about":
      return { view: "about" };
    default:
      return { view: "missing", hash };
  }
}

export function deviceHref(id: string): string {
  return `#/device/${id}`;
}

export function searchHref(q: string, yearFrom?: number, yearTo?: number): string {
  const params = new URLSearchParams({ q });
  if (yearFrom) params.set("from", String(yearFrom));
  if (yearTo) params.set("to", String(yearTo));
  return `#/search?${params}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
