// Cartoon pond: Clawd sits on a log and fishes, driven by the server's state.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { fishColor } from "./fish.js";

const S = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const ease = (t) => t * t * (3 - 2 * t);

const WATER_Y = -0.3;
const SEAT = new THREE.Vector3(0, 0, 1.6);
const POND = new THREE.Vector2(0.5, 7.6);
const TARGET = new THREE.Vector3(0.8, WATER_Y, 5.6);
const ORBIT = new THREE.Vector3(0.3, 0, SEAT.z + 2);
const SUN_DIR = new THREE.Vector3(-0.5, 0.75, 0.6).normalize();
const INK = "#1b1b1b";

// Deterministic random so the scenery is the same on every load.
let seed = 1337;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const range = (a, b) => a + rand() * (b - a);
const pickOf = (arr) => arr[(rand() * arr.length) | 0];

// Pond outline: a wobbly circle. Kept in sync with the water shader below.
const pondR = (a) => 5.2 + 0.6 * Math.sin(3 * a + 1) + 0.3 * Math.sin(5 * a);
const pondD = (x, z) => {
  const dx = x - POND.x, dz = z - POND.y;
  return Math.hypot(dx, dz) / pondR(Math.atan2(dz, dx));
};

export function groundH(x, z) {
  const calm = S(Math.hypot(x, z - SEAT.z), 2.5, 9);
  const n = (Math.sin(x * 0.27 + z * 0.19) * 0.35 + Math.sin(x * 0.7 - z * 0.5) * 0.15) * calm;
  const bank = S(pondD(x, z), 0.85, 1.15);
  const r = Math.hypot(x - ORBIT.x, z - ORBIT.z);
  const hills = S(r, 26, 90) * (3 + 6 * Math.sin(Math.atan2(z - ORBIT.z, x - ORBIT.x) * 3 + 1) ** 2);
  return lerp(-1.1, 0.1 + n, bank) + hills;
}

// Three hard light steps instead of smooth shading.
const RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: RAMP, ...extra });
const noOutline = (m) => { m.userData.outlineParameters = { visible: false }; return m; };
const outline = (m, thickness) => { m.userData.outlineParameters = { thickness }; return m; };
const shadows = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

// Sways grass and reeds; the higher a vertex, the more it moves.
function addWind(material, uniforms, strength) {
  material.onBeforeCompile = (s) => {
    s.uniforms.uTime = uniforms.uTime;
    s.vertexShader = "uniform float uTime;\n" + s.vertexShader.replace("#include <begin_vertex>", `
      #include <begin_vertex>
      vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float k = position.y * position.y * ${strength.toFixed(3)};
      transformed.x += sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.25) * k;
      transformed.z += cos(uTime * 1.2 + ip.x * 0.2) * k * 0.45;`);
  };
  return material;
}

export function makeFish(name, size = 1) {
  const color = new THREE.Color(fishColor(name));
  const g = new THREE.Group();
  const skin = outline(toon(color), 0.006);
  const belly = noOutline(toon(color.clone().lerp(new THREE.Color("#fff6d8"), 0.65)));
  const fin = outline(toon(color.clone().offsetHSL(0.04, 0, -0.12), { side: THREE.DoubleSide }), 0.006);

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin);
  body.scale.set(0.3, 0.14, 0.08);
  const under = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), belly);
  under.scale.set(0.24, 0.085, 0.07);
  under.position.set(0.02, -0.04, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.18, 3), fin);
  tail.rotation.z = Math.PI / 2;
  tail.scale.z = 0.3;
  tail.position.x = -0.34;
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.13, 3), fin);
  dorsal.scale.z = 0.25;
  dorsal.position.set(0.0, 0.15, 0);
  dorsal.rotation.z = -0.5;
  const white = outline(toon("#ffffff"), 0.004);
  const black = noOutline(new THREE.MeshBasicMaterial({ color: INK }));
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), white);
    eye.position.set(0.19, 0.04, 0.055 * s);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), black);
    pupil.position.set(0.215, 0.045, 0.085 * s);
    g.add(eye, pupil);
  }
  g.add(body, under, tail, dorsal);
  g.userData.tail = tail;
  g.scale.setScalar(size);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function buildClawd() {
  const root = new THREE.Group();
  const orange = outline(toon("#e8835f"), 0.005);
  const dark = noOutline(new THREE.MeshBasicMaterial({ color: INK }));
  const glint = noOutline(new THREE.MeshBasicMaterial({ color: "#ffffff" }));

  const body = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.92, 0.85, 6, 0.13), orange);
  body.position.y = 0.46;
  root.add(body);

  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(0.25 * s, 0.6, 0.43);
    const ball = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.27, 0.04, 3, 0.02), dark);
    const g1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.01), glint);
    g1.position.set(0.024, 0.075, 0.022);
    const g2 = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.025, 0.01), glint);
    g2.position.set(-0.026, -0.065, 0.022);
    eye.add(ball, g1, g2);
    root.add(eye);
    eyes.push(eye);
  }

  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.63 * s, 0.45, 0.05);
    const nub = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.2, 0.3, 3, 0.05), orange);
    nub.position.x = 0.12 * s;
    pivot.add(nub);
    root.add(pivot);
    arms.push(pivot);
  }

  const legs = [];
  for (const x of [-0.45, -0.17, 0.17, 0.45]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.1, 0.36);
    const leg = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.36, 0.2, 3, 0.04), orange);
    leg.position.y = -0.15;
    pivot.add(leg);
    root.add(pivot);
    legs.push(pivot);
  }

  // Bucket hat with a fishing fly tucked into the band.
  const hat = new THREE.Group();
  hat.position.set(0, 0.93, -0.02);
  hat.rotation.set(-0.06, 0, 0.08);
  const cloth = outline(toon("#8a9a4b"), 0.005);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.47, 0.3, 40), cloth);
  crown.position.y = 0.15;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.4, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), cloth);
  top.scale.y = 0.2;
  top.position.y = 0.3;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.75, 0.04, 48), cloth);
  brim.position.y = 0.01;
  brim.rotation.x = 0.05;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.475, 0.08, 40), noOutline(toon("#c0392b")));
  band.position.y = 0.06;
  const fly = new THREE.Group();
  fly.position.set(0.3, 0.1, 0.37);
  const fluff = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), outline(toon("#ffd23f"), 0.004));
  fluff.rotation.z = 1.1;
  fly.add(fluff);
  hat.add(crown, top, brim, band, fly);
  root.add(hat);

  shadows(root);
  return { root, body, eyes, arms, legs, hat, skin: orange };
}

