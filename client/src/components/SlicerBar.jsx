import { useEffect, useRef, useState } from "react";
import { family, sliceOptions, slicerDefaults, slicerItems, layoutGrid, itemPrompt, GRID_MAX_COLS, GRID_MAX_ROWS, PROMPT_MAX } from "@req-2-report/shared";

/** A multi-select list like SSRS's: "(Select All)" plus a checkbox per value. value: undefined (all) or [keys]. */
function ListPicker({ label, options, value, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current?.open && !ref.current.contains(e.target)) ref.current.open = false; };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const chosen = value ?? options;
  const set = (next) => onChange(next.length === options.length ? undefined : next);
  const toggle = (o) => set(chosen.includes(o) ? chosen.filter((x) => x !== o) : options.filter((x) => x === o || chosen.includes(x)));
  const shown = value === undefined ? "All" : !chosen.length ? "None" : chosen.length <= 2 ? chosen.join(", ") : `${chosen.slice(0, 2).join(", ")} +${chosen.length - 2}`;
  return (
    <details className="pick" ref={ref}>
      <summary className="sel" aria-label={`${label}: ${shown}`}>{shown}</summary>
      <div className="pick-pop" role="group" aria-label={label}>
        <label className="pick-all">
          <input type="checkbox" checked={value === undefined} onChange={() => set(value === undefined ? [] : options)} />
          (Select All)
        </label>
        {options.map((o) => (
          <label key={o}><input type="checkbox" checked={chosen.includes(o)} onChange={() => toggle(o)} />{o}</label>
        ))}
      </div>
    </details>
  );
}

/**
 * A filter's name; click it (or press Enter on it) to rename. Enter or clicking away saves, Escape cancels,
 * and an empty name goes back to the default. The name is the prompt readers see in SSRS.
 */
function FilterName({ text, fallback, onRename }) {
  const [editing, setEditing] = useState(false);
  const done = useRef(false);
  if (!editing) {
    return (
      <button className="slicer-name" onClick={() => { done.current = false; setEditing(true); }} title="Rename" aria-label={`Rename ${text}`}>
        <span className="slicer-name-text">{text}</span>
        <svg className="slicer-name-pen" width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M11.5 1.8 14.2 4.5 5.4 13.3 1.8 14.2 2.7 10.6Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }
  const finish = (value) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (value !== null) onRename(value.trim() === fallback ? "" : value.trim());
  };
  return (
    <input className="slicer-rename" autoFocus defaultValue={text} maxLength={PROMPT_MAX} aria-label={`New name for ${text}`}
      placeholder={fallback} onFocus={(e) => e.target.select()}
      onKeyDown={(e) => { if (e.key === "Enter") finish(e.currentTarget.value); if (e.key === "Escape") finish(null); }}
      onBlur={(e) => finish(e.currentTarget.value)} />
  );
}

/** A small "− 4 +" control for the grid size. */
function Stepper({ label, value, min, max, onChange }) {
  return (
    <span className="grid-step" role="group" aria-label={label}>
      <span className="grid-step-label">{label}</span>
      <button className="grid-step-btn" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
      <span className="grid-step-value" aria-live="polite">{value}</span>
      <button className="grid-step-btn" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>+</button>
    </span>
  );
}

const ARROWS = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };

/**
 * The readers' filters, as SSRS shows them above the report: a grid of parameter cells (a range takes two, from
 * and to). Here they slice the preview rows the same way. Filters can be dragged to another cell (swapping with
 * whatever is there) or moved with the arrow keys on their handle, and the grid can grow; the layout is exported
 * to SSRS. values: { [col key]: choice }; rows: the rows before slicing (for the pick lists);
 * layout/setLayout: { cols, rows, cells } (see layoutGrid); onRename(col key, side, name) renames a filter.
 */
