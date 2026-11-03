# Knowledge base

What the AI needs to know beyond the schema: what business terms mean, how the three databases link, which codes to filter on, and the traps. The schema itself lives in `server/schemas/<database>.txt`.

| File | What goes in it |
|---|---|
| `glossary.yaml` | Business terms ("funded", "DPD") → the exact SQL that defines them |
| `joins.yaml` | How APM, NLS and LoanMart tables link (all via loan number) |
| `gotchas.md` | Things an experienced analyst knows that the schema doesn't show |
| `tables/<database>/<table>.yaml` | One file per table that matters: what one row means, what each column means, and its allowed values |
| `golden/` | Verified request → SQL pairs, one file each, used to test accuracy |
| `ssrs-samples/` | Existing `.rdl` reports to learn from (read-only reference) |

A column with a fixed set of values (a dropdown in the application) lists them under the column, code first:

```yaml
columns:
  dealer_no: dealer that submitted the application   # a plain description is one line
  contract_location_cd:
    meaning: where the contract is, if set
    values:
      BR: branch
      HO: home office
```

When the values live in a code table (`loan_status_code`), that table gets its own file with the values listed there, and the column's description names the table.

Anything marked `TODO` still needs an answer. Fill in the definition, not just the name: "funded" is only useful with the SQL condition that makes a loan funded.
