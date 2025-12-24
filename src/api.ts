import * as fs from "fs";
import { PyLiveViewDecorationsController, pyLiveViewDecorationStoreFactory } from "./decorations";
import { PyLiveViewDecorations, PyLiveViewParsedTraceResults, TracerParsedResultTuple, PyLiveViewTraceLineResult } from "./types";
import {
  commands,
  extensions,
  ExtensionContext,
  OutputChannel,
  TextDocumentChangeEvent,
  TextDocument,
  TextEditor,
  workspace,
  WorkspaceConfiguration,
} from "vscode";
import { PyLiveViewSessionController, pyLiveViewSessionStoreFactory } from "./sessions";
import { PythonTracer, pythonTracerFactory } from "./tracer";
import { getActiveEditor, makeTempFile } from "./helpers";
import { hotModeWarning } from "./hotWarning";
import { pyLiveViewOutputFactory, PyLiveViewOutputController } from "./output";
import { EventEmitter } from "events";
import { platform } from "os";
import { PyLiveViewError } from "./errors";

export function pyLiveViewStandardApiFactory(
  context: ExtensionContext,
  options: { output: OutputChannel }
): PyLiveViewAPI {
  return new PyLiveViewAPI(
    context,
    pyLiveViewOutputFactory(options.output),
    pyLiveViewDecorationStoreFactory(context),
    pyLiveViewSessionStoreFactory(),
    pythonTracerFactory(),
  );
}

export class PyLiveViewAPI {
  private _changedConfigFlag = false;
  private _endOfFile = 0;
  private _eventEmitter = new EventEmitter()

  constructor(
    public context: ExtensionContext,
    private _outputController: PyLiveViewOutputController,
    private _decorationController: PyLiveViewDecorationsController,
    private _sessionController: PyLiveViewSessionController,
    private _pythonTracer: PythonTracer
  ) { }

  public stepInPyLiveView = (): void => {
    this.logToOutput("[DEBUG] stepInPyLiveView called");
    this.decorations.setDefaultDecorationOptions("green", "red");
    this.sessions.createSessionFromEditor(this.activeEditor);
    this.updateLineCount(this.activeEditor.document.lineCount);
    this.logToOutput(`[DEBUG] Tracing file: ${this.activeEditor.document.fileName}`);
    this.traceAndSetDecorations(this.activeEditor.document.fileName);
    this.enterPyLiveViewContext();
  };

  public stopPyLiveView = (): void => {
    this.clearAllSessionsAndDecorations();
    this.exitPyLiveViewContext();
  };

  public traceAndSetDecorationsUsingTempFile = (document: TextDocument): void => {
    const tempFileObj = makeTempFile(document.fileName);
    fs.writeFileSync(tempFileObj.name, document.getText());
    this.traceAndSetDecorations(tempFileObj.name)
      .finally(tempFileObj.removeCallback);
  };

  public enterPyLiveViewContext = (): void => {
    commands.executeCommand("setContext", "inPyLiveViewContext", true);
  };

  public exitPyLiveViewContext = (): void => {
    commands.executeCommand("setContext", "inPyLiveViewContext", false);
  };

  public clearDecorations = (session: TextEditor): void => {
    const emptyDecorations = this.decorations.getEmptyDecorations();
    this.setDecorations(session, emptyDecorations);
  };

  public clearAllDecorations = (): void => {
    this.decorations.reInitDecorationCollection();
    for (const name of this.sessions.sessionNames) {
      const session = this.sessions.getSessionByFileName(name);
      this.clearDecorations(session);
    }
  };

  public clearAllSessionsAndDecorations = (): void => {
    this.clearAllDecorations();
    this.sessions.clearAllSessions();
  };

  public isDocumentPyLiveViewSession = (document: TextDocument): boolean => {
    return this.sessions.sessionIsActiveByDocument(document);
  };

  private prettyPrintPyLiveViewData(data: PyLiveViewParsedTraceResults): string[] {
    return (data ?? []).map(
      (l: PyLiveViewTraceLineResult) =>
        `LINENO: ${l.lineno} - VALUE: ${l.value}${l.error ? ", ERROR: " + l.error : ""}`
    );
  }

  private onPythonDataError = (data?: string): void => {
    // Always emit the event on error to unblock waiting tests
    const filepath = this.activeEditor?.document.uri.path || '';
    this._eventEmitter.emit('decorations-changed', filepath, this.decorations);

    // Always log errors for debugging
    this.logToOutput("[ERROR] Python tracer failed:", data ?? '<no message>');
  };

  private onPythonDataSuccess = ([data, stdout]: TracerParsedResultTuple): void => {
    this.logToOutput(`[DEBUG] onPythonDataSuccess called, data length: ${data?.length ?? 0}`);
    try {
      this.parsePythonDataAndSetDecorations(this.activeEditor, data);
      if (this.printLogging) {
        const output = this.prettyPrintPyLiveViewData(data);
        this._outputController.clear();

        // Parse absolute python path from stdout
        const pathMatch = stdout.match(/PYLIVEVIEW_PYTHON_EXECUTABLE: (.*?)[\r\n]/);
        // Use getPythonPath for fallback
        this.getPythonPath().then(pythonPath => {
          const pythonExec = pathMatch ? pathMatch[1].trim() : pythonPath;
          this.logToOutput(`Using Python Interpreter: ${pythonExec}\n`);

          // Remove the protocol line from stdout for cleaner logging
          const cleanStdout = stdout.replace(/PYLIVEVIEW_PYTHON_EXECUTABLE: .*?[\r\n]+/, '');

          this.logToOutput(cleanStdout ? cleanStdout + '\n\n' : '');
          this.logToOutput(`(PyLiveView Output): ${JSON.stringify(output, null, 4)}`);
          this.logToOutput(`\n\nTotal Line Count: ${data === null || data === void 0 ? void 0 : data.length}`);
        });
      }
    } finally {
      // Always emit the event, even if decoration processing fails
      const filepath = this.activeEditor.document.uri.path;
      this.emit('decorations-changed', filepath, this.decorations);
    }
  };

