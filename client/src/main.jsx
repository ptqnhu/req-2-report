import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import TemplatesPage from "./TemplatesPage.jsx";
import SideNav from "./components/SideNav.jsx";
import "./styles.css";

/** Pages outside the builder: "#/templates" the template designer. Anything else is the SSRS report builder. */
const PAGES = { "#/templates": "templates" };
const pageOf = (hash) => PAGES[hash] || null;
const TITLES = { templates: "Templates · LoanMart Insights" };

/** The builder stays mounted while another page shows, so a visit to the template designer doesn't lose work. */
function Root() {
  const [page, setPage] = useState(pageOf(location.hash));
  useEffect(() => {
    const onHash = () => {
      window.scrollTo(0, 0);
      setPage(pageOf(location.hash));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { document.title = TITLES[page] || "LoanMart Insights"; }, [page]);

  return (
    <div className="rb app-frame">
      <SideNav current={page || "build"} />
      <div className="app-page">
        {page === "templates" && <TemplatesPage />}
        <div hidden={!!page}><App /></div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
