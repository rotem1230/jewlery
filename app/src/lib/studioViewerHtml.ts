import { JEWELRY_GEOMETRY_JS } from '@/src/lib/jewelryGeometry.generated'

/**
 * The 3D studio page. The piece is built from the design's parameters by the shared parametric
 * geometry (the same code the server exports STL and pictures with), so what the designer sees is
 * what gets made.
 *
 * Messages (window.__studioSet): { type: 'setDesign', itemType, parameters, ringChartDiameterMm }
 * rebuilds the piece; { type: 'zoom', factor }, { type: 'view', view: 'front' | 'side' | 'top' }
 * and { type: 'resize', width, height } move the view;
 * { type: 'edit', target: { kind: 'stone' | 'element', index } | null } makes a one-finger drag move
 * that item instead of turning the view. Where the finger lets go is posted back as
 * 'placement:' + JSON { kind, index, angleDeg, offsetMm } (the angle on the piece and the place
 * across the band, from the shared geometry).
 */
export function studioViewerHtml(options: { itemType?: string } = {}): string {
  const item = JSON.stringify(options.itemType ?? 'RING')
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
  <script>${JEWELRY_GEOMETRY_JS}</script>
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

const GEO = window.JewelryGeometry;
let ITEM = ${item};
const STAGE = 0xF6F2FF;
/** Viewing angle per piece, in degrees: the same framing as the rendered pictures. */
const VIEWS = {
  RING: { az: 28, el: 20, fill: 0.8 },
  NECKLACE: { az: 0, el: 12, fill: 0.88 },
  BRACELET: { az: 0, el: 18, fill: 0.86 },
  EARRINGS: { az: 16, el: 10, fill: 0.86 },
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(STAGE);
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.style.touchAction = 'none';
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
if ('environmentIntensity' in scene) scene.environmentIntensity = 1.15;

scene.add(new THREE.HemisphereLight(0xfff7ee, 0x6e6480, 0.25));
const key = new THREE.DirectionalLight(0xfff3dc, 1.5);
key.position.set(2.8, 4.6, 3.2);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffe9c4, 0.6);
rim.position.set(-0.4, 2.2, -3.8);
scene.add(rim);

const target = new THREE.Vector3();
const spherical = new THREE.Spherical(40, 1.2, 0.4);
let frameRadius = 20;
function applyCamera() {
  spherical.makeSafe();
  spherical.phi = Math.min(Math.PI - 0.02, Math.max(0.02, spherical.phi));
  spherical.radius = Math.min(frameRadius * 12, Math.max(frameRadius * 0.6, spherical.radius));
  camera.position.setFromSpherical(spherical).add(target);
  camera.near = Math.max(0.05, frameRadius * 0.02);
  camera.far = frameRadius * 60;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
}

let drag = null;
let pinch0 = 0;
/** The item a drag places ({ kind, index }), or null: a drag turns the view. */
let editTarget = null;
let placing = null;
let currentSpec = null;
const raycaster = new THREE.Raycaster();
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(1, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x6b4eff, transparent: true, opacity: 0.55, depthTest: false }),
);
marker.renderOrder = 10;
marker.visible = false;
scene.add(marker);

