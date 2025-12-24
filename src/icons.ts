import type { ExtensionContext } from "vscode";
import type { PyLiveViewColorSelection, PyLiveViewIcon } from "./types";
import { pyLiveViewIconColorProvider } from "./colors";

export function pyLiveViewIconProvider(
  context: ExtensionContext,
  color: PyLiveViewColorSelection,
  useGutterIcons: boolean
): PyLiveViewIcon {
  const iconColor = pyLiveViewIconColorProvider(color);
  return context
    .asAbsolutePath(`media\\pyliveview${useGutterIcons ? "-gutterIcon" : ""}-${iconColor}.png`)
    .replace(/\\/g, "/");
}
