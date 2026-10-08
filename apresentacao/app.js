/* Apresentação 3D — Roteirização de entregas urbanas.
   Todas as animações usam dados reais exportados do código Python (dados.js). */
(() => {
'use strict';
const D = window.DADOS, T = window.THREE;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n, d = 1) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const easeOut = t => 1 - Math.pow(1 - t, 3);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const V3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

const COR = { ocioso: 0x2a4a63, fronteira: 0x2fd3e0, atual: 0xffd23f, expandido: 0x2f9e73, objetivo: 0xff6b6b,
  caminho: 0x5cff9d, ruim: 0xff5a36, unica: 0xffb84d, dupla: 0x5b86a6, bloqueio: 0xff5d5d, g: 0x3aa0ff, h: 0xff9f43, roxo: 0xb8a3ff };
const ESTADO = {
  ocioso:    { c: COR.ocioso,    e: .30, s: 1.00, gl: .10 },
  fronteira: { c: COR.fronteira, e: .55, s: 1.12, gl: .40 },
  atual:     { c: COR.atual,     e: .8, s: 1.38, gl: .65 },
  expandido: { c: COR.expandido, e: .45, s: 1.00, gl: .22 },
  objetivo:  { c: COR.objetivo,  e: .8, s: 1.38, gl: .65 },
  caminho:   { c: COR.caminho,   e: .7, s: 1.22, gl: .55 },
};

/* ---------- renderizador, luz e fundo ---------- */
const canvas = $('#c');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = T.NoToneMapping;
const scene = new T.Scene();
scene.fog = new T.FogExp2(0x06111b, 0.016);
const camera = new T.PerspectiveCamera(42, 1, 0.1, 300);
scene.add(new T.AmbientLight(0xffffff, 0.55));
const sol = new T.DirectionalLight(0xffffff, 0.75); sol.position.set(5, 12, 7); scene.add(sol);
const luzAz = new T.PointLight(0x2fd3e0, .8, 60); luzAz.position.set(-8, 6, 5); scene.add(luzAz);
const luzQt = new T.PointLight(0xffb84d, .6, 60); luzQt.position.set(8, 5, -4); scene.add(luzQt);

function texturaGlow() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.28, 'rgba(255,255,255,.42)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c);
}
const TEX_GLOW = texturaGlow();
function glowSprite(cor, tam, op) {
  const s = new T.Sprite(new T.SpriteMaterial({ map: TEX_GLOW, color: cor, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false }));
  s.scale.set(tam, tam, 1); return s;
}
// poeira no ar
const poeira = (() => {
  const n = 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 90; pos[i * 3 + 1] = Math.random() * 30 - 6; pos[i * 3 + 2] = (Math.random() - .5) * 90; }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
  const p = new T.Points(g, new T.PointsMaterial({ size: .09, color: 0x6fb8d6, transparent: true, opacity: .45, depthWrite: false, blending: T.AdditiveBlending }));
  scene.add(p); return p;
})();

/* ---------- grupos (cada um some/aparece com escala suave) ---------- */
const grupos = {};
function criarGrupo(nome) {
  const g = new T.Group(); g.userData = { alvo: 0, k: 0 }; g.visible = false; scene.add(g); grupos[nome] = g; return g;
}
['titulo', 'i1', 'corrida', 'barras', 'kbarras'].forEach(criarGrupo);

/* ---------- rótulos HTML presos a objetos 3D ---------- */
const rotulos = [];
const _tmp = V3();
function novoRotulo(txt, cls, obj, off, grupo, cond) {
  const el = document.createElement('div'); el.className = 'rot ' + cls; el.innerHTML = txt; $('#rotulos').appendChild(el);
  const r = { el, obj, off: V3(...(off || [0, 0, 0])), on: false, cls, grupo, cond, ultimo: '' };
  rotulos.push(r); return r;
}
function atualizarRotulos() {
  const w = innerWidth, h = innerHeight;
  for (const r of rotulos) {
    const vis = r.on && r.grupo.userData.k > 0.75 && (!r.cond || r.cond());
    if (!vis) { if (r.ultimo !== '0') { r.el.style.opacity = 0; r.ultimo = '0'; } continue; }
    r.obj.getWorldPosition(_tmp); _tmp.add(r.off); _tmp.project(camera);
    if (_tmp.z > 1) { r.el.style.opacity = 0; r.ultimo = '0'; continue; }
    r.el.style.transform = `translate(${(_tmp.x * .5 + .5) * w}px, ${(-_tmp.y * .5 + .5) * h}px) translate(-50%, -50%)`;
    if (r.ultimo !== '1') { r.el.style.opacity = 1; r.ultimo = '1'; }
  }
}
function mostrarRotulos(grupo, cats) { rotulos.forEach(r => { if (r.grupo === grupo) r.on = cats.includes(r.cls); }); }

/* ---------- utilidades de geometria ---------- */
const GEO_ESFERA = new T.SphereGeometry(.32, 32, 24);
function cilindro(p, q, raio, mat) {
  const dir = q.clone().sub(p), len = dir.length();
  const m = new T.Mesh(new T.CylinderGeometry(raio, raio, len, 10), mat);
  m.position.copy(p).addScaledVector(dir, .5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize()); return m;
}
function seta(curva, tFim, mat, tam) {
  const c = new T.Mesh(new T.ConeGeometry(tam * .55, tam, 14), mat);
  c.position.copy(curva.getPoint(tFim)); c.quaternion.setFromUnitVectors(V3(0, 1, 0), curva.getTangent(tFim).normalize()); return c;
}
const mat = (cor, em, ei = .6, extra = {}) => new T.MeshStandardMaterial({ color: cor, emissive: em ?? cor, emissiveIntensity: ei, roughness: .4, metalness: .1, ...extra });

/* =====================================================================
   GRAFO DA i1 (usado nos slides 2 a 8)
   ===================================================================== */
