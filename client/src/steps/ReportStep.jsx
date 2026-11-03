import ExportPanel from "../components/ExportPanel.jsx";
import ReportDocument from "../components/ReportDocument.jsx";
import SlicerBar from "../components/SlicerBar.jsx";

export default function ReportStep({ exp, setExp, rdlResult, previewProps, slicerProps }) {
  return (
    <>
      <ExportPanel exp={exp} onChange={(p) => setExp((e) => ({ ...e, ...p }))} result={rdlResult} />
      <ReportDocument {...previewProps} limit={10} filterBar={slicerProps.slicers.length > 0 && <SlicerBar {...slicerProps} />} />
    </>
  );
}