/** The point of the piece under a screen position, or null. */
function pieceHit(p) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pieceGroup.children, false);
  return hits.length ? hits[0].point : null;
}
/** Where the item being dragged was when the drag began (degrees), for keeping it off the head. */
let dragFrom = null;
function itemAngleDeg(target) {
  if (!currentSpec || !target || currentSpec.itemType !== 'RING' || target.kind !== 'element' || !GEO.ringLayout) return null;
  const seat = GEO.ringLayout(currentSpec).elements[target.index];
  return seat ? (seat.angle * 180) / Math.PI : null;
}
function placeAt(p) {
  const hit = pieceHit(p);
  if (!hit || !currentSpec) return;
  // The piece may be shown turned (a ring's head on top): placements are in the model's own frame.
  const local = pieceGroup.worldToLocal(hit.clone());
  const point = [local.x, local.y, local.z];
  // An element dragged over the head stays against it, on the side it came from.
  const from = placing ? placing.angleDeg : dragFrom;
  placing = GEO.dragPlacement ? GEO.dragPlacement(currentSpec, editTarget, point, from) : GEO.placementFromPoint(currentSpec, point);
  marker.position.copy(hit);
  marker.scale.setScalar(Math.max(0.6, frameRadius * 0.035));
  marker.visible = true;
}
function finishPlacing() {
  marker.visible = false;
  if (placing && editTarget && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage('placement:' + JSON.stringify({
      kind: editTarget.kind, index: editTarget.index, angleDeg: placing.angleDeg, offsetMm: placing.offsetMm,
      behindHead: placing.behindHead === true,
    }));
  }
  placing = null;
}
function pos(e) {
  var t = e.touches ? e.touches[0] : e;
  return { x: t.clientX, y: t.clientY };
}
function pinchDist(e) {
  var a = e.touches[0], b = e.touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
function onDown(e) {
  if (e.type.indexOf('pointer') === 0 && e.pointerType !== 'mouse') return;
  if (e.touches && e.touches.length === 2) { drag = null; placing = null; marker.visible = false; pinch0 = pinchDist(e); return; }
  drag = pos(e);
  if (editTarget) {
    placing = null;
    dragFrom = itemAngleDeg(editTarget);
    placeAt(drag);
  }
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
  if (editTarget) { drag = p; placeAt(p); return; }
  spherical.theta -= (p.x - drag.x) * 0.008;
  // A finger keeps off the pole (where the view would spin); only the "top" button goes nearer.
  var minPhi = Math.min(0.12, spherical.phi);
  spherical.phi = Math.min(Math.PI - 0.12, Math.max(minPhi, spherical.phi - (p.y - drag.y) * 0.008));
  drag = p;
  applyCamera();
}
function onUp() {
  if (editTarget && drag) finishPlacing();
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

let viewW = 0;
let viewH = 0;
function viewportSize() {
  var vv = window.visualViewport;
  var w = Math.round((vv && vv.width) || document.documentElement.clientWidth || window.innerWidth || 1);
  var h = Math.round((vv && vv.height) || document.documentElement.clientHeight || window.innerHeight || 1);
  return { w: Math.max(1, w), h: Math.max(1, h) };
}
function resize(nextW, nextH) {
  var size = viewportSize();
  var w = nextW > 0 ? nextW : (viewW || size.w);
  var h = nextH > 0 ? nextH : (viewH || size.h);
  if (nextW > 0 && nextH > 0) { viewW = nextW; viewH = nextH; }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
resize();
window.addEventListener('resize', function () { resize(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { resize(); });

const pieceGroup = new THREE.Group();
scene.add(pieceGroup);
let framed = false;
let framedItem = '';

function linearColor(rgb) {
  return new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
}
function metalMaterial(code, purity, finish) {
  const f0 = (GEO.METAL_REFLECTANCE && GEO.METAL_REFLECTANCE[code]) || GEO.METAL_REFLECTANCE.YELLOW_GOLD;
  const matte = /MATTE|BRUSH|SATIN|SAND/i.test(finish || '');
  return new THREE.MeshPhysicalMaterial({
    color: linearColor(f0),
    metalness: 1,
    roughness: matte ? 0.42 : purity === '18K' ? 0.12 : 0.16,
    clearcoat: matte ? 0 : 0.45,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide,
  });
}
function stoneMaterial(code, opaque) {
  const color = new THREE.Color((GEO.STONE_COLORS && GEO.STONE_COLORS[code]) || '#DDE3FF');
  if (opaque) {
    // Opal, lapis, turquoise…: no light through the stone, a polished surface.
    return new THREE.MeshPhysicalMaterial({
      color: color,
      metalness: 0,
      roughness: 0.32,
      clearcoat: 0.8,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.1,
      side: THREE.DoubleSide,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: color,
    metalness: 0.02,
    roughness: 0.04,
    ior: 2.4,
    specularIntensity: 1,
    envMapIntensity: 1.9,
    flatShading: true,
    side: THREE.DoubleSide,
  });
}
function geometryOf(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
  g.setIndex(mesh.indices);
  return g;
}
function clearPiece() {
  while (pieceGroup.children.length) {
    const child = pieceGroup.children[0];
    pieceGroup.remove(child);
    child.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose && o.material.dispose();
    });
  }
}

/** Points the camera at the piece the first time (and when the kind of piece changes). */
function frame(force) {
  if (framed && !force) return;
  const box = new THREE.Box3().setFromObject(pieceGroup);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  frameRadius = Math.max(sphere.radius, 1);
  target.copy(sphere.center);
  const view = VIEWS[ITEM] || VIEWS.RING;
  const fov = (camera.fov * Math.PI) / 180;
  const fitV = frameRadius / Math.sin(fov / 2) / view.fill;
  const hFov = 2 * Math.atan(Math.tan(fov / 2) * Math.max(camera.aspect, 0.2));
  const fitH = frameRadius / Math.sin(hFov / 2) / view.fill;
  const az = (view.az * Math.PI) / 180;
  const elev = (view.el * Math.PI) / 180;
  spherical.radius = Math.max(fitV, fitH);
  spherical.phi = Math.PI / 2 - elev;
  spherical.theta = az;
  framed = true;
  applyCamera();
}

function setDesign(msg) {
  if (msg.itemType && msg.itemType !== ITEM) ITEM = msg.itemType;
  const spec = GEO.specFromParameters(ITEM, msg.parameters || {}, { ringChartDiameterMm: msg.ringChartDiameterMm });
  const model = GEO.buildJewelry(spec);
  currentSpec = spec;
  clearPiece();
  model.parts.forEach(function (part) {
    const material = part.material === 'metal' ? metalMaterial(part.code, spec.purityCode, spec.finishCode) : stoneMaterial(part.code, part.opaque);
    pieceGroup.add(new THREE.Mesh(geometryOf(part.mesh), material));
  });
  // A ring stands with its head on top wherever its centre stone was put, so turning the view and
  // the front / side / top buttons show it the right way up (the client's notes of 24.11).
  pieceGroup.rotation.z = GEO.viewTurn ? GEO.viewTurn(spec) : 0;
  pieceGroup.updateMatrixWorld(true);
  const force = framedItem !== ITEM;
  framedItem = ITEM;
  frame(force);
}

function zoomBy(factor) {
  var k = Number(factor);
  if (!Number.isFinite(k) || k <= 0) return;
  spherical.radius *= k;
  applyCamera();
}

/**
 * Square views of the piece (Y up, a ring's finger hole facing +Z): front (from +Z), side (from
 * +X, the band's width and the head's height) and top (from above, onto the stone).
 */
const SQUARE_VIEWS = {
  front: { theta: 0, phi: Math.PI / 2 },
  side: { theta: Math.PI / 2, phi: Math.PI / 2 },
  top: { theta: 0, phi: 0.02 },
};
function setView(name) {
  const view = SQUARE_VIEWS[name];
  if (!view) return;
  frame(true);
  spherical.theta = view.theta;
  spherical.phi = view.phi;
  applyCamera();
}

function ready() {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ready');
}
function fail(err) {
  const box = document.getElementById('err');
  const msg = (err && err.message) ? err.message : String(err || 'load-failed');
  box.style.display = 'block';
  console.error(err);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('error:' + msg);
  ready();
}

window.__studioSet = function (msg) {
  if (!msg || typeof msg !== 'object') return;
  try {
    if (msg.type === 'zoom') zoomBy(msg.factor);
    else if (msg.type === 'view') setView(msg.view);
    else if (msg.type === 'resize') { resize(msg.width, msg.height); if (framed) frame(true); }
    else if (msg.type === 'setDesign') setDesign(msg);
    else if (msg.type === 'edit') {
      const target = msg.target;
      editTarget = target && (target.kind === 'stone' || target.kind === 'element') && Number.isInteger(target.index) ? target : null;
      placing = null;
      marker.visible = false;
    }
  } catch (err) {
    fail(err);
  }
};

if (!GEO) {
  fail(new Error('geometry unavailable'));
} else {
  ready();
}

function tick() {
  requestAnimationFrame(tick);
  renderer.render(scene, camera);
}
tick();
</script>
</body>
</html>`
}
