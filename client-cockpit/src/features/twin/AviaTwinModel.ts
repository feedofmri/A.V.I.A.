import * as THREE from 'three';

export interface PartData {
  name: string;
  status: 'nom' | 'warn' | 'crit';
  label: string;
}

export interface AviaTwinState {
  layer: 'skeletal' | 'cardio' | 'dermal';
  mode?: 'dark' | 'light';
  regionPart?: Record<string, string>;
  sel?: string | null;
  xray?: number; // 0 to 100
  auto?: boolean;
  hr?: number;
  view?: { name: 'front' | 'side' | 'back' | 'reset'; n: number };
  parts?: Record<string, PartData>;
}

const COL: Record<string, string> = {
  nom: '#5EE0A8',
  warn: '#F5B94A',
  crit: '#FF5C6C',
};
// Additive hologram colors disappear on white; use ink colors and normal
// compositing for light surfaces, while retaining the dark hologram treatment.
const LIGHT_COL: Record<string, string> = {
  nom: '#087F5B',
  warn: '#995400',
  crit: '#BE2345',
};

const ANCH: Record<string, [number, number, number]> = {
  'skeletal.spine': [0, 1.06, -0.06],
  'skeletal.hips': [0.09, 0.85, 0.02],
  'skeletal.legs': [0.1, 0.3, 0.02],
  'cardio.head': [0, 1.7, 0.02],
  'cardio.chest': [0.03, 1.29, 0.06],
  'cardio.legs': [-0.1, 0.36, 0.03],
  'dermal.forearm': [0.272, 1.0, 0.04],
  'dermal.torso': [0.07, 1.22, 0.1],
  'skeletal.skull': [0, 1.74, 0.06],
  'skeletal.cervical': [0, 1.52, -0.03],
  'skeletal.humerus': [0.225, 1.28, 0.02],
  'skeletal.radius': [0.262, 0.98, 0.03],
  'cardio.neck': [0.035, 1.52, 0.03],
  'cardio.arms': [0.24, 1.2, 0.03],
  'cardio.pelvis': [0, 0.88, 0.08],
  'skeletal.femur': [0.1, 0.68, 0.03],
  'cardio.thigh': [-0.1, 0.7, 0.05],
  'dermal.shins': [0.1, 0.28, 0.05],
  'dermal.face': [0, 1.68, 0.09],
  'dermal.arms': [-0.235, 1.25, 0.04],
  'dermal.lower': [-0.1, 0.6, 0.06],
};

const VS = `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FS = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uGlow;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    float a = clamp(uOpacity * (0.35 + f * 1.6) + uGlow * 0.4 * (0.3 + f), 0.0, 1.0);
    vec3 c = uColor * (0.55 + f * 0.9 + uGlow * 0.75);
    gl_FragColor = vec4(c, a);
  }
`;

export class AviaTwinController {
  private get colors() {
    return this.state.mode === 'light' ? LIGHT_COL : COL;
  }
  private container: HTMLElement;
  private state: AviaTwinState;
  private onPick?: (part: string) => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  private orb = { th: 0.35, ph: 1.45, r: 5.2, ty: 0.92 };
  private goal = { ...this.orb };
  private drag: {
    x: number;
    y: number;
    th: number;
    ph: number;
    moved: number;
  } | null = null;
  private hover: string | null = null;
  private raf = 0;
  private events = new AbortController();
  private ro?: ResizeObserver;
  private t0 = performance.now();
  private last = performance.now();
  private viewN?: number;
  private selKey?: string;

  // Groups and objects
  private G = {
    skin: new THREE.Group(),
    skel: new THREE.Group(),
    card: new THREE.Group(),
    derm: new THREE.Group(),
    plat: new THREE.Group(),
  };

  private skinMeshes: THREE.Mesh[] = [];
  private boneMeshes: THREE.Mesh[] = [];
  private vesselMeshes: THREE.Mesh[] = [];
  private flowSystems: {
    curve: THREE.Curve<THREE.Vector3>;
    pos: Float32Array;
    g: THREE.BufferGeometry;
    pm: THREE.PointsMaterial;
    dir: number;
    region: string;
    offs: number[];
  }[] = [];
  private dermalMeshes: THREE.Mesh[] = [];
  private platMats: THREE.MeshBasicMaterial[] = [];
  private heartMesh!: THREE.Mesh;
  private haloMesh!: THREE.Mesh;
  private arc1!: THREE.Mesh;
  private arc2!: THREE.Mesh;
  private scanRing!: THREE.Mesh;
  private tooltipEl!: HTMLElement;
  private labelsContainer!: HTMLElement;
  private labelElements: { el: HTMLElement; v: THREE.Vector3 }[] = [];