// Teardrop flame: round at the base, licking up to a point.
const FLAME_GEO = (() => {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const y = i / 14;
    const r = y < 0.3 ? Math.sin((y / 0.3) * Math.PI / 2) : (1 - (y - 0.3) / 0.7) ** 1.4;
    pts.push(new THREE.Vector2(Math.max(r, 0.001) * 0.5, y));
  }
  return new THREE.LatheGeometry(pts, 12);
})();

// Turbo look: flame tongues all over Clawd's body plus rising embers. Math.random,
// not rand(), so the scenery stays the same on every load.
function buildFire() {
  const group = new THREE.Group();
  const mats = ["#ff3d1f", "#ff8f1f", "#ffe04d"].map((c) => noOutline(new THREE.MeshBasicMaterial({ color: c })));
  const tongues = [];
  // Red outside, then orange, then a yellow core, each pushed a bit further out so all three show.
  const add = (x, y, z, size, lx, lz, ox, oz) => mats.forEach((m, layer) => {
    const f = new THREE.Mesh(FLAME_GEO, m);
    f.position.set(x + ox * layer * 0.05, y, z + oz * layer * 0.05);
    f.userData = {
      w: size * (1 - layer * 0.3), h: size * (2.2 - layer * 0.55), lx, lz,
      phase: Math.random() * 10, speed: 9 + Math.random() * 6,
    };
    group.add(f);
    tongues.push(f);
  });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
    const ox = Math.cos(a), oz = Math.sin(a);
    if (oz > 0.6 && Math.abs(ox) < 0.55) continue; // keep the face clear
    add(ox * 0.6, 0.12 + Math.random() * 0.55, oz * 0.4, 0.26 + Math.random() * 0.1, oz * 0.35, -ox * 0.35, ox, oz);
  }
  for (const [x, z] of [[-0.5, -0.2], [-0.25, -0.3], [0, -0.32], [0.25, -0.3], [0.5, -0.2], [-0.55, 0.15], [0.55, 0.15]])
    add(x, 0.82, z, 0.36 + Math.random() * 0.1, 0, -x * 0.25, 0, -0.4);

  const EMBERS = 50;
  const pos = new Float32Array(EMBERS * 3);
  const vel = new Float32Array(EMBERS);
  const spawn = (i, y = 0.4 + Math.random() * 1.6) => {
    const a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * 0.6 * Math.random();
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(a) * 0.4 * Math.random();
    vel[i] = 0.8 + Math.random() * 1.1;
  };
  for (let i = 0; i < EMBERS; i++) spawn(i);
  const emberGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({ color: "#ffc04d", size: 0.07 }));
  embers.frustumCulled = false;
  group.add(embers);

  const update = (t, dt, k) => {
    group.visible = k > 0.01;
    if (!group.visible) return;
    for (const f of tongues) {
      const u = f.userData;
      const flick = 0.8 + 0.2 * Math.sin(t * u.speed + u.phase) + 0.12 * Math.sin(t * u.speed * 2.7 + u.phase * 3);
      f.scale.set(u.w * k, u.h * flick * k, u.w * k);
      f.rotation.set(u.lx + Math.sin(t * 4 + u.phase) * 0.08, 0, u.lz + Math.sin(t * 3.3 + u.phase) * 0.12);
    }
    for (let i = 0; i < EMBERS; i++) {
      pos[i * 3 + 1] += vel[i] * dt;
      pos[i * 3] += Math.sin(t * 3 + i) * 0.15 * dt;
      if (pos[i * 3 + 1] > 2.2) spawn(i, 0.5);
    }
    emberGeo.attributes.position.needsUpdate = true;
    embers.material.size = 0.07 * k;
  };
  return { group, update };
}

