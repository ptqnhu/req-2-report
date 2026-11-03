import { useRef } from "react";
import SqlCode from "./SqlCode.jsx";

/**
 * A SQL text box with SSMS-style colours. A textarea can't colour its own text, so the coloured copy sits in a layer
 * behind it: the textarea's text is transparent (only the caret and selection show) and the layer scrolls with it.
 * Both share the .ta.code box, so every character lines up.
 */
export default function SqlEditor({ value, onChange, rows = 14, placeholder, id, readOnly = false }) {
  const layer = useRef(null);
  const sync = (e) => {
    if (!layer.current) return;
    layer.current.scrollTop = e.target.scrollTop;
    layer.current.scrollLeft = e.target.scrollLeft;
  };
  return (
    <div className="sql-editor">
      {/* The extra line keeps the layer as tall as the textarea when the query ends in a new line */}
      <pre className="ta code sql-layer" ref={layer} aria-hidden="true"><SqlCode sql={value} />{"\n "}</pre>
      <textarea id={id} className="ta code sql-input" rows={rows} spellCheck={false} wrap="off" value={value}
        onChange={onChange} onScroll={sync} placeholder={placeholder} readOnly={readOnly} />
    </div>
  );
}
