import type { ComponentChildren } from "preact";
import { type Core, EdgeFlag } from "../data";
import type { Async } from "../hooks";
import { citationCount } from "../lineage";
import { deviceHref } from "../router";

export function Pending<T>({
  value,
  label,
  children,
}: {
  value: Async<T>;
  label: string;
  children: (value: T) => ComponentChildren;
}) {
  if (value.state === "loading") return <p class="status">Loading {label}…</p>;
  if (value.state === "error")
    return (
      <p class="status status-error" role="alert">
        {value.error.message} Reload the page to try again.
      </p>
    );
  return <>{children(value.value)}</>;
}

export interface DeviceListItem {
  node: number;
  flags?: number;
}

/** A table of devices: identifier, name, applicant, decision year and citation count. */
export function DeviceTable({
  core,
  items,
  caption,
}: {
  core: Core;
  items: DeviceListItem[];
  caption: string;
}) {
  const { ids, search, graph } = core;
  return (
    <table class="devices">
      <caption class="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Submission</th>
          <th scope="col">Device</th>
          <th scope="col" class="col-applicant">
            Applicant
          </th>
          <th scope="col" class="num">
            Decided
          </th>
          <th scope="col" class="num">
            Cited by
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map(({ node, flags = 0 }) => {
          const id = ids[node] as string;
          const name = search.name[node];
          const year = search.year[node];
          return (
            <tr key={id}>
              <td class="id">
                <a href={deviceHref(id)}>{id}</a>
              </td>
              <td>
                {name || <span class="muted">Not in openFDA 510(k) data</span>}
                <EdgeNotes flags={flags} />
              </td>
              <td class="col-applicant">{search.applicants[search.applicant[node] as number]}</td>
              <td class="num">{year || ""}</td>
              <td class="num">{citationCount(graph, node) || ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EdgeNotes({ flags }: { flags: number }) {
  const notes: [string, string][] = [];
  if (flags & EdgeFlag.SEED_MANUAL) notes.push(["note", "Link entered by hand"]);
  if (flags & EdgeFlag.OVERRIDE) notes.push(["note", "Link added by correction"]);
  if (flags & EdgeFlag.PREDICATE_AFTER_DEVICE)
    notes.push(["note note-warn", "Predicate decided after this device was submitted"]);
  if (notes.length === 0) return null;
  return (
    <span class="edge-notes">
      {notes.map(([cls, text]) => (
        <span class={cls} key={text}>
          {text}
        </span>
      ))}
    </span>
  );
}