  private parsePythonDataAndSetDecorations = (
    session: TextEditor,
    data: PyLiveViewParsedTraceResults = []
  ) => {
    this.decorations.reInitDecorationCollection();
    this.decorations.prepareParsedPythonData(data);
    this.clearDecorations(session);
    this.setPreparedDecorations(session);
  };

  private setPreparedDecorations = (session: TextEditor): void => {
    this.decorations.setPreparedDecorationsForEditor(session);
    const decorations = this.decorations.getPreparedDecorations();
    this.setDecorations(session, decorations);
  };

  private setDecorations = (
    session: TextEditor,
    decorations: PyLiveViewDecorations
  ): void => {
    const decorationTypes = this.decorations.getDecorationTypes();
    if (decorationTypes) {
      session.setDecorations(decorationTypes.success, decorations.success);
      session.setDecorations(decorationTypes.error, decorations.error);
    }
  };

  private traceAndSetDecorations = (fileName: string): Promise<void> => {
    // Optionally set loading context so UI can show a loading icon
    const shouldShowLoading = this.config.get<boolean>('showLoadingIcon') === true;
    if (shouldShowLoading) commands.executeCommand('setContext', 'pyliveview.isLoading', true);
    return this.getPythonPath().then(pythonPath =>
      this.tracer.tracePythonScript({
        fileName,
        pythonPath,
        rootDir: this.rootExtensionDir,
      })
        .then((res) => {
          try { this.onPythonDataSuccess(res); }
          finally { if (shouldShowLoading) commands.executeCommand('setContext', 'pyliveview.isLoading', false); }
        })
        .catch((err) => {
          try { this.onPythonDataError(err?.toString?.() ?? String(err)); }
          finally { if (shouldShowLoading) commands.executeCommand('setContext', 'pyliveview.isLoading', false); }
        })
    );
  };

  private updateLineCount = (count: number): void => {
    this.oldLineCount = count;
  };

  public updateStickysHot = (event: TextDocumentChangeEvent): void => {
    if (this.isHot) {
      this.setPreparedDecorations(this.activeEditor);
      this.updateLineCount(event.document.lineCount);
    }
    this.activeEditor.document.save();
  };

  public setConfigUpdatedFlag(v: boolean): void {
    this._changedConfigFlag = v;
  }

  public displayHotModeWarning(): void {
    hotModeWarning();
  }

  public logToOutput = (...text: string[]): void => {
    this._outputController.log(text.join(" "));
  };

  public emit = (event: string, filepath: string, ...args: unknown[]): void => {
    this._eventEmitter.emit(event, filepath, ...args)
  }

  public on = (event: string, listener: (...args: unknown[]) => void): void => {
    this._eventEmitter.addListener(event, listener)
  }

  public get activeEditor(): TextEditor {
    return getActiveEditor();
  }

  public get activeEditorIsDirty(): boolean {
    return this.activeEditor.document.isDirty;
  }

  public get config(): WorkspaceConfiguration {
    return workspace.getConfiguration("pyliveview");
  }

  public get configChanged(): boolean {
    return this._changedConfigFlag;
  }

  public get decorations(): PyLiveViewDecorationsController {
    return this._decorationController;
  }

  public get isHot(): boolean | undefined {
    return this.config.get<boolean>("hot");
  }

  public get updateFrequency(): number | undefined {
    return this.config.get<number>("updateFrequency");
  }

  public get oldLineCount(): number {
    return this._endOfFile;
  }

  public set oldLineCount(v: number) {
    this._endOfFile = v;
  }

  public get printLogging(): boolean | undefined {
    return this.config.get<boolean>("printLoggingEnabled");
  }

  public get rootExtensionDir(): string {
    const res = extensions.getExtension("nabilab.pyliveview")?.extensionPath;
    if (res === undefined)
      throw new PyLiveViewError('no PyLiveView extension root dir)')
    return res
  }

  public get sessions(): PyLiveViewSessionController {
    return this._sessionController;
  }

  public get shouldLogErrors(): boolean {
    return this.config.get<boolean>("logErrors") === true;
  }

  public get shouldShowHotModeWarning(): boolean {
    return this.config.get<boolean>("disableHotModeWarning") !== true;
  }

  public get tracer(): PythonTracer {
    return this._pythonTracer;
  }

  private __platform = platform().trim()

  // Enhanced pythonPath getter: config > VSCode Python ext > fallback
  public async getPythonPath(): Promise<string> {
    // 1. User config
    const fromconfig = this.config.get<string>("pythonPath");
    if (fromconfig) return fromconfig;

    // 2. VS Code Python extension
    const pythonExt = extensions.getExtension('ms-python.python');
    if (pythonExt) {
      if (!pythonExt.isActive) {
        await pythonExt.activate();
      }
      // Accessing Python extension API for interpreter details (may be untyped)
      const execDetails = pythonExt.exports.settings?.getExecutionDetails?.(workspace.workspaceFolders?.[0]?.uri);
      if (execDetails?.execCommand?.length) {
        return execDetails.execCommand.join(' ');
      }
    }

    // 3. Fallback
    return this.__platform === "win32" ? 'python' : 'python3';
  }

  public getPythonMajorVersion = async (): Promise<string> => {
    const pythonPath = await this.getPythonPath();
    return await this.tracer.getPythonMajorVersion(pythonPath);
  }
}
