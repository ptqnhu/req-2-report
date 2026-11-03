import { useEffect, useState } from "react";
import { LOOK_PARTS, PROP_NAMES, DISPLAY_OPTIONS, distinctDisplays, lookDefaults } from "@req-2-report/shared";

const COLOR_PROPS = new Set(["bg", "color", "stripe", "zebra", "line"]);
const TYPE_NAMES = {
  Text: "Text", Integer: "Whole number", Decimal: "Decimal", Currency: "Currency", Percentage: "Percentage",
  Date: "Date", DateTime: "Date and time", Boolean: "Yes / No",
};

/** "Title", or "Currency columns" for a data type. */
export const pickName = (p) => (p.kind === "part" ? LOOK_PARTS[p.name].name : `${TYPE_NAMES[p.name] || p.name} columns`);

/** Every element the designer can style, for the dropdown. `types` are the data types in the sample. */
export const pickOptions = (types, theme) => [
  ...Object.keys(LOOK_PARTS).filter((n) => n !== "band" || theme === "loanmart").map((name) => ({ kind: "part", name })),
  ...types.map((name) => ({ kind: "type", name })),
];

/**
 * Text size in points. What's typed is kept as it is while typing (so "14" can be typed over "20" one digit at a
 * time); it's used once it's a size from 6 to 40, and leaving the box puts back the size in use.
 */
function SizeInput({ id, value, onChange }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => setText(value == null ? "" : String(value)), [value]);
  return (
    <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
      <input id={id} type="number" className="inp" style={{ width: 80 }} min={6} max={40} step={0.5} value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && n >= 6 && n <= 40) onChange(Math.round(n * 2) / 2);
        }}
        onBlur={() => setText(value == null ? "" : String(value))} />
      <span className="muted">pt</span>
    </span>
  );
}

/** One setting: a colour picker, a size box or a bold tick, with Reset once the template changes it. */
function Field({ prop, value, fallback, onChange }) {
  const set = value !== undefined;
  const shown = set ? value : fallback;
  const id = `el-${prop}`;
  let input;
  if (COLOR_PROPS.has(prop)) {
    input = <input id={id} type="color" className="el-color" value={shown || "#FFFFFF"} onChange={(e) => onChange(e.target.value.toUpperCase())} />;
  } else if (prop === "size") {
    input = <SizeInput id={id} value={shown} onChange={onChange} />;
  } else {
    input = <input id={id} type="checkbox" checked={!!shown} onChange={(e) => onChange(e.target.checked)} />;
  }
  return (
    <>
      <label htmlFor={id}>{PROP_NAMES[prop]}</label>
      <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        {input}
        {set ? <button className="btn btn-quiet btn-sm" onClick={() => onChange(undefined)}>Reset</button>
          : <span className="muted">Default</span>}
      </span>
    </>
  );
}

/**
 * Settings for the element picked in the template designer: a part of the report (tpl.look) or every column of
 * one data type (tpl.types). onChange(prop, value) sets one setting; value undefined goes back to the style's own.
 */
export default function ElementEditor({ tpl, pick, onChange, onPick, sampleCols }) {
  const defaults = lookDefaults(tpl);

  if (pick.kind === "part") {
    const values = tpl.look?.[pick.name] || {};
    return (
      <div className="kv">
        {LOOK_PARTS[pick.name].props.map((prop) => (
          <Field key={prop} prop={prop} value={values[prop]} fallback={defaults[pick.name][prop]} onChange={(v) => onChange(prop, v)} />
        ))}
      </div>
    );
  }

  const values = tpl.types?.[pick.name] || {};
  // Formats that look the same as one above are left out, except one already chosen
  const displays = distinctDisplays({ type: pick.name, name: "" }, tpl);
  const allDisplays = DISPLAY_OPTIONS[pick.name];
  if (values.display && !displays.some(([id]) => id === values.display)) displays.push(allDisplays.find(([id]) => id === values.display));
  const examples = sampleCols.filter((c) => c.type === pick.name).map((c) => c.label).join(", ");
  return (
    <>
      <p className="muted" style={{ marginBottom: 10 }}>
        Applies to every {TYPE_NAMES[pick.name].toLowerCase()} column in reports that use this template{examples ? `, like ${examples} here` : ""}.
        A report can still change one column on its Template step.
      </p>
      <div className="kv">
        <label htmlFor="el-align">{PROP_NAMES.align}</label>
        <select id="el-align" className="sel" value={values.align || ""} onChange={(e) => onChange("align", e.target.value || undefined)}>
          <option value="">Default</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
        </select>
        <label htmlFor="el-display">{PROP_NAMES.display}</label>
        <select id="el-display" className="sel" value={values.display || "auto"} onChange={(e) => onChange("display", e.target.value === "auto" ? undefined : e.target.value)}>
          {displays.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <Field prop="color" value={values.color} fallback={defaults.rows.color} onChange={(v) => onChange("color", v)} />
        <Field prop="bold" value={values.bold} fallback={false} onChange={(v) => onChange("bold", v)} />
      </div>
      <button className="btn btn-quiet btn-sm" style={{ marginTop: 10 }} onClick={() => onPick({ kind: "part", name: "rows" })}>
        Text size, alternate colour and lines for all rows →
      </button>
    </>
  );
}
