import type { EntryType } from "../services/api";

/**
 * Defines which fields are relevant for each entry type.
 * Used in ReviewPanel (capture review) and EntryDetailPage (edit + view).
 *
 * primary   — always shown, required in review
 * secondary — shown if populated; shown in edit form
 * hidden    — not shown in review or edit (can still be stored if the AI fills them)
 */

export interface FieldSchema {
  key: string;
  label: string;
  /** Full width in the 2-col grid */
  wide?: boolean;
  /** Minimum rows for textarea */
  rows?: number;
  /** Show even if empty in the review form */
  alwaysShow?: boolean;
}

const ISSUE_FIELDS: FieldSchema[] = [
  { key: "summary",       label: "Summary",       wide: true,  rows: 3, alwaysShow: true },
  { key: "problem",       label: "Problem",        wide: true,  rows: 2, alwaysShow: true },
  { key: "rootCause",     label: "Root cause",                  rows: 2, alwaysShow: true },
  { key: "solution",      label: "Solution",       wide: true,  rows: 3, alwaysShow: true },
  { key: "prevention",    label: "Prevention",     wide: true,  rows: 2 },
  { key: "detailedContent", label: "Details",      wide: true,  rows: 2 },
];

const HOWTO_FIELDS: FieldSchema[] = [
  { key: "summary",         label: "Purpose / Overview", wide: true,  rows: 3, alwaysShow: true },
  { key: "solution",        label: "Steps",              wide: true,  rows: 4, alwaysShow: true },
  { key: "problem",         label: "When to use (trigger condition)", wide: true, rows: 2 },
  { key: "detailedContent", label: "Details & examples", wide: true,  rows: 2 },
];

const KNOWLEDGE_FIELDS: FieldSchema[] = [
  { key: "summary",         label: "Summary",              wide: true,  rows: 3, alwaysShow: true },
  { key: "detailedContent", label: "Details & examples",   wide: true,  rows: 4, alwaysShow: true },
  { key: "problem",         label: "Known failure modes",  wide: true,  rows: 2 },
  { key: "solution",        label: "Workaround / fix",     wide: false, rows: 2 },
];

const DECISION_FIELDS: FieldSchema[] = [
  { key: "summary",         label: "Decision summary",      wide: true,  rows: 3, alwaysShow: true },
  { key: "problem",         label: "Context / problem",     wide: true,  rows: 2, alwaysShow: true },
  { key: "solution",        label: "Decision taken",        wide: true,  rows: 2, alwaysShow: true },
  { key: "prevention",      label: "Trade-offs / caveats",  wide: true,  rows: 2 },
  { key: "detailedContent", label: "Background & rationale",wide: true,  rows: 3 },
];

const KNOWN_LIMITATION_FIELDS: FieldSchema[] = [
  { key: "summary",         label: "Limitation summary",    wide: true,  rows: 3, alwaysShow: true },
  { key: "problem",         label: "Impact",                wide: true,  rows: 2, alwaysShow: true },
  { key: "solution",        label: "Workaround",            wide: false, rows: 2 },
  { key: "prevention",      label: "Expected fix / ETA",    wide: false, rows: 2 },
  { key: "detailedContent", label: "Details",               wide: true,  rows: 2 },
];

// API documentation — maps nicely to the Knowledge shape
const API_DOC_FIELDS: FieldSchema[] = [
  { key: "summary",         label: "Purpose",                wide: true,  rows: 3, alwaysShow: true },
  { key: "detailedContent", label: "Endpoints / parameters / examples", wide: true, rows: 6, alwaysShow: true },
  { key: "problem",         label: "Error conditions / gotchas", wide: true, rows: 2 },
  { key: "solution",        label: "Authentication / prerequisites", wide: false, rows: 2 },
];

export function getFieldSchema(entryType: EntryType): FieldSchema[] {
  switch (entryType) {
    case "Issue":
    case "Troubleshooting":
      return ISSUE_FIELDS;
    case "HowTo":
    case "Workflow":
      return HOWTO_FIELDS;
    case "Decision":
      return DECISION_FIELDS;
    case "KnownLimitation":
      return KNOWN_LIMITATION_FIELDS;
    case "Knowledge":
    default:
      return KNOWLEDGE_FIELDS;
  }
}

/** Human-readable label for a raw field key, used in the detail view */
export const FIELD_LABELS: Record<string, string> = {
  summary:         "Summary",
  problem:         "Problem",
  rootCause:       "Root cause",
  solution:        "Solution",
  prevention:      "Prevention",
  detailedContent: "Details",
  affectedService: "Affected service",
  module:          "Module",
};
