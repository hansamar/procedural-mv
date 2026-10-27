// Pinhole camera in metres, focal length in px. +x right, +y down, +z into the screen.
// Lenses: f 1100 ~ 24mm, 2000 ~ 40mm, 3000 ~ 60mm, 4500 ~ 90mm (on a 1920 px wide gate).

import { FORMAT } from "../scenes/style.js";
export const W = FORMAT.w;
export const H = FORMAT.h;

export function camera({ x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, f = 2000, cx = W / 2, cy = H / 2 } = {}) {
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  function view(P) {
    const px = P[0] - x;
    const py = P[1] - y;
    const pz = P[2] - z;
    const x1 = cyw * px - syw * pz;
    const z1 = syw * px + cyw * pz;
    const y2 = cp * py - sp * z1;
    const z2 = sp * py + cp * z1;
    return [x1, y2, z2];
  }
  function project(P) {
    const [vx, vy, vz] = view(P);
    const s = f / Math.max(1e-4, vz);
    const ux = vx * s;
    const uy = vy * s;
    return { x: cx + cr * ux - sr * uy, y: cy + sr * ux + cr * uy, s, z: vz };
  }
  return { view, project, f, x, y, z, yaw, pitch, roll };
}

// Affine-map one image triangle (s0,s1,s2 in image px) onto screen triangle (d0,d1,d2).
function tri(g, img, s0, s1, s2, d0, d1, d2) {
  // M * (s - s0) = d - d0, solved from the two triangle edges
  const u1x = s1[0] - s0[0];
  const u1y = s1[1] - s0[1];
  const u2x = s2[0] - s0[0];
  const u2y = s2[1] - s0[1];
  const det = u1x * u2y - u2x * u1y;
  if (Math.abs(det) < 1e-9) return;
  const v1x = d1.x - d0.x;
  const v1y = d1.y - d0.y;
  const v2x = d2.x - d0.x;
  const v2y = d2.y - d0.y;
  const a = (v1x * u2y - v2x * u1y) / det;
  const b = (v1y * u2y - v2y * u1y) / det;
  const c = (v2x * u1x - v1x * u2x) / det;
  const d = (v2y * u1x - v1y * u2x) / det;
  const e = d0.x - a * s0[0] - c * s0[1];
  const f = d0.y - b * s0[0] - d * s0[1];
  // grow the clip a hair to hide seams
  const mx = (d0.x + d1.x + d2.x) / 3;
  const my = (d0.y + d1.y + d2.y) / 3;
  const gr = (p) => [p.x + Math.sign(p.x - mx) * 0.6, p.y + Math.sign(p.y - my) * 0.6];
  g.save();
  g.beginPath();
  g.moveTo(...gr(d0));
  g.lineTo(...gr(d1));
  g.lineTo(...gr(d2));
  g.closePath();
  g.clip();
  g.transform(a, b, c, d, e, f);
  g.drawImage(img, 0, 0);
  g.restore();
}

/**
 * Draw an image on a 3D quad. corner(u,v) -> world point, u,v in [0,1].
 * crop = [sx, sy, sw, sh] in image px. n = subdivisions per side.
 */
export function drawQuad(g, cam, img, corner, { crop, n = 6, alpha = 1 } = {}) {
  const [sx, sy, sw, sh] = crop ?? [0, 0, img.width, img.height];
  const P = [];
  for (let j = 0; j <= n; j++) {
    const row = [];
    for (let i = 0; i <= n; i++) row.push(cam.project(corner(i / n, j / n)));
    P.push(row);
  }
  if (P.some((r) => r.some((p) => p.z < 0.05))) return P;
  g.save();
  g.globalAlpha *= alpha;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const s = (ii, jj) => [sx + (sw * ii) / n, sy + (sh * jj) / n];
      tri(g, img, s(i, j), s(i + 1, j), s(i, j + 1), P[j][i], P[j][i + 1], P[j + 1][i]);
      tri(g, img, s(i + 1, j), s(i + 1, j + 1), s(i, j + 1), P[j][i + 1], P[j + 1][i + 1], P[j + 1][i]);
    }
  }
  g.restore();
  return P;
}

/** Planar rectangle: centre C, half-extents (w,h), rotated by yaw about its vertical axis and roll in-plane. */
export function plane(C, w, h, { yaw = 0, pitch = 0, roll = 0 } = {}) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  return (u, v) => {
    let lx = (u * 2 - 1) * w;
    let ly = (v * 2 - 1) * h;
    const rx = cr * lx - sr * ly;
    const ry = sr * lx + cr * ly;
    // pitch tilts about x, then yaw about y
    const y1 = cp * ry;
    const z1 = sp * ry;
    return [C[0] + cy * rx + sy * z1, C[1] + y1, C[2] - sy * rx + cy * z1];
  };
}

/** Outline a projected grid returned by drawQuad (or a corner fn) as a closed path. */
export function quadPath(g, cam, corner) {
  const a = cam.project(corner(0, 0));
  const b = cam.project(corner(1, 0));
  const c = cam.project(corner(1, 1));
  const d = cam.project(corner(0, 1));
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.lineTo(c.x, c.y);
  g.lineTo(d.x, d.y);
  g.closePath();
  return [a, b, c, d];
}
