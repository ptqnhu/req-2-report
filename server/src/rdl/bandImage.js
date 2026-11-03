import { deflateSync } from "node:zlib";
import { BRAND, BAND_LINES_PATHS, BAND_LINES_SIZE, BAND_LINES_RIGHT, BAND_LINES_STROKE } from "@req-2-report/shared";

// The LoanMart header band's background for the .rdl: the green gradient with the "LM" line art drawn in, as a PNG
// made at the band's exact size. SSRS's web viewer moves report items that overlap, so the lines can't be an image
// behind the text; as the band's background they render the same in the viewer, PDF and print.

/** Turns the path data (only M, H, V and circular A commands) into line segments and arcs. */
function parsePaths(paths) {
  const shapes = [];
  for (const d of paths) {
    const t = d.match(/[MHVA]|-?\d*\.?\d+/g);
    let i = 0, x = 0, y = 0, cmd = "";
    const num = () => parseFloat(t[i++]);
    while (i < t.length) {
      if (/[MHVA]/.test(t[i])) cmd = t[i++];
      if (cmd === "M") { x = num(); y = num(); continue; }
      if (cmd === "H" || cmd === "V") {
        const nx = cmd === "H" ? num() : x, ny = cmd === "V" ? num() : y;
        shapes.push({ line: [x, y, nx, ny] });
        x = nx; y = ny;
        continue;
      }
      // A r r rotation large-arc sweep x y (circles only)
      const r = num(); num(); num(); const large = num(); const sweep = num(); const nx = num(), ny = num();
      const mx = (x + nx) / 2, my = (y + ny) / 2, dx = nx - x, dy = ny - y, half = Math.hypot(dx, dy) / 2;
      const h = Math.sqrt(Math.max(0, r * r - half * half)), sign = large === sweep ? -1 : 1;
      const cx = mx + sign * h * (-dy / (2 * half)), cy = my + sign * h * (dx / (2 * half));
      shapes.push({ arc: { cx, cy, r, a0: Math.atan2(y - cy, x - cx), a1: Math.atan2(ny - cy, nx - cx), sweep: !!sweep, ends: [x, y, nx, ny] } });
      x = nx; y = ny;
    }
  }
  return shapes;
}

const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;

/** Distance from (px, py) to a shape, in drawing units. */
function distance(s, px, py) {
  if (s.line) {
    const [x0, y0, x1, y1] = s.line, vx = x1 - x0, vy = y1 - y0, len = vx * vx + vy * vy;
    const k = len ? Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / len)) : 0;
    return Math.hypot(px - (x0 + k * vx), py - (y0 + k * vy));
  }
  const { cx, cy, r, a0, a1, sweep, ends } = s.arc;
  const a = Math.atan2(py - cy, px - cx);
  // sweep = clockwise on screen (increasing angle with y pointing down)
  const span = sweep ? norm(a1 - a0) : norm(a0 - a1), at = sweep ? norm(a - a0) : norm(a0 - a);
  if (at <= span) return Math.abs(Math.hypot(px - cx, py - cy) - r);
  return Math.min(Math.hypot(px - ends[0], py - ends[1]), Math.hypot(px - ends[2], py - ends[3]));
}

const SHAPES = parsePaths(BAND_LINES_PATHS);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * The band background as a base64 PNG: widthIn x heightIn inches at dpi, the gradient from BRAND.green to
 * BRAND.greenDeep, and the line art as tall as the band with its right edge at BAND_LINES_RIGHT of the width.
 * SSRS draws background images at 96 pixels per inch (it ignores the PNG's own resolution), so it is made at 96
 * to come out at exactly the band's size.
 */
export function bandBackgroundPng(widthIn, heightIn, dpi = 96, color = null) {
  const W = Math.max(1, Math.round(widthIn * dpi)), H = Math.max(1, Math.round(heightIn * dpi));
  const k = BAND_LINES_SIZE.h / H; // drawing units per pixel
  const artLeft = W * BAND_LINES_RIGHT - BAND_LINES_SIZE.w / k; // in pixels
  const half = BAND_LINES_STROKE.width / 2;
  // A template's own band colour (tpl.look.band.bg) fills the band evenly; otherwise the brand gradient
  const [g0, g1, ink] = [rgb(color || BRAND.green), rgb(color || BRAND.greenDeep), rgb(BAND_LINES_STROKE.color)];

  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    raw[row] = 0; // no filter
    const uy = (y + 0.5) * k;
    for (let x = 0; x < W; x++) {
      const t = W > 1 ? x / (W - 1) : 0;
      let c = [0, 1, 2].map((j) => g0[j] + (g1[j] - g0[j]) * t);
      const ux = (x + 0.5 - artLeft) * k;
      if (ux > -4 && ux < BAND_LINES_SIZE.w + 4) {
        let d = Infinity;
        for (const s of SHAPES) d = Math.min(d, distance(s, ux, uy));
        const cover = Math.max(0, Math.min(1, (half - d) / k + 0.5)); // anti-aliased edge one pixel wide
        if (cover > 0) { const a = cover * BAND_LINES_STROKE.opacity; c = c.map((v, j) => v + (ink[j] - v) * a); }
      }
      raw[row + 1 + x * 3] = Math.round(c[0]);
      raw[row + 2 + x * 3] = Math.round(c[1]);
      raw[row + 3 + x * 3] = Math.round(c[2]);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const phys = Buffer.alloc(9);
  const ppm = Math.round(dpi / 0.0254);
  phys.writeUInt32BE(ppm, 0); phys.writeUInt32BE(ppm, 4); phys[8] = 1; // pixels per metre
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("pHYs", phys), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}
