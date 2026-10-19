import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import TemplatesPage from "./TemplatesPage.jsx";
import SideNav from "./components/SideNav.jsx";
import "./styles.css";

/** Pages outside the builder: "#/templates" the template designer. */
const PAGES = { "#/templates": "templates" };
const pageOf = (hash) => PAGES[hash] || null;
const TITLES = { templates: "Templates · LoanMart Insights" };

/**
 * "#/build/ssrs", "#/build/adhoc" or "#/build/charts" -> the report kind; null for the PAGES. Anything else is the
 * home page, the Charts builder.
 */
function kindOf(hash) {
  if (pageOf(hash)) return null;
  const m = hash.match(/^#\/build(?:\/(ssrs|adhoc|charts))?$/);
  return m ? m[1] || "ssrs" : "charts";
}

/**
 * "#/build/<kind>" shows the builder and the PAGES their own page, each to the right of the menu (SideNav).
 * The builder stays mounted so Back (or a visit to another page) doesn't lose work.
 */
function Root() {
  const [kind, setKind] = useState(kindOf(location.hash));
  const [page, setPage] = useState(pageOf(location.hash));
  const building = !!kind;
  const [lastKind, setLastKind] = useState(kind || "charts"); // the builder keeps its kind while another page shows
  useEffect(() => { if (kind) setLastKind(kind); }, [kind]);
  useEffect(() => {
    // Opening the builder (from any link or button) starts at the top of the page
    const onHash = () => {
      const k = kindOf(location.hash);
      if (k) window.scrollTo(0, 0);
      setKind(k);
      setPage(pageOf(location.hash));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { if (!building) document.title = TITLES[page] || "LoanMart Insights"; }, [building, page]);

  return (
    <div className="rb app-frame">
      <SideNav current={building ? `build/${kind}` : page} />
      <div className="app-page">
        {page === "templates" && <TemplatesPage />}
        <div hidden={!building}><App kind={kind || lastKind} /></div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
