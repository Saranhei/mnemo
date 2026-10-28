import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('http://localhost:5174/');
const res = await p.evaluate(async (relax) => {
  const { compareStroke, estimateTransform } = await import('./js/core/strokes.js');
  const { loadStrokes, samplePath } = await import('./js/services/strokeData.js');
  const chars = [...'一二三四五六七八九十百千万円時日本人月火水木金土曜上下中半山川元気天私今田女男見行食飲東西南北口出右左分先生大学外国京子小会社父母高校毎語文帰入員新聞作仕事電車休言読思次何午後前名白雨書友間家話少古知来住正年売買町長道雪立自夜朝持手紙好近明病院映画歌市所勉強有旅昔々神早起牛使働連別度赤青色'];
  let rnd = 3; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const hand = (pts, o) => { const c = Math.cos(o.rot), s = Math.sin(o.rot); let w = 0;
    return pts.map((q) => { w += (rand() - .5) * o.wob; const x = q.x - 54, y = q.y - 54;
      return { x: 54 + o.sc * o.sx * (c * x - s * y) + o.dx + w * .4 + (rand() - .5) * o.jit, y: 54 + o.sc * (s * x + c * y) + o.dy + w * .4 + (rand() - .5) * o.jit }; }); };
  const out = {};
  for (const [name, o] of Object.entries({ normal: { sc: .8, sx: 1, rot: .05, dx: 4, dy: 3, wob: 1, jit: 2, per: .12 }, desprolijo: { sc: .7, sx: 1.15, rot: .1, dx: 10, dy: -8, wob: 1.6, jit: 3, per: .25 } })) {
    let strokes = 0, retries = 0, stuck = 0, stuckChars = new Set();
    for (const ch of chars) {
      const d = await loadStrokes(ch); if (!d) continue;
      const refs = d.map((x) => samplePath(x)); const accepted = [];
      for (let i = 0; i < refs.length; i++) {
        strokes++; let misses = 0, ok = false;
        while (!ok && misses < 6) {
          const own = { ...o, sc: o.sc * (1 + (rand() - .5) * o.per), dx: o.dx + (rand() - .5) * o.per * 40, dy: o.dy + (rand() - .5) * o.per * 40, rot: o.rot + (rand() - .5) * o.per };
          const user = hand(refs[i], own);
          const t = accepted.length ? estimateTransform(accepted) : null;
          let r = compareStroke(user, refs[i], { transform: t, later: refs.slice(i + 1) });
          if (relax && !r.ok && misses >= 2) {
            const a = compareStroke(user, refs[i], { transform: null, leniency: 1.4 });
            const bb = t ? compareStroke(user, refs[i], { transform: t, leniency: 1.4 }) : a;
            if (a.ok || bb.ok) r = { ok: true };
          }
          if (r.ok) { ok = true; accepted.push({ user, ref: refs[i] }); } else misses++;
        }
        retries += misses; if (!ok) { stuck++; stuckChars.add(ch); accepted.push({ user: hand(refs[i], o), ref: refs[i] }); }
      }
    }
    out[name] = { strokes, retriesPerStroke: (retries / strokes).toFixed(3), stuckStrokes: stuck, stuckChars: [...stuckChars].join('') };
  }
  return out;
}, process.argv[2] === 'relax');
console.log(JSON.stringify(res)); await b.close();