  constructor(
    container: HTMLElement,
    state: AviaTwinState,
    onPick?: (part: string) => void,
  ) {
    this.container = container;
    this.state = state;
    this.onPick = onPick;

    this.init();
  }

  private init() {
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';

    // Canvas container
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:absolute;inset:0';
    this.container.appendChild(canvasWrap);

    // Labels container
    this.labelsContainer = document.createElement('div');
    this.labelsContainer.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2';
    this.container.appendChild(this.labelsContainer);

    // Tooltip
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.cssText = `
      position: absolute; left: 0; top: 0; pointer-events: none; opacity: 0;
      transition: opacity 0.15s ease; padding: 8px 12px; border-radius: 9px;
      font: 300 12px/1.4 'Space Grotesk', system-ui, sans-serif;
      white-space: nowrap; z-index: 4; backdrop-filter: blur(12px);
      background: var(--surface-raised); color: var(--text-1);
      border: 1px solid var(--border);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    `;
    this.container.appendChild(this.tooltipEl);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.cssText =
      'display:block;width:100%;height:100%;cursor:grab;touch-action:none';
    canvasWrap.appendChild(this.renderer.domElement);

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.2);
    d1.position.set(2, 4, 3);
    this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x1c4fd7, 0.8);
    d2.position.set(-3, 2, -2);
    this.scene.add(d2);

    Object.values(this.G).forEach((g) => this.scene.add(g));

    this.buildGeometry();
    this.bindEvents();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);
    this.resize();

    this.applyState();
    this.loop();
  }

  private buildGeometry() {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    const skinMat = () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#38BDF8') },
          uOpacity: { value: 0.32 },
          uGlow: { value: 0 },
        },
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

    const boneMat = () =>
      new THREE.MeshStandardMaterial({
        color: '#D9E2EE',
        roughness: 0.45,
        metalness: 0.1,
        emissive: new THREE.Color('#000000'),
        emissiveIntensity: 1,
      });

    const vesMat = () =>
      new THREE.MeshStandardMaterial({
        color: '#7D8AA6',
        roughness: 0.35,
        emissive: new THREE.Color('#7D8AA6'),
        emissiveIntensity: 0.5,
      });

    const reg = (
      m: THREE.Mesh,
      region: string,
      group: THREE.Group,
      list?: THREE.Mesh[],
    ) => {
      m.userData.region = region;
      group.add(m);
      if (list) list.push(m);
      return m;
    };

    const lathe = (pts: [number, number][], mat: THREE.Material) =>
      new THREE.Mesh(
        new THREE.LatheGeometry(
          pts.map((p) => new THREE.Vector2(p[0], p[1])),
          40,
        ),
        mat,
      );

    const limbLathe = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      prof: [number, number][],
      mat: THREE.Material,
    ) => {
      const L = a.distanceTo(b);
      const m = new THREE.Mesh(
        new THREE.LatheGeometry(
          prof.map(([t, r]) => new THREE.Vector2(r, -L / 2 + t * L)),
          32,
        ),
        mat,
      );
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      return m;
    };

    const rod = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      r: number,
      mat: THREE.Material,
      r2?: number,
    ) => {
      const L = a.distanceTo(b);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r2 ?? r, r, L, 14),
        mat,
      );
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      return m;
    };

    const ball = (
      r: number,
      mat: THREE.Material,
      p: THREE.Vector3,
      s?: [number, number, number],
    ) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat);
      m.position.copy(p);
      if (s) m.scale.set(...s);
      return m;
    };

    const tube = (
      pts: [number, number, number][],
      r: number,
      mat: THREE.Material,
    ) => {
      const c = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)));
      const m = new THREE.Mesh(
        new THREE.TubeGeometry(c, 64, r, 10, false),
        mat,
      );
      m.userData.curve = c;
      return m;
    };

    // ── 1. Holographic Organic Skin / Silhouette ────────────────
    const S = (m: THREE.Mesh, region: string) => {
      m.renderOrder = 10;
      return reg(m, region, this.G.skin, this.skinMeshes);
    };

    S(ball(0.1, skinMat(), V(0, 1.68, 0), [0.88, 1.12, 1]), 'head');
    S(
      lathe(
        [
          [0, 1.43],
          [0.05, 1.44],
          [0.045, 1.52],
          [0.05, 1.58],
          [0, 1.59],
        ],
        skinMat(),
      ),
      'neck',
    );

    const torso = S(
      lathe(
        [
          [0, 0.9],
          [0.135, 0.9],
          [0.15, 0.95],
          [0.138, 1.02],
          [0.134, 1.08],
          [0.15, 1.16],
          [0.168, 1.26],
          [0.176, 1.34],
          [0.17, 1.4],
          [0.15, 1.45],
          [0.09, 1.49],
          [0.04, 1.5],
          [0, 1.5],
        ],
        skinMat(),
      ),
      'torso',
    );
    torso.scale.set(1.1, 1, 0.62);

    const pelvis = S(
      lathe(
        [
          [0, 0.78],
          [0.12, 0.79],
          [0.155, 0.84],
          [0.15, 0.9],
          [0.135, 0.94],
          [0, 0.95],
        ],
        skinMat(),
      ),
      'pelvis',
    );
    pelvis.scale.set(1.05, 1, 0.72);

    const ARM: [number, number][] = [
      [0, 0],
      [0.03, 0.05],
      [0.15, 0.056],
      [0.5, 0.048],
      [0.85, 0.042],
      [0.97, 0.035],
      [1, 0],
    ];
    const FORE: [number, number][] = [
      [0, 0],
      [0.03, 0.038],
      [0.2, 0.042],
      [0.6, 0.034],
      [0.92, 0.026],
      [1, 0],
    ];

    for (const s of [1, -1]) {
      const sh = V(0.2 * s, 1.42, 0);
      const el = V(0.245 * s, 1.13, -0.01);
      const wr = V(0.275 * s, 0.86, 0.02);
      const ua = s > 0 ? 'uaL' : 'uaR';
      const fa = s > 0 ? 'faL' : 'faR';

      S(ball(0.064, skinMat(), sh, [1, 0.9, 0.9]), ua);
      S(limbLathe(sh, el, ARM, skinMat()), ua);
      S(limbLathe(el, wr, FORE, skinMat()), fa);
      S(ball(1, skinMat(), V(0.29 * s, 0.79, 0.015), [0.026, 0.07, 0.016]), fa);

      const th = s > 0 ? 'thL' : 'thR';
      const sn = s > 0 ? 'shL' : 'shR';

      S(
        limbLathe(
          V(0.085 * s, 0.88, 0),
          V(0.098 * s, 0.485, 0),
          [
            [0, 0],
            [0.02, 0.07],
            [0.12, 0.086],
            [0.4, 0.082],
            [0.75, 0.068],
            [0.95, 0.054],
            [1, 0],
          ],
          skinMat(),
        ),
        th,
      );
      S(
        limbLathe(
          V(0.098 * s, 0.495, 0),
          V(0.1 * s, 0.07, 0),
          [
            [0, 0],
            [0.03, 0.05],
            [0.2, 0.056],
            [0.35, 0.054],
            [0.7, 0.037],
            [0.92, 0.03],
            [1, 0],
          ],
          skinMat(),
        ),
        sn,
      );
      S(ball(1, skinMat(), V(0.105 * s, 0.03, 0.05), [0.042, 0.03, 0.115]), sn);
    }

    // ── 2. Anatomical Human Skeleton ──────────────────────────
    const B = (m: THREE.Mesh, region: string) =>
      reg(m, region, this.G.skel, this.boneMeshes);

    B(ball(0.084, boneMat(), V(0, 1.69, -0.005), [0.9, 1.08, 1.02]), 'head');
    B(ball(1, boneMat(), V(0, 1.6, 0.035), [0.05, 0.025, 0.04]), 'head');

    // 26 articulated vertebrae
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const y = 0.9 + t * 0.66;
      const z = -0.06 + 0.022 * Math.sin(t * Math.PI * 2.2 - 0.6);
      const r = 0.022 - t * 0.009;
      const region = y > 1.47 ? 'neck' : 'torso';
      const v = B(
        new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.017, 14), boneMat()),
        region,
      );
      v.position.set(0, y, z);
      const sp = B(
        new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.025), boneMat()),
        region,
      );
      sp.position.set(0, y - 0.004, z - r - 0.008);
    }

    // 11 curving rib cage tubes
    for (let i = 0; i < 11; i++) {
      const y0 = 1.42 - i * 0.024;
      const rr = 0.1 + 0.045 * Math.sin((Math.PI * (i + 2)) / 14);
      for (const s of [1, -1]) {
        const pts: [number, number, number][] = [];
        const end = i < 7 ? 0.82 : 0.62;
        for (let a = 0; a <= 1.0001; a += 0.1) {
          const th = -Math.PI / 2 + a * Math.PI * end;
          pts.push([
            s * rr * Math.cos(th),
            y0 - 0.05 * a,
            0.62 * rr * Math.sin(th) - 0.02,
          ]);
        }
        B(tube(pts, 0.0055, boneMat()), 'torso');
      }
    }

    B(
      new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.15, 0.01), boneMat()),
      'torso',
    ).position.set(0, 1.33, 0.085);

    // Clavicles, Pelvis, Limbs bones
    for (const s of [1, -1]) {
      B(
        tube(
          [
            [0.02 * s, 1.455, 0.07],
            [0.1 * s, 1.47, 0.05],
            [0.19 * s, 1.45, 0],
          ],
          0.007,
          boneMat(),
        ),
        'torso',
      );
      B(
        ball(1, boneMat(), V(0.11 * s, 1.36, -0.075), [0.065, 0.08, 0.01]),
        'torso',
      );
      B(
        ball(1, boneMat(), V(0.095 * s, 0.92, -0.01), [0.065, 0.055, 0.025]),
        'pelvis',
      ).rotation.z = 0.5 * s;
      B(ball(0.027, boneMat(), V(0.088 * s, 0.85, 0.005)), 'pelvis');
      B(
        rod(
          V(0.088 * s, 0.85, 0.005),
          V(0.07 * s, 0.86, 0.0),
          0.014,
          boneMat(),
        ),
        'pelvis',
      );

      const thB = s > 0 ? 'thL' : 'thR';
      const shB = s > 0 ? 'shL' : 'shR';

      B(
        rod(V(0.09 * s, 0.84, 0), V(0.1 * s, 0.49, 0), 0.016, boneMat(), 0.014),
        thB,
      );
      B(ball(1, boneMat(), V(0.1 * s, 0.485, 0), [0.03, 0.022, 0.026]), thB);
      B(ball(0.016, boneMat(), V(0.1 * s, 0.485, 0.035)), thB);
      B(
        rod(V(0.1 * s, 0.47, 0), V(0.1 * s, 0.085, 0), 0.015, boneMat(), 0.011),
        shB,
      );
      B(
        rod(
          V(0.122 * s, 0.46, -0.01),
          V(0.12 * s, 0.09, -0.005),
          0.007,
          boneMat(),
        ),
        shB,
      );
      B(
        ball(1, boneMat(), V(0.105 * s, 0.035, 0.04), [0.03, 0.015, 0.09]),
        shB,
      );

      const ua = s > 0 ? 'uaL' : 'uaR';
      const fa = s > 0 ? 'faL' : 'faR';

      B(
        rod(V(0.2 * s, 1.42, 0), V(0.245 * s, 1.135, -0.01), 0.013, boneMat()),
        ua,
      );
      B(ball(0.026, boneMat(), V(0.2 * s, 1.425, 0)), ua);
      B(
        rod(
          V(0.24 * s, 1.125, -0.005),
          V(0.265 * s, 0.865, 0.03),
          0.008,
          boneMat(),
        ),
        fa,
      );
      B(
        rod(
          V(0.255 * s, 1.125, -0.015),
          V(0.285 * s, 0.865, 0.01),
          0.008,
          boneMat(),
        ),
        fa,
      );
      B(ball(1, boneMat(), V(0.29 * s, 0.8, 0.015), [0.022, 0.05, 0.01]), fa);
    }

    const pring = B(
      new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 12, 40), boneMat()),
      'pelvis',
    );
    pring.position.set(0, 0.86, 0);
    pring.rotation.x = Math.PI / 2.4;
    pring.scale.set(1.15, 0.8, 1);

    // ── 3. Cardiovascular Vascular Trees & Beating Heart ──────
    const VE = (m: THREE.Mesh, region: string) =>
      reg(m, region, this.G.card, this.vesselMeshes);

    this.heartMesh = VE(
      ball(0.05, vesMat(), V(0.025, 1.29, 0.04), [1, 1.18, 0.9]),
      'torso',
    );
    this.heartMesh.rotation.z = -0.45;
    VE(ball(0.026, vesMat(), V(0.0, 1.33, 0.03)), 'torso');

    const curves = [
      {
        region: 'torso',
        r: 0.011,
        dir: 1,
        pts: [
          [0.02, 1.33, 0.03],
          [0.0, 1.41, 0.0],
          [-0.02, 1.36, -0.03],
          [0, 1.15, -0.04],
          [0, 0.93, -0.02],
        ] as [number, number, number][],
      },
      {
        region: 'head',
        r: 0.007,
        dir: 1,
        pts: [
          [0.02, 1.38, 0],
          [0.035, 1.52, 0.012],
          [0.04, 1.62, 0.02],
          [0.02, 1.72, 0.01],
        ] as [number, number, number][],
      },
      {
        region: 'head',
        r: 0.007,
        dir: 1,
        pts: [
          [-0.02, 1.38, 0],
          [-0.035, 1.52, 0.012],
          [-0.04, 1.62, 0.02],
          [-0.02, 1.72, 0.01],
        ] as [number, number, number][],
      },
      {
        region: 'uaL',
        r: 0.006,
        dir: 1,
        pts: [
          [0.02, 1.4, 0],
          [0.15, 1.43, 0],
          [0.23, 1.3, 0],
          [0.255, 1.1, 0.01],
          [0.28, 0.85, 0.02],
        ] as [number, number, number][],
      },
      {
        region: 'uaR',
        r: 0.006,
        dir: 1,
        pts: [
          [-0.02, 1.4, 0],
          [-0.15, 1.43, 0],
          [-0.23, 1.3, 0],
          [-0.255, 1.1, 0.01],
          [-0.28, 0.85, 0.02],
        ] as [number, number, number][],
      },
      {
        region: 'thL',
        r: 0.008,
        dir: -1,
        pts: [
          [0, 0.93, -0.02],
          [0.08, 0.82, 0.02],
          [0.1, 0.5, 0.03],
        ] as [number, number, number][],
      },
      {
        region: 'thR',
        r: 0.008,
        dir: -1,
        pts: [
          [0, 0.93, -0.02],
          [-0.08, 0.82, 0.02],
          [-0.1, 0.5, 0.03],
        ] as [number, number, number][],
      },
      {
        region: 'shL',
        r: 0.007,
        dir: -1,
        pts: [
          [0.1, 0.5, 0.03],
          [0.105, 0.3, 0.035],
          [0.1, 0.12, 0],
        ] as [number, number, number][],
      },
      {
        region: 'shR',
        r: 0.007,
        dir: -1,
        pts: [
          [-0.1, 0.5, 0.03],
          [-0.105, 0.3, 0.035],
          [-0.1, 0.12, 0],
        ] as [number, number, number][],
      },
    ];

    for (const c of curves) {
      const m = VE(tube(c.pts, c.r, vesMat()), c.region);
      const N = 18;
      const pos = new Float32Array(N * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pm = new THREE.PointsMaterial({
        size: 0.022,
        color: '#FFFFFF',
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const p = new THREE.Points(g, pm);
      this.G.card.add(p);
      this.flowSystems.push({
        curve: m.userData.curve,
        pos,
        g,
        pm,
        dir: c.dir,
        region: c.region,
        offs: Array.from({ length: N }, (_, i) => i / N),
      });
    }

    reg(
      ball(0.072, skinMat(), V(0, 1.7, 0), [0.92, 0.95, 1.05]),
      'head',
      this.G.card,
      this.dermalMeshes,
    );

    // ── 4. Dermal Hotspots ────────────────────────────────────
    reg(
      ball(0.02, skinMat(), V(0.276, 1.0, 0.035), [1, 1.4, 0.5]),
      'faL',
      this.G.derm,
      this.dermalMeshes,
    );
    this.haloMesh = reg(
      ball(0.045, skinMat(), V(0.276, 1.0, 0.03), [1, 1.4, 0.5]),
      'faL',
      this.G.derm,
      this.dermalMeshes,
    );
    reg(
      ball(0.04, skinMat(), V(0.07, 1.22, 0.1), [1, 0.8, 0.35]),
      'torso',
      this.G.derm,
      this.dermalMeshes,
    );

    // ── 5. Holographic Bio-Platform Pedestal ──────────────────
    const pmat = () =>
      new THREE.MeshBasicMaterial({
        color: '#1C4FD7',
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

    const ring = (a: number, b: number, len?: number, start?: number) => {
      const mt = pmat();
      this.platMats.push(mt);
      const m = new THREE.Mesh(
        new THREE.RingGeometry(a, b, 128, 1, start || 0, len || Math.PI * 2),
        mt,
      );
      m.rotation.x = -Math.PI / 2;
      this.G.plat.add(m);
      return m;
    };

    ring(0.42, 0.424);
    ring(0.56, 0.562);
    this.arc1 = ring(0.47, 0.49, Math.PI * 0.6);
    this.arc2 = ring(0.47, 0.49, Math.PI * 0.35, Math.PI);

    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      ring(0.6, i % 5 ? 0.615 : 0.635, 0.012, a);
    }

    const scm = pmat();
    scm.opacity = 0.22;
    this.platMats.push(scm);
    this.scanRing = new THREE.Mesh(new THREE.RingGeometry(0.0, 0.32, 64), scm);
    this.scanRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.scanRing);

    const glowM = pmat();
    glowM.opacity = 0.09;
    this.platMats.push(glowM);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 64), glowM);
    disc.rotation.x = -Math.PI / 2;
    this.G.plat.add(disc);
  }

  public update(newState: Partial<AviaTwinState>) {
    Object.assign(this.state, newState);
    this.applyState();
  }

  private applyState() {
    const st = this.state;
    const light = st.mode === 'light';
    const layer = st.layer || 'skeletal';
    const rp = st.regionPart || {};
    const parts = st.parts || {};

    this.G.skel.visible = layer === 'skeletal';
    this.G.card.visible = layer === 'cardio';
    this.G.derm.visible = layer === 'dermal';

    const getStatus = (r: string) => {
      const p = rp[r];
      return p && parts[p] ? parts[p].status : null;
    };

    const selRegions = new Set(Object.keys(rp).filter((r) => rp[r] === st.sel));
    const xr = (st.xray ?? 70) / 100;
    const baseColor = new THREE.Color(light ? '#245986' : '#38BDF8');

    for (const m of this.skinMeshes) {
      const s = getStatus(m.userData.region);
      const mat = m.material as THREE.ShaderMaterial;
      const u = mat.uniforms;
      mat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      u.uColor.value.set(layer === 'dermal' && s ? this.colors[s] : baseColor);
      u.uOpacity.value = light ? (1 - xr) * 0.55 + 0.28 : (1 - xr) * 0.55 + 0.05;
    }

    for (const m of this.boneMeshes) {
      const s = getStatus(m.userData.region);
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.color.set(light ? (s ? this.colors[s] : '#40516B') : (s ? '#E6ECF5' : '#7F8A9C'));
      mat.emissive.set(s ? this.colors[s] : '#000000');
      mat.emissiveIntensity = light ? 0 : s ? (s === 'crit' ? 0.85 : 0.55) : 0;
    }

    for (const m of this.vesselMeshes) {
      const s = getStatus(m.userData.region);
      const c = s ? this.colors[s] : light ? '#40516B' : '#7D8AA6';
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.color.set(c);
      mat.emissive.set(c);
      mat.emissiveIntensity = light ? 0 : s ? 0.6 : 0.25;
    }

    for (const f of this.flowSystems) {
      const s = getStatus(f.region);
      f.pm.color.set(s ? this.colors[s] : light ? '#245986' : '#CBE2FE');
      f.pm.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    }

    for (const m of this.dermalMeshes) {
      const s = getStatus(m.userData.region);
      const mat = m.material as THREE.ShaderMaterial;
      const u = mat.uniforms;
      mat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      u.uColor.value.set(s ? this.colors[s] : baseColor);
      u.uOpacity.value = m === this.haloMesh ? 0.25 : 0.7;
    }

    const v = st.view || { name: 'front', n: 0 };
    if (this.viewN !== undefined && v.n !== this.viewN) {
      const g = this.goal;
      if (v.name === 'front') g.th = 0;
      else if (v.name === 'side') g.th = Math.PI / 2;
      else if (v.name === 'back') g.th = Math.PI;
      else {
        g.th = 0.35;
        g.ph = 1.45;
        g.r = 5.2;
        g.ty = 0.92;
      }
      if (v.name !== 'reset') g.ph = 1.45;
    }
    this.viewN = v.n;

    const key = layer + '.' + st.sel;
    if (this.selKey !== undefined && key !== this.selKey && ANCH[key]) {
      this.goal.ty = ANCH[key][1] * 0.7 + 0.92 * 0.3;
      this.goal.r = 3.8;
    }
    this.selKey = key;

    this.renderLabels(layer, parts, st.sel);
  }

  private renderLabels(
    layer: string,
    parts: Record<string, PartData>,
    sel?: string | null,
  ) {
    this.labelsContainer.innerHTML = '';
    this.labelElements = [];

    for (const [pk, p] of Object.entries(parts)) {
      const a = ANCH[layer + '.' + pk];
      if (!a || (p.status === 'nom' && pk !== sel)) continue;

      const el = document.createElement('div');
      const c = this.colors[p.status];
      el.style.cssText = `
        position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 8px;
        will-change: transform; font: 300 11px/1 'Space Grotesk', system-ui, sans-serif;
        color: var(--text-1);
      `;
      el.innerHTML = `
        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${c}; box-shadow: 0 0 10px ${c}"></span>
        <span style="width: 24px; height: 1px; background: ${c}"></span>
        <span style="padding: 5px 10px; border-radius: 8px; background: var(--surface-raised); border: 1px solid ${pk === sel ? c : 'var(--border)'}; backdrop-filter: blur(8px); white-space: nowrap; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
          ${p.name} · <span style="color: ${c}">${p.label}</span>
        </span>
      `;
      this.labelsContainer.appendChild(el);
      this.labelElements.push({ el, v: new THREE.Vector3(...a) });
    }
  }

  private pick(e: PointerEvent): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.skinMeshes, false)[0];
    return hit ? (hit.object.userData.region as string) : null;
  }

  private bindEvents() {
    const c = this.renderer.domElement;

    c.addEventListener('pointerdown', (e) => {
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        th: this.goal.th,
        ph: this.goal.ph,
        moved: 0,
      };
      c.style.cursor = 'grabbing';
      this.tooltipEl.style.opacity = '0';
    });

    const onMove = (e: PointerEvent) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.drag.moved = Math.max(
          this.drag.moved,
          Math.abs(dx) + Math.abs(dy),
        );
        this.goal.th = this.drag.th - dx * 0.008;
        this.goal.ph = Math.min(2.3, Math.max(0.55, this.drag.ph - dy * 0.006));
        return;
      }

      if (e.target !== c) {
        if (this.hover) {
          this.hover = null;
          this.tooltipEl.style.opacity = '0';
        }
        return;
      }

      const region = this.pick(e);
      this.hover = region;
      const st = this.state;
      const part = region && (st.regionPart || {})[region];
      const p = part && (st.parts || {})[part];

      if (!region) {
        this.tooltipEl.style.opacity = '0';
        c.style.cursor = 'grab';
        return;
      }

      const r = this.container.getBoundingClientRect();
      this.tooltipEl.innerHTML = p
        ? `<div style="font-weight: 500">${p.name}</div><div style="opacity: 0.85"><span style="color: ${this.colors[p.status]}">●</span> ${p.label} · click to inspect</div>`
        : `<div style="opacity: 0.8">Region: ${region.toUpperCase()}</div>`;
      this.tooltipEl.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
      this.tooltipEl.style.opacity = '1';
      c.style.cursor = p ? 'pointer' : 'grab';
    };

    const onUp = (e: PointerEvent) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      c.style.cursor = 'grab';

      if (d.moved < 6 && e.target === c) {
        const region = this.pick(e);
        const part = region && (this.state.regionPart || {})[region];
        if (part && this.onPick) {
          this.onPick(part);
        }
      }
    };

    window.addEventListener('pointermove', onMove, {
      signal: this.events.signal,
    });
    window.addEventListener('pointerup', onUp, { signal: this.events.signal });

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.goal.r = Math.min(
          8,
          Math.max(2.2, this.goal.r * (1 + e.deltaY * 0.001)),
        );
      },
      { passive: false },
    );

    c.addEventListener('dblclick', () => {
      Object.assign(this.goal, { th: 0.35, ph: 1.45, r: 5.2, ty: 0.92 });
    });

    c.addEventListener('pointerleave', () => {
      this.hover = null;
      this.tooltipEl.style.opacity = '0';
    });
  }

  private resize() {
    const r = this.container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }

  private loop() {
    this.raf = requestAnimationFrame(() => this.loop());

    const now = performance.now();
    const t = (now - this.t0) / 1000;
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;

    const st = this.state;
    const o = this.orb;
    const g = this.goal;

    if (st.auto && !this.drag) g.th += dt * 0.25;

    const k = 1 - Math.exp(-dt * 6);
    for (const key of ['th', 'ph', 'r', 'ty'] as const) {
      o[key] += (g[key] - o[key]) * k;
    }

    const tgt = new THREE.Vector3(0, o.ty, 0);
    this.camera.position.set(
      tgt.x + o.r * Math.sin(o.ph) * Math.sin(o.th),
      tgt.y + o.r * Math.cos(o.ph),
      tgt.z + o.r * Math.sin(o.ph) * Math.cos(o.th),
    );
    this.camera.lookAt(tgt);

    // Anatomical Heart pulse
    if (this.heartMesh) {
      const ph = ((t * (st.hr || 68)) / 60) % 1;
      const beat =
        1 +
        0.12 * Math.exp(-ph * 10) +
        (ph > 0.2 ? 0.06 * Math.exp(-(ph - 0.2) * 12) : 0);
      this.heartMesh.scale.set(beat, 1.18 * beat, 0.9 * beat);
    }

    // Blood stream flowing particle paths
    for (const f of this.flowSystems) {
      for (let i = 0; i < f.offs.length; i++) {
        let u = (f.offs[i] + t * 0.18 * f.dir) % 1;
        if (u < 0) u += 1;
        const p = f.curve.getPointAt(u);
        f.pos[i * 3] = p.x;
        f.pos[i * 3 + 1] = p.y;
        f.pos[i * 3 + 2] = p.z;
      }
      f.g.attributes.position.needsUpdate = true;
    }

    if (this.haloMesh) {
      const pulse = 1 + 0.25 * Math.sin(t * 3);
      this.haloMesh.scale.set(pulse, 1.4 * pulse, 0.5 * pulse);
    }

    const sg = 0.55 + 0.45 * Math.sin(t * 4);
    const selRegions = new Set(
      Object.keys(st.regionPart || {}).filter(
        (r) => (st.regionPart || {})[r] === st.sel,
      ),
    );

    for (const m of this.skinMeshes) {
      const r = m.userData.region;
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uGlow.value =
        (selRegions.has(r) ? sg : 0) + (this.hover === r ? 0.5 : 0);
    }

    if (this.arc1) this.arc1.rotation.z = t * 0.4;
    if (this.arc2) this.arc2.rotation.z = -t * 0.25;
    if (this.scanRing)
      this.scanRing.position.y = 0.05 + (Math.sin(t * 0.7) * 0.5 + 0.5) * 1.68;

    if (this.labelElements.length > 0) {
      const r = this.container.getBoundingClientRect();
      for (const l of this.labelElements) {
        const p = l.v.clone().project(this.camera);
        l.el.style.transform = `translate(${(p.x * 0.5 + 0.5) * r.width - 5}px, ${(-p.y * 0.5 + 0.5) * r.height - 5}px)`;
        l.el.style.opacity = p.z < 1 ? '1' : '0';
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  public destroy() {
    this.events.abort();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach((m) => m?.dispose());
    });
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.container.innerHTML = '';
  }
}
