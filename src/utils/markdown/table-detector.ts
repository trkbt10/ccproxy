/**
 * Table detection for markdown parsing
 * Handles GitHub-flavored markdown tables
 */

export interface TableMatch {
  type: "table";
  startIndex: number;
  headerLine: string;
  separatorLine: string;
  alignments: Array<"left" | "center" | "right" | null>;
}

/**
 * Parse table separator line to extract column alignments
 * |:---|:---:|---:|---|
 */
export function parseTableSeparator(line: string): Array<"left" | "center" | "right" | null> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }
  
  // Remove leading and trailing pipes
  const content = trimmed.slice(1, -1);
  const columns = content.split("|").map(col => col.trim());
  
  const alignments: Array<"left" | "center" | "right" | null> = [];
  
  for (const col of columns) {
    // Check if it's a valid separator (only -, :, and spaces)
    if (!/^:?-+:?$/.test(col)) {
      return null;
    }
    
    const startsWithColon = col.startsWith(":");
    const endsWithColon = col.endsWith(":");
    
    if (startsWithColon && endsWithColon) {
      alignments.push("center");
    } else if (startsWithColon) {
      alignments.push("left");
    } else if (endsWithColon) {
      alignments.push("right");
    } else {
      alignments.push(null);
    }
  }
  
  return alignments.length > 0 ? alignments : null;
}

/**
 * Check if a line looks like a table row
 * | col1 | col2 | col3 |
 */
export function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|");
}

/**
 * Count columns in a table row
 */
export function countTableColumns(line: string): number {
  const trimmed = line.trim();
  if (!isTableRow(trimmed)) return 0;
  
  // Remove leading and trailing pipes
  const content = trimmed.slice(1, -1);
  return content.split("|").length;
}

/**
 * Detect a table starting at the current position
 * Tables require:
 * 1. Header row
 * 2. Separator row with same column count
 * 3. Optional body rows
 */
export function detectTable(text: string, startIndex: number = 0): TableMatch | null {
  const lines = text.slice(startIndex).split("\n");
  
  if (lines.length < 2) return null;
  
  const firstLine = lines[0];
  const secondLine = lines[1];
  
  // Check if first line is a table row
  if (!isTableRow(firstLine)) return null;
  
  // Check if second line is a separator
  const alignments = parseTableSeparator(secondLine);
  if (!alignments) return null;
  
  // Verify column counts match
  const headerColumns = countTableColumns(firstLine);
  if (headerColumns !== alignments.length) return null;
  
  return {
    type: "table",
    startIndex,
    headerLine: firstLine,
    separatorLine: secondLine,
    alignments,
  };
}

/**
 * Parse a table row into cells
 */
export function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!isTableRow(trimmed)) return [];
  
  // Remove leading and trailing pipes
  const content = trimmed.slice(1, -1);
  
  // Split by pipe and trim each cell
  return content.split("|").map(cell => cell.trim());
}

/**
 * Find the end of a table
 * Tables end when we encounter a non-table row
 */
export function findTableEnd(text: string, startIndex: number): number {
  const lines = text.slice(startIndex).split("\n");
  let lineIndex = 0;
  
  // Skip header and separator (we know they exist)
  if (lines.length >= 2) {
    lineIndex = 2;
  }
  
  // Find body rows
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (!line.trim() || !isTableRow(line)) {
      break;
    }
    lineIndex++;
  }
  
  // Calculate the end position
  let endPos = startIndex;
  for (let i = 0; i < lineIndex; i++) {
    endPos += lines[i].length + 1; // +1 for newline
  }
  
  return endPos - 1; // Remove last newline
}

/**
 * Parse a complete table into structured data
 */
export interface ParsedTable {
  headers: string[];
  alignments: Array<"left" | "center" | "right" | null>;
  rows: string[][];
}

export function parseTable(text: string): ParsedTable | null {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  
  const alignments = parseTableSeparator(lines[1]);
  if (!alignments) return null;
  
  const headers = parseTableRow(lines[0]);
  const rows: string[][] = [];
  
  for (let i = 2; i < lines.length; i++) {
    const cells = parseTableRow(lines[i]);
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  return { headers, alignments, rows };
}