const g1 = (() => {
  const grupo = grupos.i1, I = D.i1, E = 1.75, RAIO_NO = .32;
  const nomes = Object.keys(I.cruzamentos), pos = {}, nos = {}, arcos = {}, barras = {};
  nomes.forEach(n => { const [x, y] = I.cruzamentos[n]; pos[n] = V3((x - 2) * E, 0, -y * E); });
  const chao = new T.GridHelper(22, 22, 0x17445f, 0x0d2a3c); chao.position.y = -.5; chao.material.transparent = true; chao.material.opacity = .55; grupo.add(chao);
  const bloq = new Set(I.bloqueadas.flatMap(([a, b]) => [a + '>' + b, b + '>' + a]));
  const matU = mat(COR.unica, 0x7a4a10, .35), matD = mat(COR.dupla, 0x17384f, .3), matB = mat(COR.bloqueio, COR.bloqueio, .6);
  const trafego = [], pulsos = [];
  const glowT = new T.SpriteMaterial({ map: TEX_GLOW, color: 0xbff6ff, transparent: true, opacity: .7, blending: T.AdditiveBlending, depthWrite: false });

  for (const r of I.ruas) {
    const a = pos[r.de], b = pos[r.para], reta = a.distanceTo(b) / E, curvo = r.distancia > 1.5 * reta;
    const fazer = (p, q) => curvo ? new T.QuadraticBezierCurve3(p.clone(), p.clone().add(q).multiplyScalar(.5).add(V3(0, 1.6, -2.4)), q.clone()) : new T.LineCurve3(p.clone(), q.clone());
    const cf = fazer(a, b), bloqueada = bloq.has(r.de + '>' + r.para), len = cf.getLength();
    arcos[r.de + '>' + r.para] = { curva: cf, de: r.de, para: r.para, bloqueada, len };
    if (!r.mao_unica) arcos[r.para + '>' + r.de] = { curva: fazer(b, a), de: r.para, para: r.de, bloqueada, len };
    const tam = r.mao_unica ? .3 : .22, tFim = 1 - (RAIO_NO + tam * .35) / len;
    if (bloqueada) {
      for (let i = 0; i < 9; i++) { const t0 = i / 9 + .02, t1 = t0 + .5 / 9; grupo.add(cilindro(cf.getPoint(t0), cf.getPoint(t1), .04, matB)); }
      const meio = cf.getPoint(.5), xa = new T.Mesh(new T.BoxGeometry(.7, .07, .07), matB), xb = xa.clone();
      xa.position.copy(meio).add(V3(0, .15, 0)); xb.position.copy(xa.position); xa.rotation.y = Math.PI / 4; xb.rotation.y = -Math.PI / 4; grupo.add(xa, xb);
      arcos[r.de + '>' + r.para].marcador = [xa, xb];
    } else {
      const m = r.mao_unica ? matU : matD;
      grupo.add(curvo ? new T.Mesh(new T.TubeGeometry(cf, 48, r.mao_unica ? .05 : .035, 8), m) : cilindro(a, b, r.mao_unica ? .05 : .035, m));
      grupo.add(seta(cf, tFim, m, tam));
      if (!r.mao_unica) grupo.add(seta(arcos[r.para + '>' + r.de].curva, tFim, m, tam));
      for (const k of Object.keys(arcos).filter(k => k === r.de + '>' + r.para || (!r.mao_unica && k === r.para + '>' + r.de))) {
        const s = new T.Sprite(glowT.clone()); s.scale.set(.24, .24, 1); grupo.add(s);
        trafego.push({ arco: arcos[k], s, t: Math.random(), v: .16 + Math.random() * .1 });
      }
    }
    novoRotulo(fmt(r.distancia, 1) + (bloqueada ? ' ✕' : ''), 'dist', grupo, [cf.getPoint(.5).x, cf.getPoint(.5).y + .36, cf.getPoint(.5).z], grupo);
  }

  nomes.forEach(n => {
    const m = new T.Mesh(GEO_ESFERA, mat(COR.ocioso, COR.ocioso, .3, { roughness: .32 }));
    m.position.copy(pos[n]); grupo.add(m);
    const gl = glowSprite(COR.ocioso, 2, .12); gl.position.copy(pos[n]); grupo.add(gl);
    const no = { nome: n, mesh: m, glow: gl, pos: pos[n], alvo: new T.Color(COR.ocioso), est: 'ocioso', esc: 1, gop: .12, ei: .3 };
    if (n === I.origem || n === I.destino) {
      const anel = new T.Mesh(new T.TorusGeometry(.5, .035, 10, 48), mat(n === I.origem ? 0xffffff : 0xffd23f, undefined, 1));
      anel.rotation.x = Math.PI / 2; anel.position.copy(pos[n]); grupo.add(anel); no.anel = anel;
    }
    nos[n] = no; novoRotulo(n, 'no', m, [0, 0, 0], grupo);
    // barra g/h para o A*
    const bg = new T.Mesh(new T.CylinderGeometry(.13, .13, 1, 18), mat(COR.g, COR.g, .6));
    const bh = new T.Mesh(new T.CylinderGeometry(.13, .13, 1, 18), mat(COR.h, COR.h, .5, { transparent: true, opacity: .75 }));
    const raiz = new T.Group(); raiz.position.copy(pos[n]).add(V3(0, .46, 0)); raiz.add(bg, bh);
    const topo = new T.Object3D(); raiz.add(topo); grupo.add(raiz);
    barras[n] = { raiz, bg, bh, topo, g: 0, h: 0, ag: 0, ah: 0, ativo: false, rot: novoRotulo('', 'f', topo, [0, .28, 0], grupo, () => barras[n].ativo) };
    raiz.visible = false;
  });

  // comparação h* × k·h no cruzamento A (slide 7)
  const S = .3, SC = .17, cmp = { real: new T.Mesh(new T.CylinderGeometry(.16, .16, 1, 18), mat(COR.caminho, COR.caminho, .6)), est: new T.Mesh(new T.CylinderGeometry(.16, .16, 1, 18), mat(COR.h, COR.h, .6)), topoR: new T.Object3D(), topoE: new T.Object3D(), h: 0, k: 1 };
  cmp.raiz = new T.Group(); cmp.raiz.position.copy(pos.A).add(V3(0, .5, -.02)); cmp.real.position.x = -.32; cmp.est.position.x = .32; cmp.topoR.position.x = -.32; cmp.topoE.position.x = .32;
  cmp.raiz.add(cmp.real, cmp.est, cmp.topoR, cmp.topoE); grupo.add(cmp.raiz); cmp.raiz.visible = false;
  cmp.rotR = novoRotulo('', 'g', cmp.topoR, [-.1, .35, 0], grupo, () => cmp.raiz.visible); cmp.rotE = novoRotulo('', 'f', cmp.topoE, [.1, .35, 0], grupo, () => cmp.raiz.visible);
  const hLabels = nomes.filter(n => n !== I.destino).map(n => ({ n, r: novoRotulo('', 'h', nos[n].mesh, [0, -.72, 0], grupo) }));
  const linhaH = cilindro(pos.A, pos.G, .012, mat(COR.roxo, COR.roxo, .8, { transparent: true, opacity: .6 })); linhaH.visible = false; grupo.add(linhaH);

  // caminho + caminhão
  let caminho = null, reveal = 0;
  const caminhao = new T.Group();
  const corpo = new T.Mesh(new T.BoxGeometry(.55, .22, .3), mat(0xffd23f, 0xffd23f, .35)), cab = new T.Mesh(new T.BoxGeometry(.22, .18, .28), mat(0xffffff, 0xaaaaaa, .2));
  cab.position.set(.3, -.02, 0); caminhao.add(corpo, cab, glowSprite(0xffd23f, 1.2, .5)); caminhao.visible = false; grupo.add(caminhao);

  const api = {
    grupo, nomes, pos, nos, arcos, barras, cmp, hLabels, linhaH, trafegoOn: false,
    setNo(n, est) { const no = nos[n], e = ESTADO[est]; no.est = est; no.alvo.setHex(e.c); no.escAlvo = e.s; no.gopAlvo = e.gl; no.eiAlvo = e.e; },
    resetNos() { nomes.forEach(n => api.setNo(n, 'ocioso')); },
    setBarra(n, g, h, tipo) {
      const b = barras[n]; if (g == null) { b.ativo = false; return; }
      b.ativo = true; b.ag = g; b.ah = h; b.raiz.visible = true;
      const txt = tipo === 'gulosa' ? `h=${fmt(h, 2)}` : tipo === 'ucs' ? `g=${fmt(g, 2)}` : `f=${fmt(g + h, 2)}`;
      b.rot.el.innerHTML = txt;
    },
    limparBarras() { nomes.forEach(n => api.setBarra(n, null)); },
    mostrarCaminho(lista, tipo) {
      api.limparCaminho();
      const pts = [];
      for (let i = 0; i < lista.length - 1; i++) { const c = arcos[lista[i] + '>' + lista[i + 1]].curva; for (let j = i ? 1 : 0; j <= 28; j++) pts.push(c.getPoint(j / 28).add(V3(0, .2, 0))); }
      const curva = new T.CatmullRomCurve3(pts), cor = tipo === 'ok' ? COR.caminho : COR.ruim;
      const m = new T.Mesh(new T.TubeGeometry(curva, 220, .085, 10), mat(cor, cor, .55, { transparent: true, opacity: .95 }));
      m.geometry.setDrawRange(0, 0); grupo.add(m); caminho = { m, curva }; reveal = 0;
    },
    limparCaminho() { if (caminho) { grupo.remove(caminho.m); caminho.m.geometry.dispose(); caminho = null; } caminhao.visible = false; },
    pulso(de, para, cor = 0xffd23f) {
      const a = arcos[de + '>' + para]; if (!a) return;
      const s = glowSprite(cor, .9, 1); grupo.add(s); pulsos.push({ s, a, t: 0 });
    },
    marcadorPisca(de, para) { const a = arcos[de + '>' + para]; if (a && a.marcador) a.pisca = 1.4; },
    comparar(k) {
      const h = D.i1.h.A; cmp.k = k; cmp.hAlvo = h; const real = 3.5, est = k * h, ruim = est > real + 1e-9;
      cmp.estAlvo = est; cmp.realAlvo = real;
      cmp.rotR.el.innerHTML = `h*(A) = ${fmt(real, 2)}`; cmp.rotE.el.innerHTML = `k·h(A) = ${fmt(est, 2)}`;
      cmp.est.material.color.setHex(ruim ? COR.objetivo : COR.h); cmp.est.material.emissive.setHex(ruim ? COR.objetivo : COR.h);
      hLabels.forEach(({ n, r }) => { r.el.innerHTML = `k·h = ${fmt(k * D.i1.h[n], 2)}`; });
    },
    mostrarComparacao(on) { cmp.raiz.visible = on; linhaH.visible = on; hLabels.forEach(({ r }) => { r.on = on; }); cmp.rotR.on = on; cmp.rotE.on = on; },
    update(dt, t) {
      for (const n of nomes) {
        const no = nos[n]; no.mesh.material.color.lerp(no.alvo, 1 - Math.exp(-dt * 9));
        no.mesh.material.emissive.copy(no.mesh.material.color);
        no.ei = damp(no.ei, no.eiAlvo ?? .3, 9, dt); no.mesh.material.emissiveIntensity = no.ei;
        no.esc = damp(no.esc, no.escAlvo ?? 1, 10, dt); no.mesh.scale.setScalar(no.esc);
        no.gop = damp(no.gop, no.gopAlvo ?? .12, 8, dt); no.glow.material.opacity = no.gop; no.glow.material.color.copy(no.mesh.material.color);
        no.glow.scale.setScalar(1.6 + no.esc * .7 + Math.sin(t * 3 + n.charCodeAt(0)) * .06 * (no.est !== 'ocioso'));
        if (no.anel) { no.anel.rotation.z += dt * .8; no.anel.scale.setScalar(1 + Math.sin(t * 2.2) * .04); }
        const b = barras[n]; b.g = damp(b.g, b.ativo ? b.ag : 0, 9, dt); b.h = damp(b.h, b.ativo ? b.ah : 0, 9, dt);
        const gh = Math.max(b.g * S, .001), hh = Math.max(b.h * S, .001);
        b.bg.scale.y = gh; b.bg.position.y = gh / 2; b.bh.scale.y = hh; b.bh.position.y = gh + hh / 2; b.topo.position.y = gh + hh;
        if (!b.ativo && b.g + b.h < .01) b.raiz.visible = false;
      }
      if (cmp.raiz.visible) {
        cmp.h = damp(cmp.h, cmp.realAlvo ?? 0, 8, dt); cmp.hk = damp(cmp.hk ?? 0, cmp.estAlvo ?? 0, 8, dt);
        const hr = Math.max(cmp.h * SC, .001), he = Math.max(cmp.hk * SC, .001);
        cmp.real.scale.y = hr; cmp.real.position.y = hr / 2; cmp.est.scale.y = he; cmp.est.position.y = he / 2; cmp.topoR.position.y = hr; cmp.topoE.position.y = he;
      }
      for (const p of trafego) {
        p.s.visible = api.trafegoOn && !p.arco.bloqueada; if (!p.s.visible) continue;
        p.t = (p.t + dt * p.v / (p.arco.len / 3)) % 1; p.s.position.copy(p.arco.curva.getPoint(p.t)).add(V3(0, .12, 0));
      }
      for (let i = pulsos.length - 1; i >= 0; i--) {
        const p = pulsos[i]; p.t += dt / .8; const u = easeOut(clamp(p.t, 0, 1));
        p.s.position.copy(p.a.curva.getPoint(u)).add(V3(0, .3, 0)); p.s.material.opacity = 1 - Math.max(0, p.t - .7) / .3;
        if (p.t >= 1) { grupo.remove(p.s); pulsos.splice(i, 1); }
      }
      for (const k in arcos) { const a = arcos[k]; if (a.pisca > 0) { a.pisca -= dt; const v = Math.sin(a.pisca * 16) > 0; a.marcador.forEach(m => { m.scale.setScalar(v ? 1.5 : 1); }); if (a.pisca <= 0) a.marcador.forEach(m => m.scale.setScalar(1)); } }
      if (caminho) {
        reveal = Math.min(1, reveal + dt / 1.4); const cnt = caminho.m.geometry.index.count;
        caminho.m.geometry.setDrawRange(0, Math.floor(cnt * easeOut(reveal) / 3) * 3);
        if (reveal >= 1) {
          caminhao.visible = true; const u = (t * .16) % 1;
          caminhao.position.copy(caminho.curva.getPointAt(u)).add(V3(0, .28, 0));
          caminhao.quaternion.setFromUnitVectors(V3(1, 0, 0), caminho.curva.getTangentAt(u).setY(0).normalize());
        }
      }
    },
  };
  return api;
})();

