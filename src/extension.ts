import * as vscode from "vscode";
import type {
  ExtensionContext,
  ConfigurationChangeEvent,
  OutputChannel,
  TextDocumentChangeEvent,
} from "vscode";

import { pyLiveViewStandardApiFactory, PyLiveViewAPI } from "./api";
import type { ActiveTextEditorChangeEventResult } from "./types";
import { registerCommand } from "./helpers";
import { clamp } from "./utils";

export function activate(context: ExtensionContext): PyLiveViewAPI {
  const output: OutputChannel = vscode.window.createOutputChannel("PyLiveView");
  const api: PyLiveViewAPI = pyLiveViewStandardApiFactory(context, { output });
  let updateTimeout: null | NodeJS.Timeout = null;

  initializePyLiveViewExtension();

  return api;

  function initializePyLiveViewExtension(): void {
    context.subscriptions.push(
      registerCommand("pyliveview.touchBarStart", startPyLiveView),
      registerCommand("pyliveview.touchBarStop", stopPyLiveView),
      registerCommand("pyliveview.runAtCurrentFile", startPyLiveView),
      registerCommand("pyliveview.stopRunning", stopPyLiveView)
    );

    const sharedOptions = [null, context.subscriptions];
    vscode.window.onDidChangeActiveTextEditor(changedActiveTextEditor, ...sharedOptions);
    vscode.workspace.onDidChangeTextDocument(changedTextDocument, ...sharedOptions);
    vscode.workspace.onDidChangeConfiguration(changedConfiguration, ...sharedOptions);
  }

  function startPyLiveView(): void {
    if (api.shouldShowHotModeWarning) {
      api.displayHotModeWarning();
    }

    api.stepInPyLiveView();

    if (api.activeEditorIsDirty)
      forceRefreshActiveDocument(api);
  }

  function stopPyLiveView(): void {
    api.stopPyLiveView();
    clearThrottleUpdateBuffer();
  }

  function changedActiveTextEditor(
    editor: ActiveTextEditorChangeEventResult
  ): void {
    if (editor) {
      if (api.sessions.sessionIsActiveByDocument(editor.document)) {
        if (api.configChanged) {
          vscode.window.showInformationMessage(
            "PyLiveView detected a change to the Hot Mode configuration and was shut off.. " +
            "Attempting to restart."
          );
          api.setConfigUpdatedFlag(false);
          stopPyLiveView();
          api.stepInPyLiveView();
        } else {
          api.enterPyLiveViewContext();
          forceRefreshActiveDocument(api);
        }
      } else {
        api.exitPyLiveViewContext();
      }
    }
  }

  function changedTextDocument(event: TextDocumentChangeEvent): void {
    if (api.isDocumentPyLiveViewSession(event.document)) {
      throttledHandleDidChangeTextDocument(event);
    }
  }

  function changedConfiguration(event: ConfigurationChangeEvent): void {
    if (
      event.affectsConfiguration("pyliveview.iconStyleInGutter") ||
      event.affectsConfiguration("pyliveview.updateFrequency") ||
      event.affectsConfiguration("pyliveview.maxLineLength")
    ) {
      api.setConfigUpdatedFlag(true);
    }
  }

  function throttledHandleDidChangeTextDocument(
    event: TextDocumentChangeEvent
  ): void {
    clearThrottleUpdateBuffer()
    updateTimeout = setTimeout(
      () => api.traceAndSetDecorationsUsingTempFile(event.document),
      clamp(100, 10000, api.updateFrequency ?? Infinity)
    );
  }

  function forceRefreshActiveDocument(api: PyLiveViewAPI) {
    throttledHandleDidChangeTextDocument({
      document: api.activeEditor.document
    } as TextDocumentChangeEvent);
  }

  function clearThrottleUpdateBuffer(): void {
    if (updateTimeout)
      clearTimeout(updateTimeout);
  }
}
