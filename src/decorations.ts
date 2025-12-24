import {
  DecorationOptions,
  TextEditor,
  TextEditorDecorationType,
  window,
  ExtensionContext,
  Range,
  Position,
  workspace
} from "vscode";
import type {
  PyLiveViewColorSelection,
  PyLiveViewDecorationOptions,
  PyLiveViewDecorationMapping,
  PyLiveViewLineDecoration,
  PyLiveViewDecorations,
  PyLiveViewStandardDecorationTypes,
  PyLiveViewTraceLineResult,
  PyLiveViewParsedTraceResults,
} from "./types";
import { pyLiveViewTextColorProvider } from "./colors";
import { pyLiveViewIconProvider } from "./icons";
import { formatPyLiveViewResponseElement } from "./helpers";
import { clamp, stringEscape } from "./utils";
import { js as beautify } from "js-beautify";


export function pyLiveViewDecorationStoreFactory(
  context: ExtensionContext,
): PyLiveViewDecorationsController {
  return new PyLiveViewDecorationsController(context);
}

export class PyLiveViewDecorationsController {
  private _decorations: PyLiveViewDecorationMapping = {};
  private _decorationTypes: PyLiveViewStandardDecorationTypes | null = null;
  private _preparedDecorations: PyLiveViewDecorations | null = null;

  constructor(public context: ExtensionContext) { }

  public getDecorationTypes = (): PyLiveViewStandardDecorationTypes | undefined => {
    if (this._decorationTypes)
      return this._decorationTypes;
  };

  public getEmptyDecorations = (): PyLiveViewDecorations => {
    return { success: [], error: [] };
  };

  public getPreparedDecorations = (): PyLiveViewDecorations => {
    if (this._preparedDecorations) {
      return this._preparedDecorations;
    } else {
      return this.getEmptyDecorations();
    }
  };

  public prepareParsedPythonData = (data: PyLiveViewParsedTraceResults): void => {
    for (const line of data ?? []) {
      this.setDecorationAtLine(line);
    }
  };

  public reInitDecorationCollection = (): void => {
    this._decorations = {};
  };

  public setDefaultDecorationOptions = (
    successColor: PyLiveViewColorSelection,
    errorColor: PyLiveViewColorSelection
  ): void => {
    this._decorationTypes = {
      success: this.createGutterDecorations(successColor),
      error: this.createGutterDecorations(errorColor),
    };
  };

  public setPreparedDecorationsForEditor = (editor: TextEditor): void => {
    const decorations: DecorationOptions[] = [];
    const errorDecorations: DecorationOptions[] = [];

    Object.keys(this._decorations).forEach(key => {
      const lineNo = parseInt(key, 10);
      const lineIndex = lineNo - 1;
      const decorationData = this.getDecorationAtLine(lineNo);

      if (!decorationData.data || editor.document.lineCount < lineNo) {
        return;
      }

      const textLine = editor.document.lineAt(lineIndex);
      const source = textLine.text;
      const decoRange = new Range(
        new Position(lineIndex, textLine.firstNonWhitespaceCharacterIndex),
        new Position(lineIndex, textLine.text.indexOf(source) + source.length)
      );

      const decoration = this.createPyLiveViewDecorationOptions({
        range: decoRange,
        text: decorationData.data.join(" => "), // This seperator should be adjustable from the config
        hoverText: decorationData.pretty.join("\n"),
        color: decorationData.error ? "red" : "cornflower"
      });

      if (decorationData.error)
        errorDecorations.push(decoration)
      else
        decorations.push(decoration)
    });

    this._preparedDecorations = {
      success: decorations,
      error: errorDecorations
    };
  };

  public get hasDecorations(): boolean {
    return Object.keys(this._decorations).length > 0;
  }


  private createPyLiveViewDecorationOptions = (
    options: PyLiveViewDecorationOptions
  ): DecorationOptions => {
    const truncLength = workspace
      .getConfiguration("pyliveview")
      .get<number>("maxLineLength") ?? 100;
    const textLength = options.text.length;
    const ellipsis = textLength > truncLength ? " ..." : "";
    return {
      range: options.range,
      hoverMessage: {
        language: options.language || "python",
        value: options.hoverText
      },
      renderOptions: {
        after: {
          contentText:
            options.text.slice(0, clamp(1, 1000, truncLength)) + ellipsis,
          fontWeight: "normal",
          fontStyle: "normal",
          color: pyLiveViewTextColorProvider(options.color)
        }
      }
    };
  };

  private createGutterDecorations = (
    gutterIconColor: PyLiveViewColorSelection,
    leftMargin = 3
  ): TextEditorDecorationType => {
    return window.createTextEditorDecorationType({
      after: {
        margin: `0 0 0 ${leftMargin}em`,
        textDecoration: "none"
      },
      isWholeLine: true,
      rangeBehavior: 1,
      overviewRulerLane: 1,
      overviewRulerColor: pyLiveViewTextColorProvider(gutterIconColor),
      gutterIconPath: pyLiveViewIconProvider(
        this.context,
        gutterIconColor,
        this.useGutterIcons
      ),
      gutterIconSize: "cover"
    });
  };

  private getDecorationAtLine = (lineNo: number): PyLiveViewLineDecoration => {
    return this._decorations[lineNo];
  };

  private getDecorationAtLineOrDefault = (lineNo: number): PyLiveViewLineDecoration => {
    return (this.getDecorationAtLine(lineNo) || { data: [], pretty: [] });
  };

  private setDecorationAtLine = (line: PyLiveViewTraceLineResult): void => {
    const lineNo = line.lineno;
    const { data, pretty } = this.getDecorationAtLineOrDefault(lineNo);
    const annotation = formatPyLiveViewResponseElement(line);

    this._decorations[lineNo] = {
      data: [...data, stringEscape(annotation)],
      lineno: lineNo,
      error: line.error ? true : false,
      loop: line["_loop"],
      pretty: [...pretty, beautify(line.value, {
        indent_size: 4,
        space_in_empty_paren: true
      })]
    };
  };

  private get useGutterIcons(): boolean {
    return workspace
      .getConfiguration("pyliveview")
      .get<boolean>("iconStyleInGutter") ?? false;
  }
}
