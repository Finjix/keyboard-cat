// The generated sprite already contains perspective and case depth.
export const keyboardView = {
  left: 94,
  top: 630,
  width: 930,
  height: 310,
};

export function projectKeyboardPoint(x: number, y: number) {
  const v = keyboardView;
  return {
    x: v.left + x,
    y: v.top + y,
  };
}
