/** Local Three.js catalog preview. Dummy GLBs for now; replace files, keep node names. */

export function studioViewerHtml(glbUri: string, itemType = 'RING'): string {
  const src = JSON.stringify(glbUri)
  const kind = JSON.stringify(itemType)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <style>
    html, body, canvas {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #F6F2FF;
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
    }
    canvas { display: block; position: fixed; inset: 0; }
    #err { display: none; position: absolute; inset: 24px; color: #5b4a7a; font: 14px/1.4 -apple-system, sans-serif; text-align: center; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
<div id="err">Could not load the 3D preview.</div>
<script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const GLB = ${src};
const ITEM = ${kind};
const STAGE = 0xF6F2FF;

const scene = new THREE.Scene();
scene.background = new THREE.Color(STAGE);

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 80);
camera.position.set(0, 1.15, 4.4);

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.domElement.style.touchAction = 'none';
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
if ('environmentIntensity' in scene) scene.environmentIntensity = 1.2;

const target = new THREE.Vector3(0, 0, 0);
const spherical = new THREE.Spherical(4.4, 1.05, 0.35);
function applyCamera() {
  spherical.makeSafe();
  spherical.phi = Math.min(Math.PI - 0.12, Math.max(0.12, spherical.phi));
  spherical.radius = Math.min(14, Math.max(0.85, spherical.radius));
  camera.position.setFromSpherical(spherical).add(target);
  camera.lookAt(target);
}
applyCamera();

let drag = null;
let pinch0 = 0;
function pos(e, i) {
  var t = e.touches ? e.touches[i || 0] : e;
  return { x: t.clientX, y: t.clientY };
}
function pinchDist(e) {
  var a = e.touches[0], b = e.touches[1];
  var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
function onDown(e) {
  if (e.type.indexOf('pointer') === 0 && e.pointerType !== 'mouse') return;
  if (e.touches && e.touches.length === 2) {
    drag = null;
    pinch0 = pinchDist(e);
    return;
  }
  var p = pos(e);
  drag = p;
}
function onMove(e) {
  if (e.type.indexOf('pointer') === 0 && e.pointerType !== 'mouse') return;
  if (e.cancelable) e.preventDefault();
  if (e.touches && e.touches.length === 2 && pinch0) {
    var d = pinchDist(e);
    spherical.radius *= pinch0 / d;
    pinch0 = d;
    applyCamera();
    return;
  }
  if (!drag) return;
  if (e.touches && e.touches.length !== 1) return;
  if (e.buttons !== undefined && e.pointerType === 'mouse' && !(e.buttons & 1)) return;
  var p = pos(e);
  spherical.theta -= (p.x - drag.x) * 0.008;
  spherical.phi -= (p.y - drag.y) * 0.008;
  drag = p;
  applyCamera();
}
function onUp() {
  drag = null;
  pinch0 = 0;
}
var el = renderer.domElement;
el.addEventListener('touchstart', onDown, { passive: true });
el.addEventListener('touchmove', onMove, { passive: false });
el.addEventListener('touchend', onUp, { passive: true });
el.addEventListener('touchcancel', onUp, { passive: true });
el.addEventListener('pointerdown', onDown);
el.addEventListener('pointermove', onMove);
el.addEventListener('pointerup', onUp);
el.addEventListener('pointercancel', onUp);
el.addEventListener('wheel', function (e) {
  e.preventDefault();
  spherical.radius *= e.deltaY > 0 ? 1.08 : 0.92;
  applyCamera();
}, { passive: false });

scene.add(new THREE.AmbientLight(0xfff4e8, 0.12));
const hemi = new THREE.HemisphereLight(0xfff7ee, 0x6e6480, 0.22);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff3dc, 1.7);
key.position.set(2.8, 4.6, 3.2);
scene.add(key);
const fill = new THREE.DirectionalLight(0xdde7ff, 0.22);
fill.position.set(-3.0, 1.1, 1.4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffe9c4, 0.7);
rim.position.set(-0.4, 2.2, -3.8);
scene.add(rim);
const spark = new THREE.DirectionalLight(0xffffff, 0.18);
spark.position.set(0.6, 3.2, 4.4);
scene.add(spark);

