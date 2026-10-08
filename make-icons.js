/* ================================================================
   随手记图标生成器 — 纯 Node 实现（无第三方依赖）
   运行: node make-icons.js
   生成: icon-192.png, icon-512.png
   ================================================================ */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 图形判定 ---------- */
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
};
const inTriangle = (px, py, ax, ay, bx, by, cx, cy) => {
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
};
// 旋转坐标系下的矩形判定（围绕 center 旋转 angle 弧度）
const inRotRect = (px, py, cx, cy, x0, y0, x1, y1, angle) => {
  const dx = px - cx, dy = py - cy;
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
  return lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1;
};
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

/* ---------- 绘制图标（512 坐标系，按比例缩放） ---------- */
function drawIcon(size) {
  const S = 512, k = size / S;
  const s = (v) => v * k;
  const buf = Buffer.alloc(size * size * 4);
  const gTop = hex('#7C3AED'), gBot = hex('#EC4899');
  const white = hex('#FFFFFF'), fold = hex('#DDD6FE');
  const line1 = hex('#A78BFA'), line2 = hex('#C4B5FD'), dot = hex('#EC4899');
  const pencilBody = hex('#FBBF24'), pencilMid = hex('#F59E0B'), pencilTip = hex('#78350F');

  const layers = [
    // 便签纸
    (x, y) => inRoundRect(x, y, s(96), s(96), s(416), s(416), s(32)) ? white : null,
    // 折角
    (x, y) => inTriangle(x, y, s(352), s(96), s(416), s(96), s(416), s(160)) ? fold : null,
    // 文字行
    (x, y) => inRoundRect(x, y, s(144), s(200), s(360), s(220), s(10)) ? line1 : null,
    (x, y) => inRoundRect(x, y, s(144), s(256), s(360), s(276), s(10)) ? line2 : null,
    (x, y) => inRoundRect(x, y, s(144), s(312), s(284), s(332), s(10)) ? line2 : null,
    // 圆点
    (x, y) => ((x - s(152)) ** 2 + (y - s(348)) ** 2 <= (s(14)) ** 2) ? dot : null,
    // 铅笔（围绕中心旋转 -45°）
    (x, y) => inRotRect(x, y, s(316), s(320), s(-16), s(-4), s(60), s(22), -Math.PI / 4) ? pencilBody : null,
    (x, y) => inRotRect(x, y, s(316), s(320), s(60), s(-4), s(84), s(22), -Math.PI / 4) ? pencilMid : null,
    (x, y) => inRotRect(x, y, s(316), s(320), s(84), s(4), s(96), s(14), -Math.PI / 4) ? pencilTip : null,
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 背景渐变（沿对角线）
      const t = (x + y) / (2 * (size - 1));
      let r = Math.round(gTop[0] + (gBot[0] - gTop[0]) * t);
      let g = Math.round(gTop[1] + (gBot[1] - gTop[1]) * t);
      let b = Math.round(gTop[2] + (gBot[2] - gTop[2]) * t);
      for (const layer of layers) {
        const c = layer(x, y);
        if (c) { r = c[0]; g = c[1]; b = c[2]; break; }
      }
      const i = (y * size + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
  return encodePNG(size, size, buf);
}

const dir = __dirname;
for (const size of [192, 512]) {
  const file = path.join(dir, `icon-${size}.png`);
  fs.writeFileSync(file, drawIcon(size));
  console.log('✅ 已生成', file);
}
