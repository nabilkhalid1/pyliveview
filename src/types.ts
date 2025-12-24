import type {
  DecorationOptions,
  Range,
  TextEditor,
  TextEditorDecorationType
} from "vscode";

export type PyLiveViewIcon = string;
export type PyLiveViewHexColor = string;
export type PyLiveViewColorSelection = "red" | "cornflower" | "blue" | "green";
export type PyLiveViewIconColor = "red" | "green" | "blue";

export type PyLiveViewHexColorType = { [P in PyLiveViewColorSelection]: PyLiveViewHexColor };
export type PyLiveViewIconColorType = { [P in PyLiveViewColorSelection]: PyLiveViewIconColor };

export interface PyLiveViewActiveSessionCollection {
  [id: string]: TextEditor;
}

export interface PyLiveViewGutterDecorationOptions {
  gutterIconColor: PyLiveViewColorSelection;
  leftMargin?: number;
}

export type PyLiveViewResponse = Record<string, string>

export interface PyLiveViewLineDecoration {
  data: string[];
  lineno: number;
  error: boolean;
  loop?: boolean;
  source?: string;
  pretty: string[];
  calls?: number;
}

export interface PyLiveViewDecorationMapping {
  [id: string]: PyLiveViewLineDecoration;
}

export interface PyLiveViewDecorationOptions {
  range: Range;
  text: string;
  hoverText: string;
  color: PyLiveViewColorSelection;
  language?: "python" | string;
}

export interface PyLiveViewStandardDecorationTypes {
  success: TextEditorDecorationType;
  error: TextEditorDecorationType;
}

export interface PyLiveViewDecorations {
  success: DecorationOptions[];
  error: DecorationOptions[];
}

export interface PyLiveViewTraceLineResult {
  lineno: number;
  value: string;
  kind: string;
  source: string;
  pretty: string;
  error: boolean;
  calls: number;
  _loop?: boolean;
}

export type PyLiveViewParsedTraceResults = PyLiveViewTraceLineResult[] | null | undefined;
export type TracerParsedResultTuple = [PyLiveViewParsedTraceResults, string]

export interface PyLiveViewTracerInterface {
  pythonPath: string;
  fileName: string;
  rootDir: string;
}

export type ActiveTextEditorChangeEventResult = TextEditor | undefined;
