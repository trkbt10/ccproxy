/**
 * Type definitions for the generic streaming markdown parser
 */

export type MarkdownElementType = 
  | 'text' 
  | 'code' 
  | 'header' 
  | 'list' 
  | 'quote' 
  | 'table' 
  | 'math' 
  | 'link'
  | 'emphasis'
  | 'strong'
  | 'strikethrough'
  | 'horizontal_rule'
  | 'custom';

export interface MarkdownElementMetadata {
  // Code blocks
  language?: string;
  // Headers and lists
  level?: number;
  // Lists
  ordered?: boolean;
  // Links
  url?: string;
  title?: string;
  // Custom metadata
  [key: string]: any;
}

export type MarkdownParseEvent = 
  | BeginEvent
  | DeltaEvent
  | EndEvent
  | AnnotationEvent;

export interface BeginEvent {
  type: 'begin';
  elementType: MarkdownElementType;
  elementId: string;
  metadata?: MarkdownElementMetadata;
}

export interface DeltaEvent {
  type: 'delta';
  elementId: string;
  content: string;
}

export interface EndEvent {
  type: 'end';
  elementId: string;
  finalContent: string;
}

export interface AnnotationEvent {
  type: 'annotation';
  elementId: string;
  annotation: LinkAnnotation | CustomAnnotation;
}

export interface LinkAnnotation {
  type: 'url_citation';
  url: string;
  title: string;
  start_index: number;
  end_index: number;
}

export interface CustomAnnotation {
  type: string;
  [key: string]: any;
}

export interface ParsingState {
  elementType: MarkdownElementType;
  elementId: string;
  startMarker: string;
  endMarker: string;
  buffer: string;
  metadata?: MarkdownElementMetadata;
  processed: boolean;
}

export interface ProcessedRange {
  start: number;
  end: number;
  elementId: string;
}

export interface UnprocessedSegment {
  start: number;
  end: number;
  text: string;
}

export interface MarkdownParserConfig {
  // Elements to parse (if not specified, all elements are parsed)
  enabledElements?: Set<MarkdownElementType>;
  
  // Custom element matchers
  customMatchers?: MarkdownElementMatcher[];
  
  // Parser behavior options
  preserveWhitespace?: boolean;
  splitParagraphs?: boolean;
  maxBufferSize?: number;
  
  // ID generation
  idPrefix?: string;
  idGenerator?: (type: MarkdownElementType) => string;
}

export interface MarkdownElementMatcher {
  type: MarkdownElementType | string;
  regex: RegExp;
  priority?: number;
  extractMetadata?: (match: RegExpMatchArray) => MarkdownElementMetadata;
  extractContent?: (match: RegExpMatchArray) => string;
}

export interface MarkdownParserPlugin {
  name: string;
  
  // Called before standard parsing
  preProcess?: (buffer: string) => string;
  
  // Called after standard parsing
  postProcess?: (events: MarkdownParseEvent[]) => MarkdownParseEvent[];
  
  // Custom element detection
  detectElements?: (buffer: string) => DetectedElement[];
}

export interface DetectedElement {
  type: MarkdownElementType | string;
  start: number;
  end: number;
  content: string;
  metadata?: MarkdownElementMetadata;
}