/* =====================================================================
   REDE DA i3 (título e conclusão): malha 3D pulsante
   ===================================================================== */
const rede = (() => {
  const g = grupos.titulo, I = D.i3, P = I.pos.map(([x, y]) => { const px = x / 100 - 9.5, pz = -(y / 100 - 9.5); return V3(px, Math.sin(px * .45) * Math.cos(pz * .4) * 1.2, pz); });
  const bloq = new Set(I.bloqueadas.map(([a, b]) => a + '>' + b));
  const pares = I.ruas.filter(([a, b]) => !bloq.has(a + '>' + b) && !bloq.has(b + '>' + a));
  const seg = new Float32Array(pares.length * 6);
  pares.forEach(([a, b], i) => { P[a].toArray(seg, i * 6); P[b].toArray(seg, i * 6 + 3); });
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(seg, 3));
  g.add(new T.LineSegments(geo, new T.LineBasicMaterial({ color: 0x3aa8c8, transparent: true, opacity: .42 })));
  const nosI = new T.InstancedMesh(new T.SphereGeometry(.13, 10, 8), mat(0x7fe6ee, 0x2fd3e0, .6), P.length), m4 = new T.Matrix4();
  P.forEach((p, i) => { m4.setPosition(p); nosI.setMatrixAt(i, m4); }); g.add(nosI);
  const pulsos = Array.from({ length: 46 }, () => {
    const s = glowSprite(Math.random() < .5 ? 0x2fd3e0 : 0xffb84d, .8, .95); g.add(s);
    return { s, i: Math.floor(Math.random() * pares.length), t: Math.random(), v: .35 + Math.random() * .5, d: Math.random() < .5 };
  });
  // caminho ótimo do A* (aparece na conclusão)
  const pts = I.corrida.a_estrela.caminho.map(i => P[i].clone().add(V3(0, .1, 0)));
  const tubo = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'catmullrom', .1), 260, .1, 8), mat(COR.caminho, COR.caminho, .6));
  tubo.visible = false; g.add(tubo); let rev = 0, mostrar = false;
  return {
    setCaminho(on) { mostrar = on; if (!on) { rev = 0; tubo.visible = false; } },
    update(dt) {
      for (const p of pulsos) {
        p.t += dt * p.v; if (p.t >= 1) { p.t = 0; p.i = Math.floor(Math.random() * pares.length); p.d = Math.random() < .5; }
        const [a, b] = pares[p.i], A = p.d ? P[a] : P[b], B = p.d ? P[b] : P[a];
        p.s.position.lerpVectors(A, B, p.t);
      }
      if (mostrar) { tubo.visible = true; rev = Math.min(1, rev + dt / 2.6); tubo.geometry.setDrawRange(0, Math.floor(tubo.geometry.index.count * easeOut(rev) / 3) * 3); }
    },
  };
})();

/* =====================================================================
   CORRIDA NA i3: 4 estratégias lado a lado, guiadas pelos rastros reais
   ===================================================================== */