// Tapered tube that is rebuilt every frame so the rod can bend.
function makeRod() {
  const RINGS = 30, RAD = 8;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(RINGS * RAD * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const idx = [];
  for (let i = 0; i < RINGS - 1; i++)
    for (let j = 0; j < RAD; j++) {
      const a = i * RAD + j, b = i * RAD + ((j + 1) % RAD), c = a + RAD, d = b + RAD;
      idx.push(a, c, b, b, c, d);
    }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, outline(toon("#2f6db5"), 0.004));
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  const p = new THREE.Vector3(), t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  mesh.userData.set = (p0, p1, p2) => {
    curve.v0.copy(p0); curve.v1.copy(p1); curve.v2.copy(p2);
    for (let i = 0; i < RINGS; i++) {
      const u = i / (RINGS - 1);
      curve.getPoint(u, p);
      curve.getTangent(u, t);
      n.crossVectors(t, up);
      if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
      n.normalize();
      b.crossVectors(t, n).normalize();
      const r = lerp(0.036, 0.008, u);
      for (let j = 0; j < RAD; j++) {
        const a = (j / RAD) * Math.PI * 2;
        const k = (i * RAD + j) * 3;
        pos[k] = p.x + (n.x * Math.cos(a) + b.x * Math.sin(a)) * r;
        pos[k + 1] = p.y + (n.y * Math.cos(a) + b.y * Math.sin(a)) * r;
        pos[k + 2] = p.z + (n.z * Math.cos(a) + b.z * Math.sin(a)) * r;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  return mesh;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const effect = new OutlineEffect(renderer, { defaultThickness: 0.0045, defaultColor: [0.1, 0.1, 0.1] });

  const scene = new THREE.Scene();
  const haze = new THREE.Color("#cdeefc");
  scene.fog = new THREE.Fog(haze, 45, 150);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  const uniforms = { uTime: { value: 0 } };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dummy = new THREE.Object3D();
  const tmp = new THREE.Color();

  // Sky: banded gradient with a flat cartoon sun
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), noOutline(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uHorizon: { value: haze }, uZenith: { value: new THREE.Color("#3f9ef0") }, uSunDir: { value: SUN_DIR },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uHorizon, uZenith, uSunDir; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        float band = floor(pow(h, 0.6) * 6.0) / 6.0;
        vec3 col = mix(uHorizon, uZenith, band);
        float s = dot(vDir, uSunDir);
        col = mix(col, vec3(1.0, 0.86, 0.3), step(0.9975, s));
        col = mix(col, vec3(0.1), step(0.9968, s) * (1.0 - step(0.9975, s)));
        col = mix(col, vec3(1.0, 0.95, 0.7), (step(0.993, s) - step(0.9968, s)) * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  })));
  scene.add(sky);

  // Puffy clouds
  const cloudMat = outline(toon("#ffffff", { fog: false }), 0.003);
  const cloudGeo = new THREE.IcosahedronGeometry(1, 3);
  const clouds = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Group();
    const n = 4 + ((rand() * 3) | 0);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      const s = range(2.2, 4);
      puff.scale.set(s, s * 0.8, s);
      puff.position.set((j - n / 2) * 2.8 + range(-0.6, 0.6), range(-0.3, 1.2), range(-1, 1));
      c.add(puff);
    }
    const a = (i / 12) * Math.PI * 2 + range(-0.2, 0.2), r = range(80, 120);
    c.position.set(Math.cos(a) * r, range(28, 45), Math.sin(a) * r);
    c.lookAt(0, c.position.y, 0);
    clouds.add(c);
  }
  scene.add(clouds);

  // Light
  scene.add(new THREE.HemisphereLight("#ffffff", "#7aa35a", 1.1));
  const sun = new THREE.DirectionalLight("#fff3d6", 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(30).add(SEAT);
  sun.target.position.copy(SEAT);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Terrain with hard-edged colour patches
  const tGeo = new THREE.PlaneGeometry(260, 260, 220, 220);
  tGeo.rotateX(-Math.PI / 2);
  const tp = tGeo.attributes.position;
  const colors = new Float32Array(tp.count * 3);
  const cGrass = new THREE.Color("#7cc84a"), cGrass2 = new THREE.Color("#68b23c"), cHill = new THREE.Color("#9bd35a");
  const cSand = new THREE.Color("#f0d58c"), cBed = new THREE.Color("#3d8fa8");
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), h = groundH(x, z);
    tp.setY(i, h);
    const patch = Math.sin(x * 0.35 + z * 0.22) + Math.sin(x * 0.17 - z * 0.41);
    tmp.copy(patch > 0.6 ? cGrass2 : cGrass);
    if (h > 3) tmp.copy(cHill);
    if (h < 0.0) tmp.copy(cSand);
    if (h < -0.55) tmp.copy(cBed);
    tmp.toArray(colors, i * 3);
  }
  tGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  tGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tGeo, noOutline(toon("#ffffff", { vertexColors: true })));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Pond water: flat colour bands, wobbly foam edge and sparkles
  const water = new THREE.Mesh(new THREE.CircleGeometry(7.4, 160), noOutline(new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uPond: { value: POND },
      uDeep: { value: new THREE.Color("#2a7fd4") }, uMid: { value: new THREE.Color("#3ea4e6") }, uShallow: { value: new THREE.Color("#6fd0ef") },
    }]),
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec2 uPond; uniform vec3 uDeep, uMid, uShallow;
      varying vec3 vWorld;
      float pondR(float a){ return 5.2 + 0.6 * sin(3.0 * a + 1.0) + 0.3 * sin(5.0 * a); }
      void main(){
        vec2 q = vWorld.xz - uPond;
        float a = atan(q.y, q.x);
        float d = length(q) / pondR(a);
        float wob = sin(a * 14.0 + uTime * 1.6) * 0.012 + sin(a * 31.0 - uTime * 2.3) * 0.006;
        vec3 col = d < 0.5 + wob ? uDeep : d < 0.82 + wob ? uMid : uShallow;
        float sparkle = step(0.985, sin(vWorld.x * 2.6 + uTime * 0.9) * sin(vWorld.z * 3.1 - uTime * 0.7 + vWorld.x));
        col = mix(col, vec3(1.0), sparkle * step(d, 0.9));
        float ring = step(0.965 + wob * 2.0, d);
        col = mix(col, vec3(1.0), ring);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  })));
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, WATER_Y, POND.y);
  scene.add(water);

  // Lily pads, a few with flowers
  const lilies = [];
  const padMat = outline(toon("#4fae3c", { side: THREE.DoubleSide }), 0.004);
  const petalMat = outline(toon("#ff9fc6"), 0.003);
  const heartMat = noOutline(toon("#ffd23f"));
  for (let i = 0, placed = 0; placed < 11 && i < 300; i++) {
    const a = range(0, Math.PI * 2), d = range(0.35, 0.85);
    const r = pondR(a) * d, x = POND.x + Math.cos(a) * r, z = POND.y + Math.sin(a) * r;
    if (Math.abs(x - TARGET.x) < 1.6 && z < TARGET.z + 1.2) continue;
    if (lilies.some((l) => Math.hypot(l.position.x - x, l.position.z - z) < 1)) continue;
    const pad = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(range(0.35, 0.55), 28, 0.25, Math.PI * 2 - 0.5), padMat);
    leaf.rotation.x = -Math.PI / 2;
    pad.add(leaf);
    if (placed % 3 === 0) {
      for (let k = 0; k < 7; k++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), petalMat);
        const pa = (k / 7) * Math.PI * 2;
        petal.scale.set(1, 0.6, 2);
        petal.position.set(Math.cos(pa) * 0.08, 0.06, Math.sin(pa) * 0.08);
        petal.rotation.y = -pa + Math.PI / 2;
        petal.rotation.x = 0.5;
        pad.add(petal);
      }
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), heartMat);
      heart.position.y = 0.08;
      pad.add(heart);
    }
    pad.position.set(x, WATER_Y + 0.015, z);
    pad.rotation.y = range(0, Math.PI * 2);
    pad.userData.phase = range(0, 6);
    shadows(pad);
    scene.add(pad);
    lilies.push(pad);
    placed++;
  }

  // Grass tufts
  const bladeGeo = new THREE.ConeGeometry(0.06, 0.5, 3, 3, true);
  bladeGeo.translate(0, 0.25, 0);
  bladeGeo.attributes.normal.array.fill(0);
  for (let i = 0; i < bladeGeo.attributes.normal.count; i++) bladeGeo.attributes.normal.setY(i, 1);
  const grassMat = noOutline(addWind(toon("#ffffff"), uniforms, 0.8));
  const GRASS = 9000;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS);
  const gc = ["#6cc03f", "#8ad350", "#5aab35", "#a4dc5c"].map((c) => new THREE.Color(c));
  for (let i = 0, placed = 0; placed < GRASS && i < GRASS * 4; i++) {
    const a = range(0, Math.PI * 2), r = Math.sqrt(rand()) * 34;
    const x = ORBIT.x + Math.cos(a) * r, z = ORBIT.z + Math.sin(a) * r;
    if (groundH(x, z) < 0.02 || (Math.abs(x) < 1.4 && Math.abs(z - SEAT.z) < 0.45)) continue;
    dummy.position.set(x, groundH(x, z) - 0.02, z);
    dummy.rotation.set(range(-0.2, 0.2), range(0, Math.PI), range(-0.2, 0.2));
    dummy.scale.set(1, range(0.6, 1.5), 1);
    dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);
    grass.setColorAt(placed, pickOf(gc));
    placed++;
    grass.count = placed;
  }
  grass.receiveShadow = true;
  scene.add(grass);

  // Flowers: coloured heads on the meadow
  const FLOWERS = 500;
  const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 10, 6), noOutline(toon("#ffffff")), FLOWERS);
  const fc = ["#ffffff", "#ffd23f", "#ff7eb6", "#b48cff", "#ff6b4a"].map((c) => new THREE.Color(c));
  for (let i = 0, placed = 0; placed < FLOWERS && i < FLOWERS * 5; i++) {
    const x = ORBIT.x + range(-26, 26), z = ORBIT.z + range(-26, 26);
    if (groundH(x, z) < 0.05) continue;
    dummy.position.set(x, groundH(x, z) + range(0.25, 0.4), z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 0.55, 1);
    dummy.updateMatrix();
    flowers.setMatrixAt(placed, dummy.matrix);
    flowers.setColorAt(placed, pickOf(fc));
    placed++;
    flowers.count = placed;
  }
  scene.add(flowers);

  // Cattails around the pond edge, leaving the view in front of Clawd open
  const REEDS = 140;
  const stemGeo = new THREE.CylinderGeometry(0.012, 0.02, 1.4, 5);
  stemGeo.translate(0, 0.7, 0);
  const headGeo = new THREE.CapsuleGeometry(0.045, 0.2, 4, 8);
  headGeo.translate(0, 1.25, 0);
  const stems = new THREE.InstancedMesh(stemGeo, noOutline(addWind(toon("#5c9e3a"), uniforms, 0.05)), REEDS);
  const heads = new THREE.InstancedMesh(headGeo, noOutline(addWind(toon("#8a4b25"), uniforms, 0.05)), REEDS);
  const seatAngle = Math.atan2(SEAT.z - POND.y, SEAT.x - POND.x);
  for (let i = 0, placed = 0; placed < REEDS && i < REEDS * 8; i++) {
    const a = range(0, Math.PI * 2);
    if (Math.abs(Math.atan2(Math.sin(a - seatAngle), Math.cos(a - seatAngle))) < 0.75) continue;
    const r = pondR(a) * range(0.97, 1.12), x = POND.x + Math.cos(a) * r, z = POND.y + Math.sin(a) * r;
    dummy.position.set(x, groundH(x, z) - 0.05, z);
    dummy.rotation.set(range(-0.12, 0.12), 0, range(-0.12, 0.12));
    dummy.scale.setScalar(range(0.6, 1.2));
    dummy.updateMatrix();
    stems.setMatrixAt(placed, dummy.matrix);
    heads.setMatrixAt(placed, dummy.matrix);
    placed++;
    stems.count = heads.count = placed;
  }
  stems.castShadow = heads.castShadow = true;
  scene.add(stems, heads);

  // Round cartoon trees and bushes
  const TREES = 110;
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 2.2, 10);
  trunkGeo.translate(0, 1.1, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, outline(toon("#8b5a2b"), 0.004), TREES);
  const crownMat = outline(toon("#ffffff"), 0.004);
  const crownGeo = new THREE.IcosahedronGeometry(1, 3);
  const crownParts = [[0, 3.2, 0, 1.6], [-0.9, 2.6, 0.3, 1.1], [0.9, 2.7, -0.2, 1.15]];
  const crowns = crownParts.map(() => new THREE.InstancedMesh(crownGeo, crownMat, TREES));
  const leafCols = ["#4caf3f", "#5cc04a", "#3e9a39", "#79c94a"].map((c) => new THREE.Color(c));
  const part = new THREE.Object3D();
  for (let i = 0, placed = 0; placed < TREES && i < TREES * 12; i++) {
    const a = range(0, Math.PI * 2), r = range(13, 70);
    const x = ORBIT.x + Math.cos(a) * r, z = ORBIT.z + Math.sin(a) * r;
    if (pondD(x, z) < 1.5) continue;
    dummy.position.set(x, groundH(x, z) - 0.1, z);
    dummy.rotation.set(0, range(0, 6), 0);
    dummy.scale.setScalar(range(0.9, 1.6));
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    const col = pickOf(leafCols);
    crownParts.forEach(([px, py, pz, ps], k) => {
      part.position.set(px, py, pz);
      part.scale.setScalar(ps);
      part.updateMatrix();
      part.matrix.premultiply(dummy.matrix);
      crowns[k].setMatrixAt(placed, part.matrix);
      crowns[k].setColorAt(placed, col);
    });
    placed++;
    trunks.count = placed;
    for (const c of crowns) c.count = placed;
  }
  for (const m of [trunks, ...crowns]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // Rocks around the pond
  const rockGeo = new THREE.IcosahedronGeometry(0.5, 2);
  rockGeo.scale(1, 0.65, 1);
  const ROCKS = 26;
  const rocks = new THREE.InstancedMesh(rockGeo, outline(toon("#ffffff"), 0.004), ROCKS);
  const rockCols = ["#a7a9b4", "#8f929e", "#b9b6ae"].map((c) => new THREE.Color(c));
  for (let i = 0, placed = 0; placed < ROCKS && i < 400; i++) {
    const a = range(0, Math.PI * 2);
    if (Math.abs(Math.atan2(Math.sin(a - seatAngle), Math.cos(a - seatAngle))) < 0.35) continue;
    const r = pondR(a) * range(0.98, 1.2), x = POND.x + Math.cos(a) * r, z = POND.y + Math.sin(a) * r;
    dummy.position.set(x, groundH(x, z) - 0.05, z);
    dummy.rotation.set(0, range(0, 6), range(-0.2, 0.2));
    dummy.scale.setScalar(range(0.4, 1.3));
    dummy.updateMatrix();
    rocks.setMatrixAt(placed, dummy.matrix);
    rocks.setColorAt(placed, pickOf(rockCols));
    placed++;
    rocks.count = placed;
  }
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  // Log seat
  const seatY = groundH(SEAT.x, SEAT.z);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 2.6, 20), [
    outline(toon("#8b5a2b"), 0.005), outline(toon("#e6b97a"), 0.005), outline(toon("#e6b97a"), 0.005),
  ]);
  log.rotation.z = Math.PI / 2;
  log.position.set(SEAT.x, seatY + 0.25, SEAT.z);
  shadows(log);
  scene.add(log);
  const logTop = seatY + 0.25 + 0.3;

  // Bucket with the latest catches
  const bucket = new THREE.Group();
  const bx = 1.75, bz = SEAT.z + 0.35;
  bucket.position.set(bx, groundH(bx, bz), bz);
  const metal = outline(toon("#9fb4c7", { side: THREE.DoubleSide }), 0.005);
  const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 32, 1, true), metal);
  pail.position.y = 0.25;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 40), metal);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.5;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 32, Math.PI), metal);
  handle.position.y = 0.5;
  handle.rotation.y = 0.4;
  const pailWater = new THREE.Mesh(new THREE.CircleGeometry(0.27, 32), noOutline(toon("#3ea4e6")));
  pailWater.rotation.x = -Math.PI / 2;
  pailWater.position.y = 0.4;
  bucket.add(pail, rim, handle, pailWater);
  shadows(bucket);
  scene.add(bucket);
  const bucketTop = bucket.position.clone().add(new THREE.Vector3(0, 0.45, 0));
  const bucketFish = [];
  const addToBucket = (name) => {
    if (bucketFish.length >= 10) scene.remove(bucketFish.shift());
    const f = makeFish(name, 0.7);
    const a = rand() * Math.PI * 2, r = rand() * 0.12;
    f.position.set(bucketTop.x + Math.cos(a) * r, bucketTop.y - 0.02, bucketTop.z + Math.sin(a) * r);
    f.rotation.set(range(-0.3, 0.3), range(0, 6), Math.PI / 2 - range(0.1, 0.5));
    scene.add(f);
    bucketFish.push(f);
  };

  // Catch rack: one fish per species hangs from a wooden bar, the most caught first
  const RACK = new THREE.Vector3(-3.4, 0, 1.0);
  const rack = new THREE.Group();
  rack.position.set(RACK.x, groundH(RACK.x, RACK.z), RACK.z);
  rack.rotation.y = 0.35;
  const wood = outline(toon("#a0673a"), 0.005);
  for (const x of [-1.3, 1.3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.1, 10), wood);
    post.position.set(x, 1.05, 0);
    rack.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 10), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.95;
  rack.add(bar);
  const sign = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.3, 0.06, 2, 0.03), outline(toon("#f0d58c"), 0.005));
  sign.position.set(0, 2.25, 0);
  rack.add(sign);
  shadows(rack);
  scene.add(rack);
  const rackFish = new THREE.Group();
  rack.add(rackFish);
  const stringMat = noOutline(new THREE.MeshBasicMaterial({ color: INK }));
  let rackKey = "";
  function updateRack(species = {}) {
    const top = Object.entries(species).sort((a, b) => b[1].count - a[1].count).slice(0, 6);
    const key = top.map(([n, s]) => n + Math.min(s.count, 50)).join("|");
    if (key === rackKey) return;
    rackKey = key;
    rackFish.clear();
    top.forEach(([name, s], i) => {
      const x = (i - (top.length - 1) / 2) * 0.44;
      const size = 0.8 + Math.min(Math.log10(s.count + 1) * 0.35, 0.6);
      const len = 0.2 + (i % 2) * 0.12;
      const holder = new THREE.Group();
      holder.position.set(x, 1.95, 0);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 4), stringMat);
      string.position.y = -len / 2;
      const f = makeFish(name, size);
      f.rotation.set(0, 0, -Math.PI / 2); // head down, side facing out
      f.position.y = -len - 0.36 * size;
      holder.add(string, f);
      holder.userData.phase = i * 1.3;
      rackFish.add(holder);
    });
  }

  // Tackle box and lantern
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.28, 0.32, 3, 0.04), outline(toon("#2fae8f"), 0.005));
  box.position.set(1.0, groundH(1.0, SEAT.z - 0.8) + 0.14, SEAT.z - 0.8);
  box.rotation.y = -0.3;
  shadows(box);
  scene.add(box);

  const lantern = new THREE.Group();
  lantern.position.set(-1.55, groundH(-1.55, SEAT.z - 0.5), SEAT.z - 0.5);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 16), outline(new THREE.MeshBasicMaterial({ color: "#ffe27a" }), 0.004));
  glass.position.y = 0.16;
  const capMat = outline(toon("#3b3b3b"), 0.004);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.08, 16), capMat);
  cap.position.y = 0.3;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 16), capMat);
  foot.position.y = 0.04;
  lantern.add(glass, cap, foot);
  scene.add(lantern);

  // Butterflies
  const butterflies = ["#ffd23f", "#ff7eb6", "#7ec8ff", "#ffffff"].map((c, i) => {
    const b = new THREE.Group();
    const mat = outline(toon(c, { side: THREE.DoubleSide }), 0.003);
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), mat);
      w.geometry.translate(0.09 * s, 0, 0);
      w.rotation.x = -Math.PI / 2;
      const pivot = new THREE.Group();
      pivot.add(w);
      b.add(pivot);
      return pivot;
    });
    b.userData = { wings, phase: i * 1.7, r: range(2.5, 6), cx: range(-4, 4), cz: range(-2, 4) };
    scene.add(b);
    return b;
  });

  // Clawd
  const clawd = buildClawd();
  clawd.root.position.set(SEAT.x, logTop - 0.02, SEAT.z);
  scene.add(clawd.root);
  const baseY = clawd.root.position.y;

  // Turbo: Clawd's body catches fire and lights up the bank around him
  const fire = buildFire();
  clawd.root.add(fire.group);
  const fireLight = new THREE.PointLight("#ff7a2a", 0, 8, 1.5);
  fireLight.position.set(0, 0.7, 0.6);
  clawd.root.add(fireLight);
  const skinColor = clawd.skin.color.clone();
  const fireSkin = new THREE.Color("#ff5a1f");
  let fireK = 0;

  // Little rain cloud that shows up over Clawd when a fish escapes
  const gloom = new THREE.Group();
  const gloomMat = outline(toon("#8d93a3"), 0.006);
  for (const [x, y, s] of [[-0.22, 0, 0.2], [0, 0.07, 0.26], [0.23, 0, 0.19], [0.08, -0.06, 0.18]]) {
    const puff = new THREE.Mesh(cloudGeo, gloomMat);
    puff.scale.setScalar(s);
    puff.position.set(x, y, 0);
    gloom.add(puff);
  }
  const rainMat = noOutline(toon("#5fb8f0"));
  const rain = [-0.2, 0, 0.2].map((x, i) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), rainMat);
    d.scale.y = 1.8;
    d.position.set(x, -0.25, 0);
    d.userData.phase = i * 0.33;
    gloom.add(d);
    return d;
  });
  gloom.visible = false;
  scene.add(gloom);

  // Rod, reel, line and bobber
  const rod = makeRod();
  scene.add(rod);
  const rodBase = new THREE.Object3D();
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.42, 14), outline(toon("#d9a066"), 0.004));
  cork.rotation.x = Math.PI / 2;
  cork.position.z = -0.12;
  const reelMat = outline(toon("#d0d6de"), 0.004);
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.08, 20), reelMat);
  spool.rotation.z = Math.PI / 2;
  spool.position.set(0, -0.09, 0.06);
  const crank = new THREE.Group();
  crank.position.set(0.055, -0.09, 0.06);
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.016), reelMat);
  crankArm.position.y = 0.045;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), outline(toon("#c0392b"), 0.004));
  knob.position.set(0.016, 0.09, 0);
  crank.add(crankArm, knob);
  rodBase.add(cork, spool, crank);
  shadows(rodBase);
  scene.add(rodBase);

  const LINE_PTS = 40;
  const lineGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(LINE_PTS * 3), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: INK }));
  line.frustumCulled = false;
  scene.add(line);

  const bobber = new THREE.Group();
  const bTop = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), outline(toon("#e2462f"), 0.006));
  const bBot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), outline(toon("#ffffff"), 0.006));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 6), noOutline(toon("#e2462f")));
  stick.position.y = 0.12;
  bobber.add(bTop, bBot, stick);
  shadows(bobber);
  scene.add(bobber);

  // Ripples and splash droplets
  const ripples = Array.from({ length: 18 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48),
      noOutline(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false })));
    m.rotation.x = -Math.PI / 2;
    m.userData = { age: 99, size: 1 };
    scene.add(m);
    return m;
  });
  let rippleIdx = 0;
  const ripple = (p, size = 1) => {
    const m = ripples[rippleIdx++ % ripples.length];
    m.position.set(p.x, WATER_Y + 0.02, p.z);
    m.userData = { age: 0, size };
  };

  const DROPS = 160;
  const dropPos = new Float32Array(DROPS * 3).fill(-999);
  const dropVel = new Float32Array(DROPS * 3);
  const dropGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(dropPos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: "#ffffff", size: 0.09 }));
  drops.frustumCulled = false;
  scene.add(drops);
  let dropIdx = 0;
  const splash = (p, n = 18, power = 1) => {
    for (let i = 0; i < n; i++) {
      const k = (dropIdx++ % DROPS) * 3;
      dropPos[k] = p.x; dropPos[k + 1] = WATER_Y + 0.03; dropPos[k + 2] = p.z;
      const a = rand() * Math.PI * 2, s = range(0.4, 1.4) * power;
      dropVel[k] = Math.cos(a) * s; dropVel[k + 1] = range(1.5, 3) * power; dropVel[k + 2] = Math.sin(a) * s;
    }
    ripple(p, 0.6 * power);
  };

  // ---- Animation state ----
  let server = { running: false, phase: "idle", cast: null, lastCatch: null, recent: [] };
  let seenCatchAt = null;
  let bucketFilled = false;
  let flying = null;
  let seenEscapeAt = null;
  let escaping = null; // { fish, from, to, start, splashed }
  const ESCAPE_S = 2.6;
  let castLandedFor = null;
  let lastSplash = 0;
  let nextBlink = 2;
  let happyUntil = 0;
  const pointer = new THREE.Vector2();
  const onPointer = (e) => pointer.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
  addEventListener("pointermove", onPointer);

  const hand = new THREE.Vector3(), dir = new THREE.Vector3(), tip = new THREE.Vector3(), straightTip = new THREE.Vector3();
  const butt = new THREE.Vector3(), mid = new THREE.Vector3(), bob = new THREE.Vector3().copy(TARGET);
  const camTarget = new THREE.Vector3(0, 1.6, SEAT.z + 1), lookAt = new THREE.Vector3().copy(camTarget);
  const v = new THREE.Vector3(), down = new THREE.Vector3();
  const clock = new THREE.Clock();

  function update(state) {
    server = state;
    updateRack(state.species);
    if (!bucketFilled) {
      bucketFilled = true;
      seenCatchAt = state.lastCatch?.at ?? null;
      seenEscapeAt = state.lastEscape?.at ?? null;
      [...(state.recent || [])].slice(0, 8).reverse().forEach((c) => addToBucket(c.name));
    }
    const at = state.lastCatch?.at;
    if (at && at !== seenCatchAt) {
      seenCatchAt = at;
      const fish = makeFish(state.lastCatch.name, 1.2);
      fish.position.copy(bob);
      scene.add(fish);
      flying = { fish, name: state.lastCatch.name, from: bob.clone(), start: clock.elapsedTime };
      splash(bob, 30, 1.3);
      happyUntil = clock.elapsedTime + 2.4;
    }
    const esc = state.lastEscape?.at;
    if (esc && esc !== seenEscapeAt) {
      seenEscapeAt = esc;
      const fish = makeFish("entwischt", 1.1);
      const from = bob.clone();
      from.y = WATER_Y;
      // Jumps away from Clawd, towards the middle of the pond
      const to = new THREE.Vector3(POND.x, WATER_Y, POND.y).sub(from).setY(0).setLength(2.6).add(from);
      fish.position.copy(from);
      scene.add(fish);
      escaping = { fish, from, to, start: clock.elapsedTime, splashed: false };
      splash(from, 26, 1.2);
    }
  }

  function mode(now) {
    if (flying) return { m: "catch", k: (clock.elapsedTime - flying.start) / 1.6 };
    if (escaping) return { m: "escape", k: (clock.elapsedTime - escaping.start) / ESCAPE_S };
    if (!server.running) return { m: "idle" };
    const c = server.cast;
    if (!c || server.phase === "caught") return { m: "rest" };
    const el = now - c.at;
    if (el < 1100) return { m: "cast", k: el / 1100, c };
    if (el < c.biteInMs) return { m: "wait", el, c };
    return { m: "fight", el, c };
  }

  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    uniforms.uTime.value = t;
    water.material.uniforms.uTime.value = t;
    const st = mode(Date.now());

    // Rod pose: elevation (radians above horizontal), yaw (0 = towards the pond), bend
    let elev = 1.1, yaw = 0.25, bend = 0, lean = 0, jump = 0, look = 0, crankSpeed = 0, legSwing = 1, sad = 0;
    let bobberAt = "tip";
    if (st.m === "idle") {
      look = Math.sin(t * 0.4) * 0.35;
      elev = 1.15 + Math.sin(t * 0.5) * 0.04;
    } else if (st.m === "rest") {
      elev = 1.0;
    } else if (st.m === "cast") {
      const k = st.k;
      elev = k < 0.35 ? lerp(0.6, 2.0, ease(k / 0.35)) : k < 0.6 ? lerp(2.0, 0.3, ease((k - 0.35) / 0.25)) : lerp(0.3, 0.45, ease((k - 0.6) / 0.4));
      yaw = 0.1;
      lean = k < 0.35 ? -0.1 : 0.12 * (1 - k);
      bobberAt = k < 0.5 ? "tip" : "fly";
      legSwing = 0.3;
    } else if (st.m === "wait") {
      elev = 0.45 + Math.sin(t * 0.7) * 0.03;
      yaw = 0.1;
      bend = 0.05;
      bobberAt = "water";
      legSwing = 0.6;
    } else if (st.m === "fight") {
      elev = 0.9 + Math.sin(t * 9) * 0.05;
      yaw = 0.1 + Math.sin(t * 2.7) * 0.15;
      bend = 0.55 + Math.sin(t * 13) * 0.12;
      lean = -0.15;
      crankSpeed = server.turbo ? 32 : 18;
      bobberAt = "fight";
      legSwing = 0.15;
    } else if (st.m === "catch") {
      const k = clamp(st.k, 0, 1);
      elev = lerp(1.1, 1.0, k);
      jump = Math.sin(Math.PI * clamp(k * 1.4, 0, 1)) * 0.4;
      legSwing = 2;
    } else if (st.m === "escape") {
      // Line snaps: rod springs up and wobbles, Clawd tips back, then slumps
      const k = clamp(st.k, 0, 1);
      elev = 1.25 + Math.sin(k * 40) * 0.3 * Math.exp(-k * 9);
      lean = k < 0.1 ? -0.3 * (k / 0.1) : lerp(-0.3, 0.18, ease(clamp((k - 0.1) / 0.3, 0, 1)));
      sad = S(k, 0.15, 0.3) * (1 - S(k, 0.88, 1));
      legSwing = 0.1;
    }

    // Clawd body
    const r = clawd.root;
    r.position.y = baseY + jump;
    r.rotation.x = lerp(r.rotation.x, lean, 1 - Math.exp(-dt * 8));
    r.rotation.y = lerp(r.rotation.y, look, 1 - Math.exp(-dt * 3));
    clawd.body.scale.y = 1 + Math.sin(t * 2.1) * 0.015 - sad * 0.06;
    clawd.legs.forEach((l, i) => { l.rotation.x = 0.45 + Math.sin(t * 2.4 * legSwing + i * 1.7) * 0.22 * Math.min(legSwing, 1.2); });
    const cheer = st.m === "catch" ? Math.sin(Math.PI * clamp(st.k, 0, 1)) : 0;
    clawd.arms[1].rotation.z = lerp(clawd.arms[1].rotation.z, cheer * 1.2 - sad * 0.5 + Math.sin(t * 1.3) * 0.04, 1 - Math.exp(-dt * 10));
    clawd.arms[0].rotation.x = -(elev - 0.6) * 0.35 + (crankSpeed ? Math.sin(t * crankSpeed) * 0.08 : 0);
    clawd.hat.rotation.z = 0.08 + jump * 0.3;
    clawd.hat.rotation.x = -0.06 + sad * 0.3;
    clawd.hat.position.y = 0.93 - sad * 0.1;

    fireK = lerp(fireK, server.turbo ? 1 : 0, 1 - Math.exp(-dt * 3));
    fire.update(t, dt, fireK);
    const flicker = 1 + Math.sin(t * 17) * 0.2 + Math.sin(t * 29) * 0.12;
    clawd.skin.color.copy(skinColor).lerp(fireSkin, fireK);
    clawd.skin.emissive.setRGB(1, 0.22, 0).multiplyScalar(fireK * 0.45 * flicker);
    fireLight.intensity = fireK * 3 * flicker;

    // Eyes: blink, squint while fighting, happy after a catch
    let eyeY = 1;
    if (t > nextBlink) { if (t > nextBlink + 0.13) nextBlink = t + range(2.5, 5.5); else eyeY = 0.12; }
    if (st.m === "fight") eyeY = Math.min(eyeY, 0.65);
    if (t < happyUntil) eyeY = Math.min(eyeY, 0.3);
    eyeY = Math.min(eyeY, 1 - sad * 0.45);
    clawd.eyes.forEach((e, i) => {
      e.scale.y = lerp(e.scale.y, eyeY, 1 - Math.exp(-dt * 25));
      e.rotation.z = sad * 0.35 * (i === 0 ? 1 : -1); // droopy
      e.position.y = 0.6 - sad * 0.05;
    });

    // Rod geometry
    r.updateMatrixWorld();
    hand.set(-0.8, 0.48, 0.22);
    r.localToWorld(hand);
    const wy = yaw + r.rotation.y;
    dir.set(Math.sin(wy) * Math.cos(elev), Math.sin(elev), Math.cos(wy) * Math.cos(elev));
    const L = 2.7;
    butt.copy(hand).addScaledVector(dir, -0.4);
    straightTip.copy(hand).addScaledVector(dir, L);
    v.copy(bob).sub(straightTip).setY(0).normalize();
    tip.copy(straightTip).addScaledVector(v, bend * 0.6);
    tip.y -= bend;
    mid.copy(hand).addScaledVector(dir, L * 0.55);
    rod.userData.set(butt, mid, tip);
    rodBase.position.copy(hand);
    rodBase.lookAt(v.copy(hand).add(dir));
    crank.rotation.x += crankSpeed * dt + (st.m === "cast" && st.k > 0.5 ? -20 * dt : 0);

    // Bobber
    let sag = 0.1;
    if (bobberAt === "tip") {
      down.set(tip.x + Math.sin(t * 1.3) * 0.05, tip.y - 0.45, tip.z);
      bob.lerp(down, 1 - Math.exp(-dt * 12));
      sag = 0;
    } else if (bobberAt === "fly") {
      const s = ease(clamp((st.k - 0.5) / 0.5, 0, 1));
      bob.copy(tip).lerp(TARGET, s);
      bob.y += Math.sin(Math.PI * s) * 2.2;
      sag = 0.2 * s;
    } else if (bobberAt === "water") {
      const nibble = st.el > st.c.biteInMs - 1600 ? Math.max(0, Math.sin(t * 15)) * 0.05 : 0;
      bob.set(TARGET.x + Math.sin(t * 0.4) * 0.1, WATER_Y + 0.02 + Math.sin(t * 2.3) * 0.015 - nibble, TARGET.z);
      sag = 0.35;
      if (castLandedFor !== st.c.at) { castLandedFor = st.c.at; splash(bob, 14, 0.8); }
      if (nibble > 0.045 && t - lastSplash > 0.5) { lastSplash = t; ripple(bob, 0.4); }
    } else if (bobberAt === "fight") {
      const span = st.c.waitMs - st.c.biteInMs + 1500;
      const p = clamp((st.el - st.c.biteInMs) / span, 0, 1);
      bob.set(TARGET.x + Math.sin(t * 2.3) * 0.7, WATER_Y - 0.06 + Math.sin(t * 12) * 0.04, lerp(TARGET.z, TARGET.z - 1.9, ease(p)));
      sag = 0.02;
      if (t - lastSplash > 0.32) { lastSplash = t; splash(bob, 6, 0.7); }
    }
    bobber.position.copy(bob);
    bobber.rotation.z = bobberAt === "fight" ? Math.sin(t * 10) * 0.4 : Math.sin(t * 1.7) * 0.1;

    // Fishing line from rod tip to bobber with a little sag
    const lp = lineGeo.attributes.position.array;
    for (let i = 0; i < LINE_PTS; i++) {
      const u = i / (LINE_PTS - 1);
      lp[i * 3] = lerp(tip.x, bob.x, u);
      lp[i * 3 + 1] = Math.max(lerp(tip.y, bob.y, u) - sag * 4 * u * (1 - u), bob.y);
      lp[i * 3 + 2] = lerp(tip.z, bob.z, u);
    }
    lineGeo.attributes.position.needsUpdate = true;

    // Caught fish arcs from the water into the bucket
    if (flying) {
      const k = clamp((t - flying.start) / 1.6, 0, 1);
      const f = flying.fish;
      f.position.copy(flying.from).lerp(bucketTop, ease(k));
      f.position.y += Math.sin(Math.PI * k) * 2.8;
      f.rotation.set(0, Math.atan2(bucketTop.x - flying.from.x, bucketTop.z - flying.from.z) - Math.PI / 2, Math.sin(t * 18) * 0.5 + k * 1.2);
      f.userData.tail.rotation.y = Math.sin(t * 30) * 0.6;
      if (k >= 1) {
        scene.remove(f);
        addToBucket(flying.name);
        flying = null;
      }
    }

    // Escaped fish leaps away and dives back in; rain cloud over a sad Clawd
    if (escaping) {
      const e = escaping;
      const kf = clamp((t - e.start) / 1.1, 0, 1);
      if (kf < 1) {
        e.fish.position.copy(e.from).lerp(e.to, kf);
        e.fish.position.y += Math.sin(Math.PI * kf) * 1.7;
        e.fish.rotation.set(0, Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z) - Math.PI / 2, Math.cos(Math.PI * kf) * 0.9 + Math.sin(t * 20) * 0.15);
        e.fish.userData.tail.rotation.y = Math.sin(t * 34) * 0.7;
      } else if (!e.splashed) {
        e.splashed = true;
        scene.remove(e.fish);
        splash(e.to, 24, 1.1);
      }
      if (t - e.start >= ESCAPE_S) escaping = null;
    }
    gloom.visible = sad > 0.01;
    if (gloom.visible) {
      gloom.position.set(clawd.root.position.x, clawd.root.position.y + 1.85 + Math.sin(t * 2) * 0.03, clawd.root.position.z);
      gloom.scale.setScalar(sad);
      gloom.quaternion.copy(camera.quaternion);
      for (const d of rain) d.position.y = -0.25 - ((t * 1.6 + d.userData.phase) % 1) * 0.5;
    }

    // Small life: lily pads bob, rack fish sway, butterflies flutter, clouds drift
    for (const l of lilies) l.position.y = WATER_Y + 0.015 + Math.sin(t * 1.2 + l.userData.phase) * 0.01;
    for (const h of rackFish.children) h.rotation.x = Math.sin(t * 1.1 + h.userData.phase) * 0.12;
    for (const b of butterflies) {
      const u = b.userData, a = t * 0.35 + u.phase;
      b.position.set(u.cx + Math.cos(a) * u.r, 1.1 + Math.sin(t * 1.3 + u.phase) * 0.4 + groundH(u.cx, u.cz) * 0.3, u.cz + Math.sin(a * 1.3) * u.r * 0.7);
      b.rotation.y = -a;
      u.wings[0].rotation.z = Math.sin(t * 18 + u.phase) * 0.9;
      u.wings[1].rotation.z = -Math.sin(t * 18 + u.phase) * 0.9;
    }
    clouds.rotation.y = t * 0.004;

    for (const m of ripples) {
      const u = m.userData;
      if (u.age > 2) continue;
      u.age += dt;
      m.scale.setScalar(0.1 + u.age * 0.9 * u.size);
      m.material.opacity = Math.max(0, 0.8 * (1 - u.age / 1.4));
    }
    for (let i = 0; i < DROPS; i++) {
      const k = i * 3;
      if (dropPos[k + 1] < -50) continue;
      dropVel[k + 1] -= 9.8 * dt;
      dropPos[k] += dropVel[k] * dt; dropPos[k + 1] += dropVel[k + 1] * dt; dropPos[k + 2] += dropVel[k + 2] * dt;
      if (dropPos[k + 1] < WATER_Y - 0.05) dropPos[k + 1] = -999;
    }
    dropGeo.attributes.position.needsUpdate = true;

    // Camera slowly circles the pond and Clawd
    const ang = t * (reduceMotion ? 0.008 : 0.045) + 0.5;
    const rad = 8.6 + Math.sin(t * 0.08) * 1.4;
    const cx = ORBIT.x + Math.sin(ang) * rad, cz = ORBIT.z + Math.cos(ang) * rad;
    const cy = Math.max(groundH(cx, cz) + 1.6, WATER_Y + 1.6, 2.6 + Math.sin(t * 0.11) * 0.7);
    camera.position.set(cx + pointer.x * 0.6, cy - pointer.y * 0.4, cz);
    camTarget.set(0, 1.6, SEAT.z + 1); // aim above Clawd so he sits below the overlay
    if (st.m === "fight" || st.m === "wait") camTarget.lerp(bob, 0.25);
    lookAt.lerp(camTarget, 1 - Math.exp(-dt * 2));
    camera.lookAt(lookAt);
    sky.position.copy(camera.position);

    effect.render(scene, camera);
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 0.8 ? 55 : 40;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();
  frame();

  return {
    update,
    dispose() {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onPointer);
      renderer.dispose();
    },
  };
}
