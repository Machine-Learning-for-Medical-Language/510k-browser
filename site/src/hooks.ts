import { useEffect, useState } from "preact/hooks";

export type Async<T> =
  | { state: "loading" }
  | { state: "ready"; value: T }
  | { state: "error"; error: Error };

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): Async<T> {
  const [result, setResult] = useState<Async<T>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    setResult({ state: "loading" });
    load().then(
      (value) => live && setResult({ state: "ready", value }),
      (error: unknown) =>
        live &&
        setResult({
          state: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    );
    return () => {
      live = false;
    };
  }, deps);
  return result;
}
