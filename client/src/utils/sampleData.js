import { coerce } from "@req-2-report/shared";

// A small made-up loan dataset for designing templates without a database.
// It has one column of every type, so each format and alignment shows up.

export const SAMPLE_COLUMNS = [
  { key: "s1", name: "LoanID", type: "Integer" },
  { key: "s2", name: "CustomerName", type: "Text" },
  { key: "s3", name: "Branch", type: "Text" },
  { key: "s4", name: "FundedDate", type: "Date" },
  { key: "s5", name: "LoanAmount", type: "Currency" },
  { key: "s6", name: "InterestRate", type: "Percentage" },
  { key: "s7", name: "TermMonths", type: "Integer" },
  { key: "s8", name: "LastPayment", type: "DateTime" },
  { key: "s9", name: "IsActive", type: "Boolean" },
].map((c) => ({ ...c, selected: true }));

const ROWS = [
  [100231, "Maria Gonzalez", "Glendale", "2026-01-05", 4500, 0.1899, 24, "2026-03-02T10:14", true],
  [100232, "James Carter", "Anaheim", "2026-01-07", 2800, 0.2149, 18, "2026-03-01T16:40", true],
  [100233, "Linh Tran", "Riverside", "2026-01-12", 6200, 0.1675, 36, "2026-02-27T09:05", true],
  [100234, "Robert Miller", "Glendale", "2026-01-15", 1500, 0.2399, 12, "2026-01-30T13:22", false],
  [100235, "Aisha Khan", "San Diego", "2026-01-19", 3900, 0.1950, 24, "2026-03-03T11:48", true],
  [100236, "David Kim", "Anaheim", "2026-01-22", 7500, 0.1525, 48, "2026-03-04T08:31", true],
  [100237, "Sofia Rossi", "Riverside", "2026-01-26", 2200, 0.2275, 18, "2026-02-20T15:10", false],
  [100238, "Michael Brown", "San Diego", "2026-02-02", 5100, 0.1799, 30, "2026-03-05T12:00", true],
  [100239, "Emily Nguyen", "Glendale", "2026-02-06", 3300, 0.2025, 24, "2026-03-02T17:26", true],
  [100240, "Carlos Ramirez", "Anaheim", "2026-02-11", 4800, 0.1875, 36, "2026-03-06T09:44", true],
  [100241, "Hannah Lee", "Riverside", "2026-02-16", 2600, 0.2199, 18, "2026-02-28T14:03", true],
  [100242, "Daniel Wilson", "San Diego", "2026-02-20", 6900, 0.1599, 48, "2026-03-06T10:57", true],
];

/** Typed rows keyed by column key, the same shape the live preview uses. */
export const SAMPLE_ROWS = ROWS.map((r) => Object.fromEntries(SAMPLE_COLUMNS.map((c, i) => [c.key, coerce(r[i], c.type)])));