export default function SlicerBar({ slicers, values, setValues, colsByKey, rows, tpl, layout, setLayout, onRename }) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const tiles = useRef({});
  if (!slicers.length) return null;

  const set = (key, v) => setValues((vs) => ({ ...vs, [key]: v }));
  // Reset goes back to how the report opens: date defaults, everything else All.
  const defaults = slicerDefaults(slicers);
  const clean = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && !(v.from === "" && v.to === "")).sort()));
  const changed = clean(values) !== clean(defaults);

  const items = slicerItems(slicers);
  const grid = layoutGrid(items.map((i) => i.id), layout);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const at = {};
  for (const [id, [r, c]] of Object.entries(grid.cells)) at[`${r},${c}`] = id;
  const minRows = Math.ceil(items.length / grid.cols);
  // Grid size changes build on the latest layout, so quick repeated clicks all count.
  const resize = (key, d) => setLayout((l) => { const g = layoutGrid(items.map((i) => i.id), l); return { ...g, [key]: g[key] + d }; });

  /** Puts an item in a cell; whatever was there takes the item's old place. */
  function move(id, r, c) {
    const other = at[`${r},${c}`];
    if (other === id) return;
    const cells = { ...grid.cells, [id]: [r, c] };
    if (other) cells[other] = grid.cells[id];
    setLayout({ cols: grid.cols, rows: grid.rows, cells });
  }
  function onKey(e, id) {
    const d = ARROWS[e.key];
    if (!d) return;
    e.preventDefault();
    const [r, c] = grid.cells[id], nr = r + d[0], nc = c + d[1];
    if (nr < 0 || nc < 0 || nc >= grid.cols || nr >= grid.rows) return;
    move(id, nr, nc);
    requestAnimationFrame(() => tiles.current[id]?.querySelector(".slicer-grip")?.focus());
  }

  const label = ({ s, side }) => itemPrompt(s, side, colsByKey[s.col], tpl);
  function control(item) {
    const { s, side } = item, c = colsByKey[s.col], v = values[s.col], name = label(item);
    if (s.kind === "list") return <ListPicker label={name} options={sliceOptions(rows, c.key)} value={v} onChange={(x) => set(c.key, x)} />;
    if (s.kind === "search") return <input className="inp" value={v ?? ""} placeholder="All" onChange={(e) => set(c.key, e.target.value)} aria-label={name} />;
    if (s.kind === "yesno") return (
      <select className="sel" value={v ?? "All"} onChange={(e) => set(c.key, e.target.value)} aria-label={name}>
        <option>All</option><option>Yes</option><option>No</option>
      </select>
    );
    return (
      <input className="inp" type={family(c.type) === "Date" ? "date" : "number"} placeholder="No limit"
        value={v?.[side] ?? ""} onChange={(e) => set(c.key, { ...v, [side]: e.target.value })} aria-label={name} />
    );
  }

  const cells = [];
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
    const key = `${r},${c}`, id = at[key], item = id && byId[id];
    cells.push(
      <div key={key} className={`slicer-cell${id ? "" : " empty"}${over === key ? " over" : ""}${id && id === dragId ? " dragging" : ""}`}
        onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(key); } }}
        onDragLeave={() => setOver((o) => (o === key ? null : o))}
        onDrop={(e) => { e.preventDefault(); const from = e.dataTransfer.getData("text/plain") || dragId; if (byId[from]) move(from, r, c); setDragId(null); setOver(null); }}>
        {item && (
          <div className="slicer" ref={(el) => { tiles.current[id] = el; }}>
            <span className="slicer-label">
              <button className="slicer-grip" draggable title="Drag to move. Arrow keys move it too." aria-label={`Move ${label(item)}`}
                onKeyDown={(e) => onKey(e, id)}
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; if (tiles.current[id]) e.dataTransfer.setDragImage(tiles.current[id], 12, 12); setDragId(id); }}
                onDragEnd={() => { setDragId(null); setOver(null); }}>
                <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">{[0, 1].flatMap((x) => [0, 1, 2].map((y) => <circle key={`${x}${y}`} cx={2 + x * 4} cy={2 + y * 4} r="1.2" />))}</svg>
              </button>
              <FilterName text={label(item)} fallback={itemPrompt({ ...item.s, prompts: undefined }, item.side, colsByKey[item.s.col], tpl)}
                onRename={(name) => onRename(item.s.col, item.side, name)} />
            </span>
            {control(item)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`slicer-bar no-print${dragId ? " is-dragging" : ""}`} role="group" aria-label="Report filters for readers">
      <div className="slicer-grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}>{cells}</div>
      <div className="slicer-foot">
        <span className="slicer-tip">Drag a filter by its handle to rearrange; click a name to rename it. SSRS shows the same.</span>
        <Stepper label="Columns" value={grid.cols} min={1} max={GRID_MAX_COLS} onChange={(n) => resize("cols", n - grid.cols)} />
        <Stepper label="Rows" value={grid.rows} min={minRows} max={GRID_MAX_ROWS} onChange={(n) => resize("rows", n - grid.rows)} />
        <button className="btn btn-quiet btn-sm slicer-reset" onClick={() => setValues(defaults)} disabled={!changed}>Reset filters</button>
      </div>
    </div>
  );
}
