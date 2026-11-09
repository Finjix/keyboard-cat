// Decorate authored lines once so snapshots keep a stable message and face.
const faces = [
  "(=^･ω･^=)",
  "(ฅ´ω`ฅ)",
  "(｡･ω･｡)ﾉ",
  "(๑•̀ㅂ•́)و✧",
  "(つ´ω`)つ",
  "(｡•̀ᴗ-)✧",
  "( ˘ω˘ )",
  "( •̀ ω •́ )✧",
  "(≧▽≦)",
  "(๑´ㅂ`๑)",
  "(=･ω･=)",
  "(ง •̀_•́)ง",
  "(｡･∀･)ﾉﾞ",
  "( ´ ▽ ` )ﾉ",
  "(๑•́ω•̀๑)",
  "(っ˘ω˘ς )",
  "( •̀ᴗ•́ )و",
  "(｡♥‿♥｡)",
  "(￣▽￣)ノ",
  "(ฅ•ω•ฅ)",
];

export const dialogueLines = (text: string): string[] =>
  text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => `${line} ${faces[index % faces.length]}`);
