import type { OutputChannel } from "vscode";

export function pyLiveViewOutputFactory(channel: OutputChannel): PyLiveViewOutputController {
  return new PyLiveViewOutputController(channel);
}

export class PyLiveViewOutputController {
  constructor(private _channel: OutputChannel) { }

  public log(text: string): void {
    this._channel.append(text);
  }

  public clear(): void {
    this._channel.clear();
  }
}
