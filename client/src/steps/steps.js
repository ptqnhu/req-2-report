/**
 * Every step, by id. `next` is the label of the button that moves on.
 * `previewBar` shows the "sample rows" bar above the step once the query's columns are known.
 */
export const STEPS = {
  query: { title: "Query", heading: "Write your query", help: "Pick the database, then describe the report and AI writes the query from its schema, or write it yourself. The app never connects to the database; the report runs the query on the SSRS server.", next: "Read columns" },
  columns: { title: "Columns", heading: "Choose columns and how they show", help: "Every column the query returns is selected; clear the ones you don't want. Each type comes from the column's SQL Server type, worked out from the schema. Then pick how each column's values are shown.", previewBar: true, next: "Design template" },
  template: { title: "Template", heading: "Shape the template", help: "The style controls how the report looks. Pick a built-in style or one of your templates from the template designer. Changes here, including each column's heading and width, apply to this report only.", previewBar: true, next: "Add title & filters" },
  details: { title: "Title & filters", heading: "Name the report and filter it", help: "Give the report a title, then choose the filters readers can use in SSRS to slice the data themselves.", previewBar: true, next: "Build report" },
  report: { title: "Report & export", heading: "Review and export to SSRS", help: "Check the report, then download it as an .rdl file you can upload to your SSRS server. The current sort order is carried into the file.", previewBar: true, next: null },
};

export const FLOW = ["query", "columns", "template", "details", "report"];
