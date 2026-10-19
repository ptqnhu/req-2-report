import { useState } from "react";
import Logo from "./Logo.jsx";
import { Icon } from "./Icon.jsx";

/** The main menu: [id, link, label, icon]. `id` matches what SideNav's `current` gets. */
const TOOLS = [
  ["build/charts", "#/build/charts", "Charts", "spark"],
  ["build/ssrs", "#/build/ssrs", "SSRS report", "file"],
  ["build/adhoc", "#/build/adhoc", "Export data", "database"],
  ["templates", "#/templates", "Templates", "layers"],
];

/**
 * The menu on the left of every page: the app's logo (click it to minimize or expand the menu), then the main
 * menu of report tools. `current` is the page on show ("build/<kind>" or "templates").
 */
export default function SideNav({ current }) {
  const here = (on) => (on ? { className: "side-link current", "aria-current": "page" } : { className: "side-link" });
  const [mini, setMini] = useState(() => loadFlag(MINI_KEY));
  const toggle = () => setMini((m) => { saveFlag(MINI_KEY, !m); return !m; });
  // Minimized, only the icons show, so each link's name is its tooltip
  const tip = (label) => (mini ? { title: label, "aria-label": label } : {});
  return (
    <aside className={`side-nav no-print${mini ? " mini" : ""}`}>
      <p className="side-brand">
        <button type="button" onClick={toggle} aria-expanded={!mini} title={mini ? "Expand the menu" : "Minimize the menu"}>
          <Logo size={22} /><span className="side-label">LoanMart Insights</span>
        </button>
      </p>
      <nav aria-label="Main menu">
        <p className="side-group">Main menu</p>
        {TOOLS.map(([id, href, label, icon]) => (
          <a key={id} href={href} {...here(current === id)} {...tip(label)}><Icon name={icon} /><span className="side-label">{label}</span></a>
        ))}
      </nav>
      <button type="button" className="side-link side-toggle" onClick={toggle} aria-expanded={!mini} {...tip("Expand the menu")}>
        <Icon name={mini ? "expand" : "collapse"} /><span className="side-label">Minimize</span>
      </button>
    </aside>
  );
}

/** Whether the menu is minimized, kept in this browser. */
const MINI_KEY = "report-builder.menuMinimized";
function loadFlag(key) {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function saveFlag(key, on) {
  try { localStorage.setItem(key, on ? "1" : "0"); } catch { /* storage unavailable */ }
}
