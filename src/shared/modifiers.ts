// 修饰键的真实按下状态：输入进程在每次按下时向 Windows 查询（GetAsyncKeyState），
// 用位掩码随 keydown 一起发给界面。长按 Alt 连按 Tab 时 Alt 不再自动重复，
// 仅靠钩子事件会误以为 Alt 已松开。
export const MOD_CTRL = 1,
  MOD_ALT = 2,
  MOD_WIN = 4,
  MOD_SHIFT = 8;

/** Windows virtual-key codes and their bit. */
export const MOD_VK: [vk: number, bit: number][] = [
  [0x11, MOD_CTRL],
  [0x12, MOD_ALT],
  [0x5b, MOD_WIN],
  [0x5c, MOD_WIN],
  [0x10, MOD_SHIFT],
];

/** uiohook key codes of the left and right modifiers. */
const MOD_KEYS = new Map([
  [29, MOD_CTRL],
  [3613, MOD_CTRL],
  [56, MOD_ALT],
  [3640, MOD_ALT],
  [3675, MOD_WIN],
  [3676, MOD_WIN],
  [42, MOD_SHIFT],
  [54, MOD_SHIFT],
]);

type Held = { has(code: number): boolean };

/**
 * A modifier counts as held when the hook saw it go down (and not yet up), or
 * when Windows says it is down right now. Without `mods` only the hook counts.
 */
export function withModifiers(held: Held, mods?: number): Held {
  if (mods === undefined) return held;
  return {
    has: (code) => held.has(code) || ((MOD_KEYS.get(code) ?? 0) & mods) !== 0,
  };
}
