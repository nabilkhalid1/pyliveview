import type { TextEditor, TextDocument } from "vscode";
import type { PyLiveViewActiveSessionCollection } from "./types";

export function pyLiveViewSessionStoreFactory(): PyLiveViewSessionController {
  return new PyLiveViewSessionController();
}

export class PyLiveViewSessionController {
  private _sessions: PyLiveViewActiveSessionCollection = {};

  public clearAllSessions(): void {
    this._sessions = {};
  }

  public createSessionFromEditor(editor: TextEditor): void {
    this._sessions[editor.document.fileName] = editor;
  }

  public getSessionByFileName(fileName: string): TextEditor {
    return this._sessions[fileName];
  }

  public sessionIsActiveByDocument(document: TextDocument): boolean {
    return !!this._sessions[document.fileName];
  }

  public get sessionNames(): string[] {
    return Object.keys(this._sessions);
  }
}
