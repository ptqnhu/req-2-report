import { family } from "@req-2-report/shared";

export default function TypeBadge({ type, showType = false }) {
  const fam = family(type);
  return <span className={`tb tb-${fam}`}>{showType ? type : fam}</span>;
}
