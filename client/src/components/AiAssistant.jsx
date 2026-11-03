import { useState } from "react";
import { api } from "../api.js";
import Sparkle from "./Sparkle.jsx";
import SqlCode from "./SqlCode.jsx";

/**
 * Describe the report in plain English and the AI writes the query into the editor, from the database's schema file.
 * Follow-up messages ("only last month", "add the customer's email") refine the query in the editor.
 * `onAnswer(answer)` gets each answer with its columns, so the next step needn't ask for them again.
 * `locked` (the columns are being read) stops new requests and "Use this query" changing the query meanwhile;
 * `onBusy(true|false)` tells the builder while an answer is coming, so it doesn't move on without it.
 */
export default function AiAssistant({ database, sql, setSql, chat, setChat, onAnswer, onBusy, locked = false }) {
  const [text, setText] = useState("");
  const [busy, setBusyState] = useState(false);
  const setBusy = (b) => { setBusyState(b); onBusy?.(b); };
  const [error, setError] = useState("");

  async function send() {
    const content = text.trim();
    if (!content || busy || locked) return;
    const messages = [...chat, { role: "user", content }];
    setChat(messages);
    setText("");
    setError("");
    setBusy(true);
    try {
      const answer = await api.aiQuery(database, messages, sql);
      setChat([...messages, { role: "assistant", ...answer }]);
      if (answer.sql) {
        onAnswer(answer);
        setSql(answer.sql);
      }
    } catch (e) {
      setChat(chat); // drop the unanswered message so the conversation stays in order
      setText(content);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel ai hero">
      <div className="ai-head">
        <label className="fld-label" htmlFor="ai-ask"><Sparkle />Ask AI to write the query</label>
        {chat.length > 0 && <button className="btn btn-quiet btn-sm" onClick={() => { setChat([]); setError(""); }} disabled={busy}>New conversation</button>}
      </div>

      {chat.length > 0 && (
        <div className="ai-chat">
          {chat.map((m, i) => m.role === "user" ? (
            <div key={i} className="ai-msg ai-user">{m.content}</div>
          ) : (
            <div key={i} className="ai-msg ai-answer">
              <span className="ai-tag"><Sparkle size={12} />AI-generated</span>
              {m.explanation && <p>{m.explanation}</p>}
              {m.sql && (
                <>
                  <pre className="ai-sql"><SqlCode sql={m.sql} /></pre>
                  {m.sql !== sql
                    ? <button className="btn btn-quiet btn-sm" onClick={() => { onAnswer(m); setSql(m.sql); }} disabled={busy || locked}>Use this query</button>
                    : <span className="muted">In the editor below.</span>}
                </>
              )}
            </div>
          ))}
          {busy && <div className="ai-msg ai-answer muted">Writing the query…</div>}
        </div>
      )}

      <textarea id="ai-ask" className="ta" rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }}
        placeholder={chat.length
          ? "Ask for a change, e.g. “only active loans” or “add the customer's phone number”"
          : "Describe the report, e.g. “Loans funded last month with the customer name, amount and branch”"} />
      <div className="panel-foot">
        <span className="muted">Only the {database} schema (table and column names) is sent to the AI. Check the query before you use it.</span>
        <button className="btn btn-primary btn-sm" onClick={send} disabled={busy || locked || !text.trim()}>{busy ? "Writing…" : "Send"}</button>
      </div>
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
