import {
  PyLiveViewIconColorType,
  PyLiveViewHexColorType,
  PyLiveViewColorSelection,
  PyLiveViewHexColor,
  PyLiveViewIconColor
} from "./types";

const PyLiveViewIconColorMap = {
  blue: "blue",
  cornflower: "blue",
  red: "red",
  green: "green"
} as PyLiveViewIconColorType;

const PyLiveViewHexColorMap = {
  cornflower: "#6495ed",
  blue: "#00a1f1",
  green: "#7cbb00",
  red: "#ea2f36"
} as PyLiveViewHexColorType;

export function pyLiveViewIconColorProvider(color: PyLiveViewColorSelection): PyLiveViewIconColor {
  return PyLiveViewIconColorMap[color];
}

export function pyLiveViewTextColorProvider(color: PyLiveViewColorSelection): PyLiveViewHexColor {
  return PyLiveViewHexColorMap[color];
}