const pivot = new THREE.Group();
scene.add(pivot);
const extras = new THREE.Group();
let root = null;
let metalMat = null;
let stoneMat = null;
let pending = [];

let viewW = 0;
let viewH = 0;
let frameMax = 1;
function viewportSize() {
  var vv = window.visualViewport;
  var w = Math.round((vv && vv.width) || document.documentElement.clientWidth || window.innerWidth || 1);
  var h = Math.round((vv && vv.height) || document.documentElement.clientHeight || window.innerHeight || 1);
  return { w: Math.max(1, w), h: Math.max(1, h) };
}
function applyFrameTarget() {
  if (!root) return;
  var h = viewH || viewportSize().h;
  var cover = Math.min(0.16, 64 / Math.max(h, 1));
  if (ITEM === 'NECKLACE') target.set(0, -frameMax * 0.08, 0);
  else if (ITEM === 'EARRINGS') target.set(0, frameMax * (0.02 + cover * 0.4), 0);
  else target.set(0, frameMax * (0.06 + cover), 0);
  applyCamera();
}
function resize(nextW, nextH) {
  var size = viewportSize();
  var w = nextW > 0 ? nextW : (viewW || size.w);
  var h = nextH > 0 ? nextH : (viewH || size.h);
  if (nextW > 0 && nextH > 0) { viewW = nextW; viewH = nextH; }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  applyFrameTarget();
}
resize();
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(document.documentElement);

function hexColor(hex) {
  try { return new THREE.Color(hex || '#E4C441'); }
  catch (e) { return new THREE.Color(0xE4C441); }
}

function applyMetal(hex, purity) {
  if (!metalMat) return;
  metalMat.color.copy(hexColor(hex));
  const k18 = purity === '18K';
  metalMat.metalness = k18 ? 1 : 0.94;
  metalMat.roughness = k18 ? 0.12 : purity === '925' ? 0.28 : 0.18;
  metalMat.clearcoat = k18 ? 0.65 : 0.42;
  metalMat.envMapIntensity = 1.7;
  metalMat.needsUpdate = true;
}

function applyScale(scale) {
  const s = Number(scale);
  pivot.scale.setScalar(Number.isFinite(s) && s > 0 ? s : 1);
}

function applyTube(tube) {
  if (!root) return;
  const t = Number(tube);
  const k = Number.isFinite(t) && t > 0 ? Math.min(1.18, Math.max(0.9, t / 0.32)) : 1;
  root.traverse(function (obj) {
    if (!obj.name) return;
    if (obj.name === 'Band' || obj.name.indexOf('Band_') === 0) obj.scale.set(1, 1, k);
  });
}

function applySetting(code) {
  if (!root) return;
  const want = 'Setting_' + (code || '4_PRONG');
  root.traverse(function (obj) {
    if (!obj.name || obj.name.indexOf('Setting_') !== 0) return;
    obj.visible = obj.name === want || obj.name.indexOf(want + '_') === 0;
  });
}

function gemGeom() {
  return new THREE.IcosahedronGeometry(0.05, 1);
}

