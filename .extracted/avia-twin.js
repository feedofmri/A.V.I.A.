(function () {
if (customElements.get('avia-twin')) return;
const URL3 = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
let P3 = null;
const COL = { nom: '#34d399', warn: '#f5b83d', crit: '#f04444' };
const ANCH = {
  'skeletal.spine': [0, 1.06, -0.06], 'skeletal.hips': [0.09, 0.85, 0.02], 'skeletal.legs': [0.1, 0.3, 0.02],
  'cardio.head': [0, 1.7, 0.02], 'cardio.chest': [0.03, 1.29, 0.06], 'cardio.legs': [-0.1, 0.36, 0.03],
  'dermal.forearm': [0.272, 1.0, 0.04], 'dermal.torso': [0.07, 1.22, 0.1],
  'skeletal.skull': [0, 1.74, 0.06], 'skeletal.cervical': [0, 1.52, -0.03], 'skeletal.humerus': [0.225, 1.28, 0.02], 'skeletal.radius': [0.262, 0.98, 0.03],
  'cardio.neck': [0.035, 1.52, 0.03], 'cardio.arms': [0.24, 1.2, 0.03], 'cardio.pelvis': [0, 0.88, 0.08],
  'skeletal.femur': [0.1, 0.68, 0.03], 'cardio.thigh': [-0.1, 0.7, 0.05], 'dermal.shins': [0.1, 0.28, 0.05],
  'dermal.face': [0, 1.68, 0.09], 'dermal.arms': [-0.235, 1.25, 0.04], 'dermal.lower': [-0.1, 0.6, 0.06],
};
const VS = 'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}';
const FS = 'uniform vec3 uColor;uniform float uOpacity;uniform float uGlow;varying vec3 vN;varying vec3 vV;void main(){float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.0);float a=clamp(uOpacity*(0.35+f*1.5)+uGlow*0.35*(0.3+f),0.0,1.0);vec3 c=uColor*(0.55+f*0.9+uGlow*0.7);gl_FragColor=vec4(c,a);}';

class AviaTwin extends HTMLElement {
  static get observedAttributes() { return ['state']; }
  constructor() { super(); this.st = {}; }
  attributeChangedCallback(n, o, v) { try { this.st = JSON.parse(v || '{}'); } catch (e) {} this.apply(); }
  connectedCallback() {
    if (this.ready || this.booting) return;
    this.booting = true;
    Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%' });
    this.innerHTML = '<div data-w style="position:absolute;inset:0"></div><div data-lb style="position:absolute;inset:0;pointer-events:none;overflow:hidden"></div><div data-tt style="position:absolute;left:0;top:0;pointer-events:none;opacity:0;transition:opacity .15s;padding:8px 11px;border-radius:9px;font:500 12px/1.4 \'Space Grotesk\',system-ui,sans-serif;white-space:nowrap;z-index:3;backdrop-filter:blur(8px)"></div>';
    (P3 || (P3 = import(URL3))).then(T => { this.booting = false; if (this.isConnected) this.setup(T); });
  }
  disconnectedCallback() {
    cancelAnimationFrame(this.raf); this.ro && this.ro.disconnect();
    window.removeEventListener('pointermove', this.onMove); window.removeEventListener('pointerup', this.onUp);
    if (this.R) { this.R.dispose(); this.R.domElement.remove(); }
    this.ready = false; this.booting = false; this.innerHTML = '';
  }
  setup(T) {
    this.T = T;
    const w = this.querySelector('[data-w]'); this.lb = this.querySelector('[data-lb]'); this.tt = this.querySelector('[data-tt]');
    const R = new T.WebGLRenderer({ antialias: true, alpha: true });
    R.setPixelRatio(Math.min(devicePixelRatio, 2)); R.setClearColor(0, 0);
    w.appendChild(R.domElement); R.domElement.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;touch-action:none';
    this.R = R; this.S = new T.Scene(); this.cam = new T.PerspectiveCamera(30, 1, 0.05, 50);
    this.orb = { th: 0.35, ph: 1.45, r: 5.2, ty: 0.92 }; this.goal = { ...this.orb };
    this.S.add(new T.AmbientLight(0xffffff, 0.6));
    const d1 = new T.DirectionalLight(0xffffff, 1.2); d1.position.set(2, 4, 3); this.S.add(d1);
    const d2 = new T.DirectionalLight(0x88aaff, 0.7); d2.position.set(-3, 2, -2); this.S.add(d2);
    this.ray = new T.Raycaster(); this.ndc = new T.Vector2();
    this.build();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this); this.resize();
    this.bind(); this.ready = true; this.apply(); this.t0 = performance.now(); this.loop();
  }
  resize() {
    const r = this.getBoundingClientRect(); if (!r.width || !r.height) return;
    this.R.setSize(r.width, r.height, false); this.cam.aspect = r.width / r.height; this.cam.updateProjectionMatrix();
  }
  build() {
    const T = this.T, V = (x, y, z) => new T.Vector3(x, y, z);
    const G = this.G = { skin: new T.Group(), skel: new T.Group(), card: new T.Group(), derm: new T.Group(), plat: new T.Group() };
    Object.values(G).forEach(g => this.S.add(g));
    this.skin = []; this.bones = []; this.vessels = []; this.flows = []; this.dermal = [];
    const skinMat = () => new T.ShaderMaterial({ uniforms: { uColor: { value: new T.Color('#5b8cff') }, uOpacity: { value: 0.3 }, uGlow: { value: 0 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    const boneMat = () => new T.MeshStandardMaterial({ color: '#d9e2ee', roughness: 0.5, metalness: 0.05, emissive: new T.Color('#000'), emissiveIntensity: 1 });
    const vesMat = () => new T.MeshStandardMaterial({ color: '#7d8aa6', roughness: 0.35, emissive: new T.Color('#7d8aa6'), emissiveIntensity: 0.5 });
    const reg = (m, region, group, list) => { m.userData.region = region; group.add(m); list && list.push(m); return m; };
    const lathe = (pts, mat) => new T.Mesh(new T.LatheGeometry(pts.map(p => new T.Vector2(p[0], p[1])), 40), mat);
    const limbLathe = (a, b, prof, mat) => {
      const L = a.distanceTo(b);
      const m = new T.Mesh(new T.LatheGeometry(prof.map(([t, r]) => new T.Vector2(r, -L / 2 + t * L)), 32), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); return m;
    };
    const rod = (a, b, r, mat, r2) => {
      const L = a.distanceTo(b); const m = new T.Mesh(new T.CylinderGeometry(r2 ?? r, r, L, 14), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); return m;
    };
    const ball = (r, mat, p, s) => { const m = new T.Mesh(new T.SphereGeometry(r, 32, 24), mat); m.position.copy(p); if (s) m.scale.set(...s); return m; };
    const tube = (pts, r, mat) => { const c = new T.CatmullRomCurve3(pts.map(p => V(...p))); const m = new T.Mesh(new T.TubeGeometry(c, 64, r, 10, false), mat); m.userData.curve = c; return m; };

    // skin
    const S = (m, region) => { m.renderOrder = 10; return reg(m, region, G.skin, this.skin); };
    S(ball(0.1, skinMat(), V(0, 1.68, 0), [0.88, 1.12, 1]), 'head');
    S(lathe([[0, 1.43], [0.05, 1.44], [0.045, 1.52], [0.05, 1.58], [0, 1.59]], skinMat()), 'neck');
    const torso = S(lathe([[0, 0.9], [0.135, 0.9], [0.15, 0.95], [0.138, 1.02], [0.134, 1.08], [0.15, 1.16], [0.168, 1.26], [0.176, 1.34], [0.17, 1.4], [0.15, 1.45], [0.09, 1.49], [0.04, 1.5], [0, 1.5]], skinMat()), 'torso'); torso.scale.set(1.1, 1, 0.62);
    const pelvis = S(lathe([[0, 0.78], [0.12, 0.79], [0.155, 0.84], [0.15, 0.9], [0.135, 0.94], [0, 0.95]], skinMat()), 'pelvis'); pelvis.scale.set(1.05, 1, 0.72);
    const ARM = [[0, 0], [0.03, 0.05], [0.15, 0.056], [0.5, 0.048], [0.85, 0.042], [0.97, 0.035], [1, 0]];
    const FORE = [[0, 0], [0.03, 0.038], [0.2, 0.042], [0.6, 0.034], [0.92, 0.026], [1, 0]];
    const LEG = [[0, 0], [0.01, 0.07], [0.06, 0.086], [0.2, 0.082], [0.38, 0.068], [0.47, 0.052], [0.52, 0.05], [0.6, 0.056], [0.68, 0.054], [0.85, 0.037], [0.96, 0.03], [1, 0]];
    for (const s of [1, -1]) {
      const sh = V(0.2 * s, 1.42, 0), el = V(0.245 * s, 1.13, -0.01), wr = V(0.275 * s, 0.86, 0.02);
      const ua = s > 0 ? 'uaL' : 'uaR', fa = s > 0 ? 'faL' : 'faR';
      S(ball(0.064, skinMat(), sh, [1, 0.9, 0.9]), ua);
      S(limbLathe(sh, el, ARM, skinMat()), ua);
      S(limbLathe(el, wr, FORE, skinMat()), fa);
      S(ball(1, skinMat(), V(0.29 * s, 0.79, 0.015), [0.026, 0.07, 0.016]), fa);
      const th = s > 0 ? 'thL' : 'thR', sn = s > 0 ? 'shL' : 'shR';
      S(limbLathe(V(0.085 * s, 0.88, 0), V(0.098 * s, 0.485, 0), [[0, 0], [0.02, 0.07], [0.12, 0.086], [0.4, 0.082], [0.75, 0.068], [0.95, 0.054], [1, 0]], skinMat()), th);
      S(limbLathe(V(0.098 * s, 0.495, 0), V(0.1 * s, 0.07, 0), [[0, 0], [0.03, 0.05], [0.2, 0.056], [0.35, 0.054], [0.7, 0.037], [0.92, 0.03], [1, 0]], skinMat()), sn);
      S(ball(1, skinMat(), V(0.105 * s, 0.03, 0.05), [0.042, 0.03, 0.115]), sn);
    }

    // skeleton
    const B = (m, region) => reg(m, region, G.skel, this.bones);
    B(ball(0.084, boneMat(), V(0, 1.69, -0.005), [0.9, 1.08, 1.02]), 'head');
    B(ball(1, boneMat(), V(0, 1.6, 0.035), [0.05, 0.025, 0.04]), 'head');
    for (let i = 0; i < 26; i++) {
      const t = i / 25, y = 0.9 + t * 0.66, z = -0.06 + 0.022 * Math.sin(t * Math.PI * 2.2 - 0.6);
      const r = 0.022 - t * 0.009, region = y > 1.47 ? 'neck' : 'torso';
      const v = B(new T.Mesh(new T.CylinderGeometry(r, r, 0.017, 14), boneMat()), region); v.position.set(0, y, z);
      const sp = B(new T.Mesh(new T.BoxGeometry(0.008, 0.012, 0.025), boneMat()), region); sp.position.set(0, y - 0.004, z - r - 0.008);
    }
    for (let i = 0; i < 11; i++) {
      const y0 = 1.42 - i * 0.024, rr = 0.1 + 0.045 * Math.sin(Math.PI * (i + 2) / 14);
      for (const s of [1, -1]) {
        const pts = []; const end = i < 7 ? 0.82 : 0.62;
        for (let a = 0; a <= 1.0001; a += 0.1) { const th = -Math.PI / 2 + a * Math.PI * end; pts.push([s * rr * Math.cos(th), y0 - 0.05 * a, 0.62 * rr * Math.sin(th) - 0.02]); }
        B(tube(pts, 0.0055, boneMat()), 'torso');
      }
    }
    B(new T.Mesh(new T.BoxGeometry(0.024, 0.15, 0.01), boneMat()), 'torso').position.set(0, 1.33, 0.085);
    for (const s of [1, -1]) {
      B(tube([[0.02 * s, 1.455, 0.07], [0.1 * s, 1.47, 0.05], [0.19 * s, 1.45, 0]], 0.007, boneMat()), 'torso');
      B(ball(1, boneMat(), V(0.11 * s, 1.36, -0.075), [0.065, 0.08, 0.01]), 'torso');
      B(ball(1, boneMat(), V(0.095 * s, 0.92, -0.01), [0.065, 0.055, 0.025]), 'pelvis').rotation.z = 0.5 * s;
      B(ball(0.027, boneMat(), V(0.088 * s, 0.85, 0.005)), 'pelvis');
      B(rod(V(0.088 * s, 0.85, 0.005), V(0.07 * s, 0.86, 0.0), 0.014, boneMat()), 'pelvis');
      const thB = s > 0 ? 'thL' : 'thR', shB = s > 0 ? 'shL' : 'shR';
      B(rod(V(0.09 * s, 0.84, 0), V(0.1 * s, 0.49, 0), 0.016, boneMat(), 0.014), thB);
      B(ball(1, boneMat(), V(0.1 * s, 0.485, 0), [0.03, 0.022, 0.026]), thB);
      B(ball(0.016, boneMat(), V(0.1 * s, 0.485, 0.035)), thB);
      B(rod(V(0.1 * s, 0.47, 0), V(0.1 * s, 0.085, 0), 0.015, boneMat(), 0.011), shB);
      B(rod(V(0.122 * s, 0.46, -0.01), V(0.12 * s, 0.09, -0.005), 0.007, boneMat()), shB);
      B(ball(1, boneMat(), V(0.105 * s, 0.035, 0.04), [0.03, 0.015, 0.09]), shB);
      const ua = s > 0 ? 'uaL' : 'uaR', fa = s > 0 ? 'faL' : 'faR';
      B(rod(V(0.2 * s, 1.42, 0), V(0.245 * s, 1.135, -0.01), 0.013, boneMat()), ua);
      B(ball(0.026, boneMat(), V(0.2 * s, 1.425, 0)), ua);
      B(rod(V(0.24 * s, 1.125, -0.005), V(0.265 * s, 0.865, 0.03), 0.008, boneMat()), fa);
      B(rod(V(0.255 * s, 1.125, -0.015), V(0.285 * s, 0.865, 0.01), 0.008, boneMat()), fa);
      B(ball(1, boneMat(), V(0.29 * s, 0.8, 0.015), [0.022, 0.05, 0.01]), fa);
    }
    const pring = B(new T.Mesh(new T.TorusGeometry(0.09, 0.022, 12, 40), boneMat()), 'pelvis'); pring.position.set(0, 0.86, 0); pring.rotation.x = Math.PI / 2.4; pring.scale.set(1.15, 0.8, 1);

    // cardiovascular
    const VE = (m, region) => reg(m, region, G.card, this.vessels);
    this.heart = VE(ball(0.05, vesMat(), V(0.025, 1.29, 0.04), [1, 1.18, 0.9]), 'torso'); this.heart.rotation.z = -0.45;
    VE(ball(0.026, vesMat(), V(0.0, 1.33, 0.03)), 'torso');
    const curves = [
      { region: 'torso', r: 0.011, dir: 1, pts: [[0.02, 1.33, 0.03], [0.0, 1.41, 0.0], [-0.02, 1.36, -0.03], [0, 1.15, -0.04], [0, 0.93, -0.02]] },
      { region: 'head', r: 0.007, dir: 1, pts: [[0.02, 1.38, 0], [0.035, 1.52, 0.012], [0.04, 1.62, 0.02], [0.02, 1.72, 0.01]] },
      { region: 'head', r: 0.007, dir: 1, pts: [[-0.02, 1.38, 0], [-0.035, 1.52, 0.012], [-0.04, 1.62, 0.02], [-0.02, 1.72, 0.01]] },
      { region: 'uaL', r: 0.006, dir: 1, pts: [[0.02, 1.4, 0], [0.15, 1.43, 0], [0.23, 1.3, 0], [0.255, 1.1, 0.01], [0.28, 0.85, 0.02]] },
      { region: 'uaR', r: 0.006, dir: 1, pts: [[-0.02, 1.4, 0], [-0.15, 1.43, 0], [-0.23, 1.3, 0], [-0.255, 1.1, 0.01], [-0.28, 0.85, 0.02]] },
      { region: 'thL', r: 0.008, dir: -1, pts: [[0, 0.93, -0.02], [0.08, 0.82, 0.02], [0.1, 0.5, 0.03]] },
      { region: 'thR', r: 0.008, dir: -1, pts: [[0, 0.93, -0.02], [-0.08, 0.82, 0.02], [-0.1, 0.5, 0.03]] },
      { region: 'shL', r: 0.007, dir: -1, pts: [[0.1, 0.5, 0.03], [0.105, 0.3, 0.035], [0.1, 0.12, 0]] },
      { region: 'shR', r: 0.007, dir: -1, pts: [[-0.1, 0.5, 0.03], [-0.105, 0.3, 0.035], [-0.1, 0.12, 0]] },
    ];
    for (const c of curves) {
      const m = VE(tube(c.pts, c.r, vesMat()), c.region);
      const N = 18, pos = new Float32Array(N * 3), g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const pm = new T.PointsMaterial({ size: 0.022, color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, blending: T.AdditiveBlending });
      const p = new T.Points(g, pm); G.card.add(p);
      this.flows.push({ curve: m.userData.curve, pos, g, pm, dir: c.dir, region: c.region, offs: Array.from({ length: N }, (_, i) => i / N) });
    }
    this.brain = reg(ball(0.072, skinMat(), V(0, 1.7, 0), [0.92, 0.95, 1.05]), 'head', G.card, this.dermal);

    // dermal hotspots
    this.rash = reg(ball(0.02, skinMat(), V(0.276, 1.0, 0.035), [1, 1.4, 0.5]), 'faL', G.derm, this.dermal);
    this.halo = reg(ball(0.045, skinMat(), V(0.276, 1.0, 0.03), [1, 1.4, 0.5]), 'faL', G.derm, this.dermal);
    reg(ball(0.04, skinMat(), V(0.07, 1.22, 0.1), [1, 0.8, 0.35]), 'torso', G.derm, this.dermal);

    // platform
    const pmat = () => new T.MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false });
    this.platMats = [];
    const ring = (a, b, len, start) => { const mt = pmat(); this.platMats.push(mt); const m = new T.Mesh(new T.RingGeometry(a, b, 128, 1, start || 0, len || Math.PI * 2), mt); m.rotation.x = -Math.PI / 2; G.plat.add(m); return m; };
    ring(0.42, 0.424); ring(0.56, 0.562); this.arc1 = ring(0.47, 0.49, Math.PI * 0.6); this.arc2 = ring(0.47, 0.49, Math.PI * 0.35, Math.PI);
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; ring(0.6, i % 5 ? 0.615 : 0.635, 0.012, a); }
    const scm = pmat(); scm.opacity = 0.18; this.platMats.push(scm);
    this.scan = new T.Mesh(new T.RingGeometry(0.0, 0.32, 64), scm); this.scan.rotation.x = -Math.PI / 2; this.S.add(this.scan);
    const glowM = pmat(); glowM.opacity = 0.08; this.platMats.push(glowM);
    const disc = new T.Mesh(new T.CircleGeometry(0.42, 64), glowM); disc.rotation.x = -Math.PI / 2; G.plat.add(disc);
  }
  apply() {
    if (!this.ready) return;
    const T = this.T, st = this.st, layer = st.layer || 'skeletal', rp = st.regionPart || {}, parts = st.parts || {};
    const dark = st.mode !== 'light';
    this.G.skel.visible = layer === 'skeletal'; this.G.card.visible = layer === 'cardio'; this.G.derm.visible = layer === 'dermal';
    const status = r => { const p = rp[r]; return p && parts[p] ? parts[p].status : null; };
    this.selRegions = new Set(Object.keys(rp).filter(r => rp[r] === st.sel));
    const xr = (st.xray ?? 70) / 100;
    const base = new T.Color(dark ? '#5b8cff' : '#2f63d6');
    const blend = dark ? T.AdditiveBlending : T.NormalBlending;
    for (const m of this.skin) {
      const s = status(m.userData.region), u = m.material.uniforms;
      u.uColor.value.set(layer === 'dermal' && s ? COL[s] : base);
      u.uOpacity.value = (1 - xr) * (dark ? 0.55 : 0.7) + 0.05;
      if (m.material.blending !== blend) { m.material.blending = blend; m.material.needsUpdate = true; }
    }
    for (const m of this.bones) {
      const s = status(m.userData.region);
      m.material.color.set(s ? (dark ? '#e6ecf5' : '#f2f5fa') : (dark ? '#7f8a9c' : '#b7c0cd'));
      m.material.emissive.set(s ? COL[s] : '#000'); m.material.emissiveIntensity = s ? (s === 'crit' ? 0.85 : 0.55) : 0;
    }
    for (const m of this.vessels) { const s = status(m.userData.region); const c = s ? COL[s] : '#7d8aa6'; m.material.color.set(c); m.material.emissive.set(c); m.material.emissiveIntensity = s ? 0.6 : 0.25; }
    for (const f of this.flows) { const s = status(f.region); f.pm.color.set(s ? COL[s] : '#9fb3d9'); f.pm.blending = blend; f.pm.needsUpdate = true; }
    for (const m of this.dermal) { const s = status(m.userData.region); const u = m.material.uniforms; u.uColor.value.set(s ? COL[s] : base); u.uOpacity.value = m === this.halo ? 0.25 : 0.7; if (m.material.blending !== blend) { m.material.blending = blend; m.material.needsUpdate = true; } }
    for (const m of this.platMats) m.color.set(dark ? '#3b82f6' : '#2f63d6');
    const v = st.view || { n: 0 };
    if (this.viewN !== undefined && v.n !== this.viewN) {
      const g = this.goal;
      if (v.name === 'front') g.th = 0; else if (v.name === 'side') g.th = Math.PI / 2; else if (v.name === 'back') g.th = Math.PI;
      else { g.th = 0.35; g.ph = 1.45; g.r = 5.2; g.ty = 0.92; }
      if (v.name !== 'reset') g.ph = 1.45;
    }
    this.viewN = v.n;
    const key = layer + '.' + st.sel;
    if (this.selKey !== undefined && key !== this.selKey && ANCH[key]) { this.goal.ty = ANCH[key][1] * 0.7 + 0.92 * 0.3; this.goal.r = 3.6; }
    this.selKey = key;
    this.labels(layer, parts, st.sel, dark);
  }
  labels(layer, parts, sel, dark) {
    this.lb.innerHTML = ''; this.lbl = [];
    for (const [pk, p] of Object.entries(parts)) {
      const a = ANCH[layer + '.' + pk]; if (!a || (p.status === 'nom' && pk !== sel)) continue;
      const el = document.createElement('div');
      const c = COL[p.status];
      el.style.cssText = `position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;will-change:transform;font:600 12px/1 'Space Grotesk',system-ui,sans-serif;color:${dark ? '#e8ecf3' : '#0d1220'}`;
      el.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${c};box-shadow:0 0 0 4px ${c}33,0 0 14px ${c}"></span><span style="width:28px;height:1px;background:${c}"></span><span style="padding:6px 10px;border-radius:8px;background:${dark ? 'rgba(8,12,18,.82)' : 'rgba(255,255,255,.92)'};border:1px solid ${pk === sel ? c : (dark ? 'rgba(255,255,255,.12)' : 'rgba(15,23,42,.12)')};backdrop-filter:blur(6px);white-space:nowrap">${p.name} · <span style="color:${c}">${p.label}</span></span>`;
      this.lb.appendChild(el); this.lbl.push({ el, v: new this.T.Vector3(...a) });
    }
    const t = this.tt; t.style.background = dark ? 'rgba(8,12,18,.88)' : 'rgba(255,255,255,.95)'; t.style.color = dark ? '#e8ecf3' : '#0d1220'; t.style.border = `1px solid ${dark ? 'rgba(255,255,255,.12)' : 'rgba(15,23,42,.12)'}`;
  }
  pick(e) {
    const r = this.R.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
    const hit = this.ray.intersectObjects(this.skin, false)[0];
    return hit ? hit.object.userData.region : null;
  }
  bind() {
    const c = this.R.domElement;
    c.addEventListener('pointerdown', e => { this.drag = { x: e.clientX, y: e.clientY, th: this.goal.th, ph: this.goal.ph, moved: 0 }; c.style.cursor = 'grabbing'; this.tt.style.opacity = 0; });
    this.onMove = e => {
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; this.drag.moved = Math.max(this.drag.moved, Math.abs(dx) + Math.abs(dy));
        this.goal.th = this.drag.th - dx * 0.008; this.goal.ph = Math.min(2.3, Math.max(0.55, this.drag.ph - dy * 0.006)); return;
      }
      if (e.target !== c) { if (this.hover) { this.hover = null; this.tt.style.opacity = 0; } return; }
      const region = this.pick(e); this.hover = region;
      const st = this.st, part = region && (st.regionPart || {})[region], p = part && st.parts[part];
      if (!region) { this.tt.style.opacity = 0; c.style.cursor = 'grab'; return; }
      const r = this.getBoundingClientRect();
      this.tt.innerHTML = p ? `<div style="font-weight:700">${p.name}</div><div style="opacity:.8"><span style="color:${COL[p.status]}">●</span> ${p.label} · click to inspect</div>` : `<div style="opacity:.8">Not tracked in this layer</div>`;
      this.tt.style.transform = `translate(${e.clientX - r.left + 14}px,${e.clientY - r.top + 14}px)`; this.tt.style.opacity = 1;
      c.style.cursor = p ? 'pointer' : 'grab';
    };
    this.onUp = e => {
      if (!this.drag) return; const d = this.drag; this.drag = null; c.style.cursor = 'grab';
      if (d.moved < 6 && e.target === c) { const region = this.pick(e), part = region && (this.st.regionPart || {})[region]; if (part) window.dispatchEvent(new CustomEvent('avia-twin-pick', { detail: { part } })); }
    };
    window.addEventListener('pointermove', this.onMove); window.addEventListener('pointerup', this.onUp);
    c.addEventListener('wheel', e => { e.preventDefault(); this.goal.r = Math.min(8, Math.max(2.2, this.goal.r * (1 + e.deltaY * 0.001))); }, { passive: false });
    c.addEventListener('dblclick', () => Object.assign(this.goal, { th: 0.35, ph: 1.45, r: 5.2, ty: 0.92 }));
    c.addEventListener('pointerleave', () => { this.hover = null; this.tt.style.opacity = 0; });
  }
  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const now = performance.now(), t = (now - this.t0) / 1000, dt = Math.min(0.05, (now - (this.last || now)) / 1000); this.last = now;
    const st = this.st, o = this.orb, g = this.goal;
    if (st.auto && !this.drag) g.th += dt * 0.3;
    const k = 1 - Math.exp(-dt * 6); for (const key of ['th', 'ph', 'r', 'ty']) o[key] += (g[key] - o[key]) * k;
    const tgt = new this.T.Vector3(0, o.ty, 0);
    this.cam.position.set(tgt.x + o.r * Math.sin(o.ph) * Math.sin(o.th), tgt.y + o.r * Math.cos(o.ph), tgt.z + o.r * Math.sin(o.ph) * Math.cos(o.th));
    this.cam.lookAt(tgt);
    const ph = (t * (st.hr || 68) / 60) % 1, beat = 1 + 0.12 * Math.exp(-ph * 10) + (ph > 0.2 ? 0.06 * Math.exp(-(ph - 0.2) * 12) : 0);
    this.heart.scale.set(beat, 1.18 * beat, 0.9 * beat);
    for (const f of this.flows) {
      for (let i = 0; i < f.offs.length; i++) {
        let u = (f.offs[i] + t * 0.18 * f.dir) % 1; if (u < 0) u += 1;
        const p = f.curve.getPointAt(u); f.pos[i * 3] = p.x; f.pos[i * 3 + 1] = p.y; f.pos[i * 3 + 2] = p.z;
      }
      f.g.attributes.position.needsUpdate = true;
    }
    const pulse = 1 + 0.25 * Math.sin(t * 3); this.halo.scale.set(pulse, 1.4 * pulse, 0.5 * pulse);
    const sg = 0.55 + 0.45 * Math.sin(t * 4);
    for (const m of this.skin) { const r = m.userData.region; m.material.uniforms.uGlow.value = (this.selRegions && this.selRegions.has(r) ? sg : 0) + (this.hover === r ? 0.5 : 0); }
    this.arc1.rotation.z = t * 0.4; this.arc2.rotation.z = -t * 0.25;
    this.scan.position.y = 0.05 + (Math.sin(t * 0.7) * 0.5 + 0.5) * 1.68;
    if (this.lbl) {
      const r = this.getBoundingClientRect();
      for (const l of this.lbl) { const p = l.v.clone().project(this.cam); l.el.style.transform = `translate(${(p.x * 0.5 + 0.5) * r.width - 5}px,${(-p.y * 0.5 + 0.5) * r.height - 5}px)`; l.el.style.opacity = p.z < 1 ? 1 : 0; }
    }
    this.R.render(this.S, this.cam);
  }
}
customElements.define('avia-twin', AviaTwin);
})();