const corrida = (() => {
  const g = grupos.corrida, I = D.i3, chaves = ['largura', 'custo_uniforme', 'a_estrela', 'a_estrela_k3'];
  const desloc = [[-11.5, -13.4], [11.5, -13.4], [-11.5, 13.4], [11.5, 13.4]];
  const P = I.pos.map(([x, y]) => V3(x / 100 - 9.5, 0, -(y / 100 - 9.5)));
  const bloq = new Set(I.bloqueadas.map(([a, b]) => a + '>' + b));
  const pares = I.ruas.filter(([a, b]) => !bloq.has(a + '>' + b) && !bloq.has(b + '>' + a));
  const seg = new Float32Array(pares.length * 6); pares.forEach(([a, b], i) => { P[a].toArray(seg, i * 6); P[b].toArray(seg, i * 6 + 3); });
  const qId = new T.Quaternion(), cIdle = new T.Color(0x1d3a50), cGer = new T.Color(0x2fd3e0), cQuente = new T.Color(0xffe27a), cFrio = new T.Color(0x2f9e73), cCam = new T.Color(0x5cff9d);
  const paineis = chaves.map((ch, k) => {
    const dados = I.corrida[ch], sub = new T.Group(); sub.position.set(desloc[k][0], 0, desloc[k][1]); g.add(sub);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(seg, 3));
    sub.add(new T.LineSegments(geo, new T.LineBasicMaterial({ color: 0x35759a, transparent: true, opacity: .4 })));
    const inst = new T.InstancedMesh(new T.SphereGeometry(.2, 10, 8), new T.MeshBasicMaterial({}), P.length);
    const m4 = new T.Matrix4(); P.forEach((p, i) => { m4.setPosition(p); inst.setMatrixAt(i, m4); inst.setColorAt(i, cIdle); }); sub.add(inst);
    const ger = new Int32Array(P.length).fill(1e9), exp = new Int32Array(P.length).fill(1e9), noCam = new Set(dados.caminho);
    ger[I.origem] = -1; dados.sai.forEach((s, j) => { exp[s] = j; dados.novos[j].forEach(n => { if (ger[n] > j) ger[n] = j; }); });
    const ancora = new T.Object3D(); ancora.position.set(0, 0, -11.4); sub.add(ancora);
    const rot = novoRotulo('', 'corrida', ancora, [0, 0, 0], g);
    return { ch, dados, sub, inst, ger, exp, noCam, rot, n: -1, total: dados.sai.length, tubo: null };
  });
  const api = {
    t: 0, vel: 46, pausa: false,
    reiniciar() { api.t = -14; paineis.forEach(p => { p.n = -2; if (p.tubo) { p.sub.remove(p.tubo); p.tubo = null; } }); },
    atualizarPainel(p) {
      const n = clamp(Math.floor(api.t), 0, p.total), fim = n >= p.total, cor = new T.Color(), m4 = new T.Matrix4(), s = new T.Vector3();
      for (let i = 0; i < P.length; i++) {
        let esc = 1;
        if (fim && p.noCam.has(i)) { cor.copy(cCam); esc = 1.7; }
        else if (p.exp[i] < n) { cor.lerpColors(cFrio, cQuente, clamp(1 - (n - p.exp[i]) / 55, 0, 1)); }
        else if (p.ger[i] < n) { cor.copy(cGer); esc = 1.15; }
        else cor.copy(cIdle);
        p.inst.setColorAt(i, cor); s.setScalar(esc); m4.compose(P[i], qId, s); p.inst.setMatrixAt(i, m4);
      }
      p.inst.instanceColor.needsUpdate = true; p.inst.instanceMatrix.needsUpdate = true;
      if (fim && !p.tubo) {
        const pts = p.dados.caminho.map(i => P[i].clone().add(V3(0, .15, 0)));
        p.tubo = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'catmullrom', .05), 200, .09, 8), mat(COR.caminho, COR.caminho, 1)); p.sub.add(p.tubo);
      }
      p.rot.el.innerHTML = `<b>${esc(p.dados.rotulo)}</b><small>${fim ? `✔ ${p.total} expandidos · custo ${fmt(p.dados.custo, 1)}` : `${n} / ${p.total} expandidos`}</small>`;
      p.n = n;
    },
    update(dt) {
      if (!api.pausa) api.t += dt * api.vel;
      for (const p of paineis) { const n = clamp(Math.floor(api.t), 0, p.total); if (n !== p.n) api.atualizarPainel(p); }
    },
  };
  api.reiniciar(); return api;
})();

/* =====================================================================
   GRÁFICOS 3D DE BARRAS (resultados e varredura de k)
   ===================================================================== */
const ESTR = [['Largura', 0x7aa2ff], ['Custo uniforme', 0xb28cff], ['A* (h)', 0x2fd3e0], ['A* (h×2)', 0xffd23f], ['A* (h×3)', 0xff9f43], ['Gulosa (h)', 0xff6b9d]];
function fazerBarra(g, x, largura, cor, cls) {
  const geo = new T.BoxGeometry(largura, 1, largura); geo.translate(0, .5, 0);
  const m = new T.Mesh(geo, mat(cor, cor, .18, { roughness: .35 })); m.position.x = x; g.add(m);
  const topo = new T.Object3D(); m.add(topo);
  const b = { m, topo, h: 0, alvo: 0, atraso: 0, rot: novoRotulo('', cls || 'valor', topo, [0, .0, 0], g) }; b.rot.el.style.transform = ''; return b;
}
const resultados = (() => {
  const g = grupos.barras, barras = [], instancias = ['i1_pequena', 'i2_media', 'i3_grande', 'i4_sem_solucao'], nomes = ['i1 · 7 cruzamentos', 'i2 · 36', 'i3 · 400', 'i4 · 100 (sem solução)'];
  const linha = (i, e) => D.tabela.find(r => r.instancia === i && r.estrategia === e);
  instancias.forEach((inst, gi) => {
    const x0 = (gi - 1.5) * 5.1;
    const base = new T.Mesh(new T.BoxGeometry(4.4, .08, 1.1), mat(0x17384f, 0x17384f, .4)); base.position.set(x0, -.04, 0); g.add(base);
    const anc = new T.Object3D(); anc.position.set(x0, -.05, 1.0); g.add(anc); novoRotulo(nomes[gi], 'grupo', anc, [0, -.35, 0], g);
    ESTR.forEach(([est, cor], ei) => {
      const b = fazerBarra(g, x0 + (ei - 2.5) * .74, .5, cor); b.inst = inst; b.est = est; b.atraso = (gi * 6 + ei) * .045; barras.push(b);
    });
  });
  const api = {
    modo: 0,
    aplicar(modo, reset) {
      api.modo = modo;
      barras.forEach(b => {
        const r = linha(b.inst, b.est), ot = linha(b.inst, 'Custo uniforme');
        if (modo === 0) { b.alvo = Math.log10(r.expandidos + 1) * 1.55; b.rot.el.innerHTML = r.expandidos; }
        else if (r.custo === '' || ot.custo === '') { b.alvo = 0; b.rot.el.innerHTML = '—'; }
        else { const pct = (r.custo / ot.custo - 1) * 100; b.alvo = pct < .001 ? .05 : Math.sqrt(pct) * .8 + .1; b.rot.el.innerHTML = pct < .001 ? 'ótimo' : '+' + fmt(pct, pct < 10 ? 1 : 0) + '%'; }
        if (reset) b.h = 0;
        b.rot.on = true;
      });
    },
    update(dt, t) { for (const b of barras) { if (b.atraso > 0) { b.atraso -= dt; continue; } b.h = damp(b.h, b.alvo, 6, dt); const h = Math.max(b.h, .001); b.m.scale.y = h; b.topo.position.y = h / Math.max(h, .001) * 0 + 0; b.topo.position.y = h * 1; b.rot.off.y = .3; } },
  };
  // a barra tem geometria unitária escalada: o topo é filho e herda a escala, então corrigimos a posição do topo
  barras.forEach(b => { b.m.remove(b.topo); g.add(b.topo); });
  api.update = (dt) => { for (const b of barras) { if (b.atraso > 0) { b.atraso -= dt; continue; } b.h = damp(b.h, b.alvo, 6, dt); const h = Math.max(b.h, .001); b.m.scale.y = h; b.topo.position.set(b.m.position.x, h, 0); b.rot.off.y = .3; } };
  return api;
})();