function applyMarkers(markers) {
  while (extras.children.length) {
    const child = extras.children[0];
    extras.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material && child.material !== stoneMat && child.material !== metalMat) child.material.dispose();
  }
  const list = Array.isArray(markers) ? markers : [];
  const stones = list.filter(function (m) { return m && m.kind === 'stone'; });
  const main = stones[0];
  if (stoneMat) {
    stoneMat.color.copy(hexColor(main && main.color ? main.color : '#F5F7FF'));
    stoneMat.metalness = 0.02;
    stoneMat.roughness = 0.045;
    stoneMat.envMapIntensity = 1.85;
    stoneMat.needsUpdate = true;
  }
  function onBand(m) {
    var x = Number(m.x) || 0, y = Number(m.y) || 0, z = Number(m.z) || 0;
    var radial = Math.sqrt(x * x + z * z);
    var theta = Math.abs(y) < 0.45 && radial > 0.45 ? Math.atan2(z, x) : Math.atan2(y, x);
    return { x: Math.cos(theta) * 1.0, y: Math.sin(theta) * 1.0, z: 0.14 };
  }
  stones.slice(1).forEach(function (m) {
    const p = onBand(m);
    const mesh = new THREE.Mesh(
      gemGeom(),
      new THREE.MeshPhysicalMaterial({
        color: hexColor(m.color),
        metalness: 0.02,
        roughness: 0.06,
        envMapIntensity: 1.8,
      }),
    );
    mesh.position.set(p.x, p.y, p.z);
    extras.add(mesh);
  });
  // Dummy catalog has no attachment meshes; extra elements stay in parameters only.
}

function zoomBy(factor) {
  var k = Number(factor);
  if (!Number.isFinite(k) || k <= 0) return;
  spherical.radius *= k;
  applyCamera();
}

function run(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'setMetal') applyMetal(msg.hex, msg.purity);
  if (msg.type === 'setScale') applyScale(msg.scale);
  if (msg.type === 'setTube') applyTube(msg.tube);
  if (msg.type === 'setSetting') applySetting(typeof msg.code === 'string' ? msg.code : '');
  if (msg.type === 'setMarkers') applyMarkers(msg.markers);
  if (msg.type === 'zoom') zoomBy(msg.factor);
}

window.__studioSet = function (msg) {
  if (msg && msg.type === 'zoom') { zoomBy(msg.factor); return; }
  if (msg && msg.type === 'resize') { resize(msg.width, msg.height); return; }
  if (!root) { pending.push(msg); return; }
  run(msg);
};

function frameModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const max = Math.max(size.x, size.y, size.z, 0.001);
  frameMax = max;
  if (ITEM === 'NECKLACE') {
    camera.position.set(max * 0.12, -size.y * 0.08, max * 2.55);
  } else if (ITEM === 'EARRINGS') {
    camera.position.set(max * 0.18, max * 0.22, max * 2.15);
  } else {
    camera.position.set(max * 0.08, max * 0.04, max * 1.48);
  }
  spherical.setFromVector3(camera.position.clone().sub(target));
  applyFrameTarget();
}

function ready() {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ready');
}

function fail(err) {
  const el = document.getElementById('err');
  const msg = (err && err.message) ? err.message : String(err || 'load-failed');
  el.style.display = 'block';
  el.textContent = 'Could not load the 3D preview.';
  console.error(err);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('error:' + msg);
  ready();
}

new GLTFLoader().load(GLB, function (gltf) {
  root = gltf.scene;
  metalMat = new THREE.MeshPhysicalMaterial({
    color: 0xE4C441,
    metalness: 1,
    roughness: 0.18,
    envMapIntensity: 1.7,
    clearcoat: 0.5,
    clearcoatRoughness: 0.12,
  });
  metalMat.name = 'Metal';
  stoneMat = new THREE.MeshPhysicalMaterial({
    color: 0xF5F7FF,
    metalness: 0.02,
    roughness: 0.045,
    envMapIntensity: 1.85,
    ior: 2.417,
    specularIntensity: 1,
  });
  stoneMat.name = 'Stone';
  root.traverse(function (obj) {
    if (!obj.isMesh) return;
    var n = obj.name || '';
    var isStone = n.indexOf('Stone') === 0 || n.indexOf('Setting_PAVE') === 0;
    obj.material = isStone ? stoneMat : metalMat;
  });
  pivot.add(root);
  extras.name = 'Extras';
  root.add(extras);
  frameModel(root);
  pending.splice(0).forEach(run);
  ready();
}, undefined, fail);

function tick() {
  requestAnimationFrame(tick);
  renderer.render(scene, camera);
}
tick();
</script>
</body>
</html>`
}
