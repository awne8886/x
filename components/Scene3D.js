// ================================================================
// Scene3D — transparent full-viewport Three.js layer
// Iridescent chrome icosahedron: idle rotation + eased mouse warp
// ================================================================
import * as THREE from "three";

// ---------------- GLSL ----------------
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2  uMouse;      // eased, -1..1
  uniform float uScroll;     // 0..1 page progress
  uniform float uDistort;    // CUSTOMIZE via constructor option

  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDisp;

  // --- simplex noise (Ashima) ---
  vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    // mouse proximity boosts the warp on the facing side
    float mouseInfluence = dot(normalize(position), normalize(vec3(uMouse * 2.0, 1.0)));
    mouseInfluence = smoothstep(-1.0, 1.0, mouseInfluence);

    float n = snoise(position * 1.6 + uTime * 0.25);
    float scrollPulse = 0.5 + uScroll * 1.2;

    float disp = n * uDistort * (0.6 + mouseInfluence * 0.9) * scrollPulse;
    vec3 newPos = position + normal * disp;
    vDisp = disp;

    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;

  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDisp;

  // thin-film style iridescence ramp
  vec3 iridescence(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  }

  void main() {
    float fresnel = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);

    // hue drifts with time, scroll and surface displacement
    float hueShift = fresnel * 0.9 + vDisp * 1.4 + uTime * 0.03 + uScroll * 0.5;
    vec3 film = iridescence(hueShift);

    // CUSTOMIZE_3D_COLOR: base chrome tint
    vec3 chrome = vec3(0.06, 0.07, 0.09);
    vec3 color = mix(chrome, film, fresnel);

    // hot rim glow
    color += film * pow(fresnel, 4.0) * 1.6;

    // alpha keeps the core glassy, edges solid
    float alpha = 0.25 + fresnel * 0.75;
    gl_FragColor = vec4(color, alpha);
  }
`;

// ---------------- CLASS ----------------
export class Scene3D {
  constructor(container) {
    this.container = container;

    // public animation target — GSAP tweens these, we apply them each frame
    this.target = { x: 0, y: 0, z: 0, scale: 1 };

    this.mouse = new THREE.Vector2(0, 0);        // raw
    this.mouseEased = new THREE.Vector2(0, 0);   // heavy-eased

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    // CUSTOMIZE_3D_DETAIL: subdivision level (higher = smoother, heavier)
    const geometry = new THREE.IcosahedronGeometry(1.5, 96);

    this.uniforms = {
      uTime: { value: 0 },
      uMouse: { value: this.mouseEased },
      uScroll: { value: 0 },
      // CUSTOMIZE_3D_DISTORT: warp amplitude of the blob surface
      uDistort: { value: 0.35 }
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    this.clock = new THREE.Clock();

    // resolves after the first rendered frame — preloader waits on this
    this.ready = new Promise((resolve) => (this._resolveReady = resolve));
    this._firstFrame = true;

    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("pointermove", (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    });

    this.renderer.setAnimationLoop(() => this.render());
  }

  setScroll(progress) {
    this.uniforms.uScroll.value = progress;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    const t = this.clock.getElapsedTime();
    this.uniforms.uTime.value = t;

    // heavy easing toward raw mouse (the "expensive" lag feel)
    // CUSTOMIZE_3D_MOUSE_EASE: lower = heavier/slower tracking
    this.mouseEased.lerp(this.mouse, 0.045);

    // idle rotation + mouse steering
    // CUSTOMIZE_3D_SHAPE_SPEED: Adjust value to change background asset rotation velocity
    const IDLE_SPEED = 0.12;
    this.mesh.rotation.y = t * IDLE_SPEED + this.mouseEased.x * 0.6;
    this.mesh.rotation.x = t * IDLE_SPEED * 0.6 + this.mouseEased.y * 0.4;

    // apply GSAP-driven framing with soft interpolation
    this.mesh.position.x += (this.target.x - this.mesh.position.x) * 0.06;
    this.mesh.position.y += (this.target.y - this.mesh.position.y) * 0.06;
    this.mesh.position.z += (this.target.z - this.mesh.position.z) * 0.06;
    const s = this.mesh.scale.x + (this.target.scale - this.mesh.scale.x) * 0.06;
    this.mesh.scale.setScalar(s);

    this.renderer.render(this.scene, this.camera);

    if (this._firstFrame) {
      this._firstFrame = false;
      this._resolveReady();
    }
  }
}

