// Stable color per species name, shared by the 3D scene and the overlay.
export function fishHue(name = "") {
  let h = 7;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

// "ns-flussbarsch" -> "Flussbarsch"
export const prettyName = (id = "") => {
  const s = id.replace(/^[a-z]{1,4}-/, "").replace(/[-_]+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const fishColor =(name) => `hsl(${fishHue(name)}, 62%, 56%)`;

const RARITY = [
  [/myth|göttl/i, "#ff6bd6"],
  [/legend/i, "#ffb020"],
  [/epi[cs]/i, "#b07cff"],
  [/rare|selten/i, "#4fa8ff"],
  [/uncommon|ungewöhnl/i, "#5fd38a"],
];
export const rarityColor = (r) => (r && RARITY.find(([re]) => re.test(r))?.[1]) || "rgba(255,255,255,.55)";