const kchart = (() => {
  const g = grupos.kbarras, ks = [1, 1.5, 2, 3, 5], barras = ks.map((k, i) => {
    const b = fazerBarra(g, (i - 2) * 1.9, 1.05, 0x46d39a); g.add(b.m); b.m.remove(b.topo); g.add(b.topo);
    const a = new T.Object3D(); a.position.set((i - 2) * 1.9, -.05, 1.1); g.add(a); b.k = k; b.rotK = novoRotulo(`k = ${fmt(k, 1)}`, 'kk', a, [0, -.5, 0], g);
    b.rotR = novoRotulo('', 'f', b.topo, [0, .0, 0], g); b.rot.on = false; return b;
  });
  const base = new T.Mesh(new T.BoxGeometry(10.4, .08, 1.7), mat(0x17384f, 0x17384f, .4)); base.position.y = -.04; g.add(base);
  const cVerde = new T.Color(0x46d39a), cVerm = new T.Color(0xff5d5d), cor = new T.Color();
  const api = {
    inst: 'i3_grande',
    aplicar(inst, reset) {
      api.inst = inst; const linhas = D.varredura.filter(r => r.instancia === inst), maxE = Math.max(...linhas.map(r => r.expandidos)), maxR = Math.max(...linhas.map(r => r.custo_sobre_otimo));
      barras.forEach((b, i) => {
        const r = linhas.find(x => x.k === b.k);
        b.alvo = r.expandidos / maxE * 4.4 + .05; b.rotR.el.innerHTML = `${r.expandidos} exp.`; b.rotK.el.innerHTML = `k = ${fmt(b.k, 1)}<br><small>${fmt(r.custo_sobre_otimo, r.custo_sobre_otimo < 1.1 ? 3 : 2)}× o ótimo</small>`; b.rotR.on = true; b.rotK.on = true;
        cor.lerpColors(cVerde, cVerm, maxR > 1.0001 ? clamp((r.custo_sobre_otimo - 1) / (maxR - 1), 0, 1) : 0);
        b.corAlvo = cor.clone(); if (reset) { b.h = 0; b.atraso = i * .09; }
      });
    },
    update(dt) { for (const b of barras) { if (b.atraso > 0) { b.atraso -= dt; continue; } b.h = damp(b.h, b.alvo, 6, dt); const h = Math.max(b.h, .001); b.m.scale.y = h; b.topo.position.set(b.m.position.x, h, 0); b.rotR.off.y = .32;
      if (b.corAlvo) { b.m.material.color.lerp(b.corAlvo, 1 - Math.exp(-dt * 6)); b.m.material.emissive.copy(b.m.material.color); } } },
  };
  return api;
})();

/* =====================================================================
   JOGADOR DE BUSCA: reproduz passo a passo o rastro real
   ===================================================================== */
const jogador = {
  chave: 'largura', s: 0, painel: null, silencioso: false,
  get b() { return D.i1.buscas[this.chave]; },
  get tipo() { return this.chave === 'largura' ? 'largura' : this.chave === 'custo_uniforme' ? 'ucs' : this.chave === 'gulosa' ? 'gulosa' : 'astar'; },
  get max() { return this.b.passos.length - 1; },
  usar(chave, painel) { this.chave = chave; if (painel) this.painel = painel; this.s = 0; this.aplicar(false); },
  ir(s, animar = true) { this.s = clamp(s, 0, this.max); this.aplicar(animar); },
  aplicar(animar) {
    const b = this.b, p = b.passos[this.s], G = g1, heap = b.heap, tipo = this.tipo;
    const exp = new Set(); for (let j = 1; j <= this.s; j++) if (!b.passos[j].objetivo) exp.add(b.passos[j].sai);
    const melhor = new Map(); for (const e of p.fronteira.filter(x => !x.obsoleta)) if (!melhor.has(e.e) || (e.f ?? 0) < (melhor.get(e.e).f ?? 0)) melhor.set(e.e, e);
    const atual = this.s > 0 ? p.sai : null, otimo = b.custo <= D.i1.buscas.custo_uniforme.custo + 1e-9;
    G.nomes.forEach(n => {
      let est = 'ocioso'; if (n === atual) est = p.objetivo ? 'objetivo' : 'atual'; else if (exp.has(n)) est = 'expandido'; else if (melhor.has(n)) est = 'fronteira';
      if (p.objetivo_gerado === n) est = 'objetivo'; G.setNo(n, est);
    });
    if (heap) {
      const alvos = new Map(melhor);
      if (atual) { const e = p.objetivo ? p.sai_entrada : b.passos[this.s - 1].fronteira.find(x => !x.obsoleta && x.e === atual); if (e) alvos.set(atual, e); }
      G.nomes.forEach(n => { const e = alvos.get(n); if (!e) return G.setBarra(n, null); G.setBarra(n, tipo === 'gulosa' ? 0 : tipo === 'ucs' ? e.f : e.g, tipo === 'gulosa' ? e.f : tipo === 'ucs' ? 0 : e.f - e.g, tipo); });
    } else G.limparBarras();
    if (animar && atual && !p.objetivo) p.entram.forEach(e => G.pulso(atual, e.e, tipo === 'largura' ? 0x2fd3e0 : 0xffb84d));
    if (p.objetivo || p.objetivo_gerado) G.mostrarCaminho(b.caminho, otimo ? 'ok' : 'ruim'); else G.limparCaminho();
    if (!this.silencioso && this.painel) this.pintarPainel(p, exp, otimo);
    if (this.aoMudar) this.aoMudar();
  },
  pintarPainel(p, exp, otimo) {
    const b = this.b, heap = b.heap, tipo = this.tipo, P = this.painel, idx = this.s;
    if (P.fila) renderFila(P.fila, p.fronteira, heap, tipo);
    if (P.conj) {
      if (!heap) { const desc = new Set([...exp, ...p.fronteira.map(e => e.e)]); P.conj.innerHTML = `<b>descobertos</b> = {${[...desc].join(', ')}}<br><b>expandidos</b> = [${[...exp].join(', ')}]`; }
      else { const mg = {}; for (let j = 0; j <= idx; j++) for (const e of b.passos[j].entram) if (mg[e.e] == null || e.g < mg[e.e]) mg[e.e] = e.g; P.conj.innerHTML = `<b>melhor_g</b> = {${Object.entries(mg).map(([k, v]) => `${k}: ${fmt(v, 1)}`).join(', ')}}`; }
    }
    P.txt.innerHTML = this.texto(p, otimo);
  },
  texto(p, otimo) {
    const b = this.b, heap = b.heap, tipo = this.tipo, rot = tipo === 'gulosa' ? 'h' : tipo === 'ucs' ? 'g' : 'f';
    const val = e => tipo === 'gulosa' ? `h=${fmt(e.f, 2)}` : tipo === 'ucs' ? `g=${fmt(e.g, 2)}` : `g=${fmt(e.g, 2)}, f=${fmt(e.f, 2)}`;
    const cam = b.caminho.join(' → ');
    if (this.s === 0) return heap ? `Início: <b>${D.i1.origem}</b> entra na fronteira com prioridade ${rot} = ${fmt(p.fronteira[0].f, 2)}.` : `Início: <b>${D.i1.origem}</b> entra na fronteira e em <code>descobertos</code>.`;
    if (p.objetivo) return `Sai <b>${p.sai}</b> (menor ${rot}): <b>teste de objetivo na retirada</b> ✔<br>Caminho <b>${cam}</b>, custo <b>${fmt(b.custo, 1)}</b> ${otimo ? '— ótimo.' : `— <span style="color:var(--bad)">não ótimo</span> (o ótimo custa ${fmt(D.i1.buscas.custo_uniforme.custo, 1)}).`}`;
    const novos = p.entram.map(e => heap ? `<b>${e.e}</b> (${val(e)})` : `<b>${e.e}</b>`).join(', ') || 'nenhum vizinho novo';
    let t = heap ? `Sai <b>${p.sai}</b> (menor ${rot} na fronteira). Gera: ${novos}.` : `Sai <b>${p.sai}</b> (o mais antigo da fila). Vizinhos ainda não descobertos entram no fim: ${novos}.`;
    if (heap) { const ob = p.fronteira.find(e => e.obsoleta); if (ob && p.entram.some(e => e.e === ob.e)) t += `<br>Achou caminho melhor até <b>${ob.e}</b> (g=${fmt(p.entram.find(e => e.e === ob.e).g, 2)} &lt; ${fmt(ob.g, 2)}): a entrada antiga vira <b>obsoleta</b> (remoção preguiçosa).`; }
    if (p.objetivo_gerado) t += `<br>Ao <b>gerar</b> ${p.objetivo_gerado}, o teste de objetivo dispara: <b>${cam}</b>, ${b.passos_n} passos, custo <b>${fmt(b.custo, 1)}</b>${otimo ? '' : ' — <span style="color:var(--bad)">menos passos, mas não a menor distância</span>'}.`;
    return t;
  },
};
function renderFila(el, fronteira, heap, tipo) {
  el._m = el._m || new Map();
  const chave = e => e.e + '|' + (e.g ?? ''), vivos = new Set(fronteira.map(chave)), primeiro = fronteira.find(e => !e.obsoleta);
  for (const [k, c] of el._m) if (!vivos.has(k)) { c.classList.add('saindo'); el._m.delete(k); setTimeout(() => c.remove(), 450); }
  fronteira.forEach((e, i) => {
    const k = chave(e); let c = el._m.get(k);
    if (!c) { c = document.createElement('div'); c.className = 'chip novo'; el.appendChild(c); el._m.set(k, c); }
    const val = !heap ? '' : tipo === 'gulosa' ? `h ${fmt(e.f, 2)}` : tipo === 'ucs' ? `g ${fmt(e.g, 2)}` : `g ${fmt(e.g, 2)}<br>f ${fmt(e.f, 2)}`;
    c.innerHTML = `<div class="e">${e.e}</div><div class="v">${val}</div>`;
    c.classList.toggle('obsoleto', !!e.obsoleta); c.classList.toggle('primeiro', e === primeiro);
    c.style.transform = `translateX(${i * 104}px)`;
  });
}

/* =====================================================================
   SLIDES
   ===================================================================== */
const slides = $$('.slide'), N = slides.length;
const cam = { pos: V3(0, 10, 24), look: V3(0, 0, 0), alvoPos: V3(0, 10, 24), alvoLook: V3(0, 0, 0), desloc: 0, alvoDesloc: 0 };
const mouse = { x: 0, y: 0 };
const otimoI1 = D.i1.buscas.custo_uniforme;
let cur = -1, autoplay = false, autoT = 0;

const painel = (idFila, idConj, idTxt) => ({ fila: idFila && $(idFila), conj: idConj && $(idConj), txt: $(idTxt) });
const cenas = [
  { // 0 título
    grupos: ['titulo'], desloc: .3, orbita: t => [Math.sin(t * .09) * 24, 11 + Math.sin(t * .05) * 2, Math.cos(t * .09) * 24], look: [0, 0, 0],
    entrar() { rede.setCaminho(false); },
  },
  { // 1 problema
    grupos: ['i1'], cam: [0, 10.4, 9.8], look: [0, -.3, -.5], desloc: .23, max: () => 2,
    entrar() { g1.trafegoOn = true; mostrarRotulos(g1.grupo, ['no', 'dist']); g1.resetNos(); g1.limparBarras(); g1.mostrarComparacao(false); },
    passo(s) {
      const t = $('#txt2'); g1.resetNos();
      if (s === 0) { g1.limparCaminho(); t.innerHTML = 'As partículas mostram o <b>sentido</b> de cada rua. Na bloqueada (✕) ninguém passa.'; }
      if (s === 1) { g1.mostrarCaminho(D.i1.buscas.largura.caminho, 'ruim'); t.innerHTML = 'Menos ruas: <b>S → M → G</b> tem 2 ruas e custa <b>8,0</b> (a avenida M→G mede 6).'; }
      if (s === 2) { g1.mostrarCaminho(otimoI1.caminho, 'ok'); t.innerHTML = 'Menor distância: <b>S → A → B → G</b> tem 3 ruas e custa <b>5,0</b>. Essa é a rota que queremos.'; }
    },
  },
  { // 2 PEAS
    grupos: ['i1'], cam: [0, 10.6, 10], look: [0, -.3, -.5], desloc: .29,
    entrar() { g1.trafegoOn = true; mostrarRotulos(g1.grupo, ['no']); g1.resetNos(); g1.limparBarras(); g1.mostrarComparacao(false); g1.mostrarCaminho(otimoI1.caminho, 'ok'); },
  },
  { // 3 formulação
    grupos: ['i1'], cam: [0, 10, 9.4], look: [0, -.3, -.4], desloc: .24, max: () => 5,
    entrar() { g1.trafegoOn = false; mostrarRotulos(g1.grupo, ['no', 'dist']); g1.limparBarras(); g1.mostrarComparacao(false); },
    passo(s) {
      const A = 'adjacencia', txt = $('#txt4'), pre = $('#adj4'); g1.resetNos(); g1.limparCaminho();
      $$('#comp4 li').forEach((li, i) => li.classList.toggle('ativo', i === s - 1));
      pre.innerHTML = s < 3 ? `<span class="cm"># lista de adjacência: dict[str, list[(str, float)]]</span>\n${A}["S"] = [("M", 2.0), ("A", 1.5), ("C", 1.5)]` :
        `${A}["A"] = [<span class="ok">("S", 1.5)</span>, <span class="ok">("B", 2.0)</span>, <span class="no">("G", 3.2)</span>]\nsucessores(A) = [("S", 1.5), ("B", 2.0)]  <span class="cm"># A–G bloqueada</span>`;
      if (s === 0) txt.innerHTML = 'Cada cruzamento é um <b>estado</b>; cada rua, uma ação com custo.';
      if (s === 1) { g1.nomes.forEach(n => g1.setNo(n, 'fronteira')); txt.innerHTML = '<b>Estados:</b> 7 cruzamentos (|V| = 7), identificados por <code>str</code>.'; }
      if (s === 2) { g1.setNo('S', 'atual'); txt.innerHTML = '<b>Estado inicial:</b> <code>origem</code> = S, o depósito.'; }
      if (s === 3) { g1.setNo('A', 'atual'); g1.setNo('S', 'fronteira'); g1.setNo('B', 'fronteira'); g1.pulso('A', 'S'); g1.pulso('A', 'B'); g1.marcadorPisca('A', 'G'); txt.innerHTML = '<b>Função sucessora</b> de A: só S e B. A rua para G existe, mas está bloqueada.'; }
      if (s === 4) { g1.setNo('G', 'objetivo'); txt.innerHTML = '<b>Teste de objetivo:</b> <code>estado == destino</code>, ou seja, G.'; }
      if (s === 5) { g1.mostrarCaminho(otimoI1.caminho, 'ok'); ['S', 'A', 'B', 'G'].forEach(n => g1.setNo(n, 'caminho')); txt.innerHTML = '<b>Custo do caminho:</b> 1,5 + 2,0 + 1,5 = <b>5,0</b>. Soma das distâncias, cada passo &gt; 0.'; }
    },
  },
  { // 4 largura
    grupos: ['i1'], cam: [0, 9.8, 9], look: [0, -.3, -.3], desloc: .24, auto: true, max: () => jogador.max,
    entrar() { g1.trafegoOn = false; mostrarRotulos(g1.grupo, ['no', 'dist']); g1.mostrarComparacao(false); jogador.silencioso = false; jogador.usar('largura', painel('#fila5', '#conj5', '#txt5')); },
    passo(s, animar) { jogador.ir(s, animar); },
  },
  { // 5 melhor-primeiro
    grupos: ['i1'], cam: [0, 9.8, 9], look: [0, -.3, -.3], desloc: .24, auto: true, max: () => jogador.max,
    entrar() {
      g1.trafegoOn = false; mostrarRotulos(g1.grupo, ['no', 'dist', 'f']); g1.mostrarComparacao(false); jogador.silencioso = false;
      const box = $('#botoes6'); if (!box.children.length) [['custo_uniforme', 'Custo uniforme'], ['a_estrela', 'A* (h)'], ['a_estrela_k3', 'A* (h × 3)'], ['gulosa', 'Gulosa']].forEach(([k, r]) => {
        const b = document.createElement('button'); b.textContent = r; b.dataset.k = k; b.onclick = () => { escolher6(k); }; box.appendChild(b);
      });
      escolher6(this.chave || 'a_estrela');
    },
    passo(s, animar) { jogador.ir(s, animar); },
  },
  { // 6 heurística
    grupos: ['i1'], cam: [0, 10, 9.2], look: [0, .2, -.3], desloc: .24,
    entrar() {
      g1.trafegoOn = false; jogador.silencioso = true; g1.resetNos(); g1.limparBarras(); mostrarRotulos(g1.grupo, ['no']); g1.mostrarComparacao(true);
      $('#k7').value = 1; kAnim = { t: 0, ativo: true }; atualizarK(1);
    },
    sair() { kAnim.ativo = false; },
  },
  { // 7 código ao vivo
    grupos: ["i1"], cam: [0, 11.8, 11.8], look: [0, -.6, -.4], desloc: .25, auto: true, max: () => passosCodigo.length - 1,
    entrar() {
      g1.trafegoOn = false; mostrarRotulos(g1.grupo, ['no']); g1.mostrarComparacao(false);
      jogador.silencioso = true; jogador.usar('a_estrela'); jogador.aoMudar = () => { if (jogador.s >= jogador.max && fundo.espera === 0) fundo.espera = 2.4; }; fundo.ativo = true; fundo.t = 0;
      if (!$('#abas8').children.length) montarCodigo(); passoCodigo(0);
    },
    passo(s) { passoCodigo(s); },
    sair() { fundo.ativo = false; jogador.aoMudar = null; },
  },
  { // 8 corrida
    grupos: ['corrida'], cam: [0, 70, 19], look: [0, 0, 1.6], desloc: .1,
    entrar() { mostrarRotulos(grupos.corrida, ['corrida']); corrida.pausa = false; corrida.reiniciar(); },
    reiniciar() { corrida.reiniciar(); },
  },
  { // 9 resultados
    grupos: ['barras'], cam: [0, 7.6, 18], look: [0, 1.9, 0], desloc: 0, max: () => 1,
    entrar() { mostrarRotulos(grupos.barras, ['valor', 'grupo']); resultados.aplicar(0, true); montarLegenda(); },
    passo(s) {
      resultados.aplicar(s, s === 0 && resultados.modo !== 0);
      $('#tit10').textContent = s === 0 ? 'Nós expandidos por estratégia' : 'Perda de otimalidade por estratégia';
      $('#sub10').innerHTML = s === 0 ? 'altura em escala logarítmica · dados de <code>resultados/tabela.csv</code>' : 'excesso de custo sobre o ótimo (custo uniforme), escala de raiz · A* (h) e custo uniforme: sempre ótimos';
    },
  },
  { // 10 exigência extra
    grupos: ['kbarras'], cam: [0, 6.2, 17.5], look: [0, 2.0, 0], desloc: 0,
    entrar() { mostrarRotulos(grupos.kbarras, ['kk', 'f']); montarBotoes11(); kchart.aplicar(kchart.inst, true); textoK(); },
  },
  { // 11 conclusão
    grupos: ['titulo'], desloc: .3, orbita: t => [Math.sin(t * .07 + 2) * 22, 12, Math.cos(t * .07 + 2) * 22], look: [0, 0, 0],
    entrar() { rede.setCaminho(true); }, sair() { rede.setCaminho(false); },
  },
];
cenas.forEach(c => { c.s = 0; });

// fundo do slide 8: repete a busca A* sozinha
const fundo = { ativo: false, t: 0, espera: 0 };
function escolher6(k) {
  cenas[5].chave = k; $$('#botoes6 button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  jogador.silencioso = false; jogador.usar(k, painel('#fila6', '#conj6', '#txt6'));
  const c = cenas[5]; c.s = 0; atualizarPlayer();
  $('#rot6').textContent = k === 'gulosa' ? 'fronteira (menor h primeiro)' : k === 'custo_uniforme' ? 'fronteira (menor g primeiro)' : 'fronteira (menor f = g + h primeiro)';
  const box = $('#fila6'); box._m = new Map(); box.innerHTML = ''; jogador.aplicar(false);
}

/* ---- slide 7: h × k ---- */
let kAnim = { ativo: false, t: 0 };
function montarFaixa() {
  const f = $('#faixa7'); f.innerHTML = '';
  D.i1.varredura.forEach(v => { const i = document.createElement('i'); i.className = v.custo <= otimoI1.custo + 1e-9 ? 'o' : 'n'; f.appendChild(i); });
  const c = document.createElement('div'); c.className = 'cursor'; c.id = 'cursor7'; f.appendChild(c);
}
function atualizarK(k) {
  k = Math.round(k * 20) / 20; const v = D.i1.varredura[clamp(Math.round((k - 1) / .05), 0, 80)], ok = v.custo <= otimoI1.custo + 1e-9;
  $('#kval').textContent = fmt(k, 2); $('#cursor7').style.left = `calc(${(k - 1) / 4 * 100}% - 1.5px)`;
  const A = D.i1.h.A, ruim = k * A > 3.5 + 1e-9;
  $('#leitura7').innerHTML = `<span>caminho</span><b>${v.caminho.join(' → ')}</b><span>custo</span><b>${fmt(v.custo, 1)}${ok ? '' : ` (${fmt((v.custo / otimoI1.custo - 1) * 100, 0)}% acima)`}</b><span>expandidos</span><b>${v.expandidos}</b><span>resultado</span><b class="selo ${ok ? 'ok' : 'ruim'}">${ok ? 'ótimo' : 'NÃO ótimo'}</b>`;
  $('#prova7').innerHTML = `Em <b>A</b>: h*(A) = 2,0 + 1,5 = <b>3,5</b> e k·h(A) = ${fmt(k * A, 2)} ⇒ ${ruim ? '<b style="color:var(--bad)">superestima</b> (não admissível)' : 'admissível'}.<br>Limiar na i1: 1,5 + k·${fmt(A, 2)} &gt; 8 ⇒ <b>k &gt; ${fmt(6.5 / A, 2)}</b>. Superestimar tira a garantia, não necessariamente o acerto.`;
  g1.comparar(k); g1.mostrarCaminho(v.caminho, ok ? 'ok' : 'ruim'); g1.resetNos(); v.caminho.forEach(n => g1.setNo(n, 'caminho'));
}

/* ---- slide 8: código ---- */
const passosCodigo = [], ordemCodigo = ['sucessores', 'largura', 'melhor_primeiro', 'reconstruir'];
const rotAba = { sucessores: 'sucessores', largura: 'laço · largura', melhor_primeiro: 'laço · melhor-primeiro', reconstruir: 'reconstruir_caminho' };
function realcar(l) {
  const partes = []; let cm = ''; const i = l.indexOf('#'); if (i >= 0) { cm = l.slice(i); l = l.slice(0, i); }
  let h = esc(l).replace(/(&quot;|"[^"]*")/g, s => s).replace(/"[^"]*"/g, s => `<span class="st">${s}</span>`);
  h = h.replace(/\b(def|while|for|if|not|in|return|continue|and|or|is|None|else|elif|import|from)\b/g, '<span class="kw">$1</span>')
       .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="nm">$1</span>');
  return h + (cm ? `<span class="cm">${esc(cm)}</span>` : '');
}
function montarCodigo() {
  ordemCodigo.forEach(k => D.codigo[k].notas.forEach((n, i) => passosCodigo.push({ k, i })));
  const abas = $('#abas8');
  ordemCodigo.forEach(k => { const b = document.createElement('button'); b.textContent = rotAba[k]; b.dataset.k = k; b.onclick = () => { const s = passosCodigo.findIndex(p => p.k === k); cenas[7].s = s; cenas[7].passo(s); atualizarPlayer(); }; abas.appendChild(b); });
}
let abaAtual = '';
function passoCodigo(s) {
  const { k, i } = passosCodigo[s], c = D.codigo[k];
  if (abaAtual !== k) {
    abaAtual = k; $('#arq8').textContent = `${c.arquivo} · linhas ${c.inicio}–${c.inicio + c.linhas.length - 1}`;
    $('#fonte8').innerHTML = c.linhas.map((l, j) => `<div class="ln" data-j="${j}"><span class="no">${c.inicio + j}</span><span>${realcar(l)}</span></div>`).join('');
    $$('#abas8 button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  }
  const nota = c.notas[i]; $$('#fonte8 .ln').forEach(el => el.classList.toggle('hl', +el.dataset.j === nota.linha));
  $('#nota8').innerHTML = `<b>linha ${c.inicio + nota.linha}</b> · ${esc(nota.texto).replace(/`([^`]+)`/g, '<code>$1</code>')}`;
}

/* ---- slides 10 e 11: legendas e botões ---- */
function montarLegenda() { const el = $('#leg10'); if (el.children.length) return; el.innerHTML = ESTR.map(([n, c]) => `<span><i style="background:#${c.toString(16).padStart(6, '0')}"></i>${esc(n)}</span>`).join(''); }
function montarBotoes11() {
  const box = $('#botoes11'); if (box.children.length) return;
  [['i1_pequena', 'i1 · 7 cruzamentos'], ['i2_media', 'i2 · 36'], ['i3_grande', 'i3 · 400']].forEach(([k, r]) => {
    const b = document.createElement('button'); b.textContent = r; b.dataset.k = k; b.onclick = () => { kchart.aplicar(k, true); textoK(); }; box.appendChild(b);
  });
}
function textoK() {
  $$('#botoes11 button').forEach(b => b.classList.toggle('on', b.dataset.k === kchart.inst));
  const l = D.varredura.filter(r => r.instancia === kchart.inst), a = l[0], z = l[l.length - 1], pior = Math.max(...l.map(r => r.custo_sobre_otimo));
  $('#txt11').innerHTML = `k = 1 → k = 5: expandidos <b>${a.expandidos} → ${z.expandidos}</b> (${fmt((1 - z.expandidos / a.expandidos) * 100, 0)}% menos) · pior custo <b>${fmt(pior, pior < 1.1 ? 3 : 2)}× o ótimo</b> · limite de Pohl: custo ≤ k × ótimo`;
}

/* ---------- navegação ---------- */
function maxPassos(c) { return c.max ? c.max() : 0; }
function atualizarPlayer() {
  const c = cenas[cur], m = maxPassos(c), p = $('#player');
  p.classList.toggle('on', m > 0); $('#p-info').textContent = m > 0 ? `passo ${c.s} / ${m}` : '';
  $('#p-play').textContent = autoplay ? '⏸' : '▶';
}
function irParaPasso(s, animar = true) { const c = cenas[cur]; c.s = clamp(s, 0, maxPassos(c)); if (c.passo) c.passo(c.s, animar); atualizarPlayer(); }
function irPara(i, fim = false) {
  i = clamp(i, 0, N - 1); if (i === cur) return;
  if (cur >= 0) { cenas[cur].sair && cenas[cur].sair(); slides[cur].classList.remove('ativo'); }
  cur = i; autoplay = false; autoT = 0; const c = cenas[cur], sl = slides[cur];
  $$('.rev', sl).forEach((e, j) => e.style.setProperty('--i', j)); sl.classList.remove('ativo'); void sl.offsetWidth; sl.classList.add('ativo');
  Object.entries(grupos).forEach(([n, g]) => { g.userData.alvo = c.grupos.includes(n) ? 1 : 0; });
  if (c.cam) { cam.alvoPos.set(...c.cam); cam.alvoLook.set(...c.look); }
  cam.alvoDesloc = c.desloc || 0;
  c.entrar && c.entrar(); c.s = fim ? maxPassos(c) : 0; if (c.passo) c.passo(c.s, false);
  $$('#pontos i').forEach((p, j) => p.classList.toggle('on', j === cur)); $('#nome-slide').textContent = `${cur + 1}/${N} · ${sl.dataset.titulo}`;
  history.replaceState(null, '', '#' + (cur + 1)); atualizarPlayer();
}
function proximo() { const c = cenas[cur]; if (c.s < maxPassos(c)) irParaPasso(c.s + 1); else irPara(cur + 1); }
function anterior() { const c = cenas[cur]; if (c.s > 0) irParaPasso(c.s - 1, false); else irPara(cur - 1, true); }
function alternarAuto() { const c = cenas[cur]; if (c.reiniciar === undefined && !maxPassos(c)) return; if (cur === 8) { corrida.pausa = !corrida.pausa; return; } if (c.s >= maxPassos(c)) irParaPasso(0, false); autoplay = !autoplay; autoT = 0; atualizarPlayer(); }

$('#pontos').innerHTML = slides.map(() => '<i></i>').join(''); $$('#pontos i').forEach((p, j) => { p.onclick = () => irPara(j); });
$('#p-ini').onclick = () => irParaPasso(0, false); $('#p-ant').onclick = anterior; $('#p-prox').onclick = proximo; $('#p-play').onclick = alternarAuto;
$('#k7').addEventListener('input', e => { kAnim.ativo = false; atualizarK(+e.target.value); });
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
  const k = e.key;
  if (k === 'ArrowRight' || k === 'PageDown' || k === 'Enter') { e.preventDefault(); proximo(); }
  else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); anterior(); }
  else if (k === ' ') { e.preventDefault(); alternarAuto(); }
  else if (k === 'Home') irPara(0); else if (k === 'End') irPara(N - 1);
  else if (k === 'f' || k === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  else if (k === 'r' || k === 'R') { if (cur === 8) corrida.reiniciar(); else irParaPasso(0, false); }
});
let rolando = 0; addEventListener('wheel', e => { if (e.target.closest('.painel')) return; const agora = performance.now(); if (agora - rolando < 900 || Math.abs(e.deltaY) < 20) return; rolando = agora; e.deltaY > 0 ? proximo() : anterior(); }, { passive: true });
let toque = null; addEventListener('touchstart', e => { toque = e.touches[0].clientX; }, { passive: true });
addEventListener('touchend', e => { if (toque == null) return; const dx = e.changedTouches[0].clientX - toque; if (Math.abs(dx) > 60) dx < 0 ? proximo() : anterior(); toque = null; }, { passive: true });
addEventListener('mousemove', e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; });
function redimensionar() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); aplicarDeslocamento(); }
function aplicarDeslocamento() { const w = innerWidth, h = innerHeight; if (Math.abs(cam.desloc) < .002) camera.clearViewOffset(); else camera.setViewOffset(w, h, -cam.desloc * w, 0, w, h); }
addEventListener('resize', redimensionar);

/* ---------- laço de animação ---------- */
const relogio = new T.Clock(); let tempo = 0;
function quadro() {
  const dt = Math.min(relogio.getDelta(), .05); tempo += dt; const c = cenas[cur];
  if (c.orbita) { const [x, y, z] = c.orbita(tempo); cam.alvoPos.set(x, y, z); cam.alvoLook.set(...c.look); }
  cam.pos.x = damp(cam.pos.x, cam.alvoPos.x + mouse.x * 1.2, 2.6, dt); cam.pos.y = damp(cam.pos.y, cam.alvoPos.y - mouse.y * .8, 2.6, dt); cam.pos.z = damp(cam.pos.z, cam.alvoPos.z, 2.6, dt);
  cam.look.set(damp(cam.look.x, cam.alvoLook.x, 3, dt), damp(cam.look.y, cam.alvoLook.y, 3, dt), damp(cam.look.z, cam.alvoLook.z, 3, dt));
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  const d0 = cam.desloc; cam.desloc = damp(cam.desloc, cam.alvoDesloc, 3, dt); if (Math.abs(cam.desloc - d0) > 1e-5 || cam.desloc !== cam.alvoDesloc) aplicarDeslocamento();
  for (const g of Object.values(grupos)) { const u = g.userData; u.k = damp(u.k, u.alvo, 5, dt); g.visible = u.k > .01; g.scale.setScalar(Math.max(easeOut(clamp(u.k, 0, 1)), .001)); }
  poeira.rotation.y += dt * .012;
  if (grupos.i1.visible) g1.update(dt, tempo);
  if (grupos.titulo.visible) rede.update(dt);
  if (grupos.corrida.visible) corrida.update(dt);
  if (grupos.barras.visible) resultados.update(dt, tempo);
  if (grupos.kbarras.visible) kchart.update(dt);
  if (kAnim.ativo) { kAnim.t += dt / 9; const k = 1 + 4 * (kAnim.t < 1 ? easeOut(kAnim.t) : 1); atualizarK(k); $('#k7').value = k; if (kAnim.t >= 1) kAnim.ativo = false; }
  if (autoplay) { autoT += dt; if (autoT > 2.1) { autoT = 0; if (c.s < maxPassos(c)) irParaPasso(c.s + 1); else { autoplay = false; atualizarPlayer(); } } }
  if (fundo.ativo) { if (fundo.espera > 0) { fundo.espera -= dt; if (fundo.espera <= 0) { jogador.ir(0, false); fundo.t = 0; } } else { fundo.t += dt; if (fundo.t > 1.5) { fundo.t = 0; if (jogador.s < jogador.max) jogador.ir(jogador.s + 1); } } }
  atualizarRotulos(); renderer.render(scene, camera); requestAnimationFrame(quadro);
}

montarFaixa(); redimensionar();
const inicial = clamp((parseInt(location.hash.slice(1), 10) || 1) - 1, 0, N - 1);
cam.pos.set(0, 30, 40); cam.alvoPos.copy(cam.pos);
irPara(inicial); requestAnimationFrame(quadro);
window.__apresentacao = { irPara, proximo, anterior, cenas, jogador, corrida, g1, camera, renderer };
})();
