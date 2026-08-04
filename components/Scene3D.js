// ================================================================
// Scene3D — translucent prismatic "X" inside a curved grid tunnel
// Idle float + scroll-driven spin + per-section tint shifts
// ================================================================
import * as THREE from "three";
import gsap from "gsap";

// ---------- GRID TUNNEL SHADERS (inside of a cylinder) ----------
const tunnelVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const tunnelFrag = /* glsl */ `
  uniform vec3 uTint;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    // fine grid
    vec2 gv = vUv * vec2(48.0, 22.0);
    vec2 d = abs(fract(gv) - 0.5);
    float fine = smoothstep(0.46, 0.5, max(d.x, d.y));

    // coarse panel checker (the big dark/lit blocks)
    vec2 pv = floor(vUv * vec2(9.0, 4.0) + vec2(uTime * 0.015, 0.0));
    float checker = mod(pv.x + pv.y, 2.0);

    vec3 base = uTint * (0.04 + checker * 0.10);
    vec3 col = base + uTint * fine * 0.30;

    // vignette toward tunnel ends
    float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
    gl_FragColor = vec4(col * fade, 1.0);
  }
`;

// ---------- PRISM SHADERS (glassy, chromatic streaks) ----------
const prismVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = viewMatrix * wp;
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const prismFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uTint;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vWorld;

  void main() {
    vec3 n = normalize(vNormal);
    float fresnel = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 2.0);

    // fake refraction: banded streaks sliding across the faces
    float band = sin(vWorld.y * 7.0 + n.x * 9.0 + uTime * 0.5)
               * sin(vWorld.x * 5.0 - n.y * 7.0 + uTime * 0.3);
    float streak = smoothstep(0.55, 0.95, band * 0.5 + 0.5);

    // chromatic dispersion ramp along the streaks + rim
    vec3 spectrum = 0.5 + 0.5 * cos(6.2831 * (fresnel + vWorld.y * 0.18 + uTime * 0.02 + vec3(0.0, 0.33, 0.67)));

    vec3 col = vec3(0.02);                       // glass body: near-black
    col += vec3(0.85) * fresnel * 0.6;           // bright silvered rim
    col += spectrum * streak * (0.35 + fresnel); // prismatic flares
    col += uTint * 0.08;                         // pick up ambient tint

    float alpha = 0.45 + fresnel * 0.55;         // translucent core, solid edges
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Scene3D {
  constructor(container) {
    this.container = container;
    this.target = { x: 0, y: 0, z: 0, scale: 1 };
    this.mouse = new THREE.Vector2();
    this.mouseEased = new THREE.Vector2();
    this.scrollProgress = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.z = 7;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    container.appendChild(this.renderer.domElement);

    // ---- curved grid tunnel ----
    this.tunnelUniforms = {
      // CUSTOMIZE_3D_TINT_DEFAULT: starting tunnel colour (neutral grey)
      uTint: { value: new THREE.Color("#8a8a8a") },
      uTime: { value: 0 }
    };
    const tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 26, 72, 1, true),
      new THREE.ShaderMaterial({
        vertexShader: tunnelVert,
        fragmentShader: tunnelFrag,
        uniforms: this.tunnelUniforms,
        side: THREE.BackSide
      })
    );
    tunnel.rotation.z = Math.PI / 2; // axis along the view depth
    tunnel.rotation.y = Math.PI / 2;
    this.scene.add(tunnel);

    // ---- extruded X prism ----
    // CUSTOMIZE_LOGO_PATH: same silhouette as the loader letter
    const pts = [
      [30,20],[100,95],[170,20],[186,20],[108,105],[186,190],
      [170,190],[100,115],[30,190],[14,190],[92,105],[14,20]
    ];
    const shape = new THREE.Shape();
    pts.forEach(([x, y], i) => {
      const px = (x - 100) / 55, py = (105 - y) / 55;
      i === 0 ? shape.moveTo(px, py) : shape.lineTo(px, py);
    });
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.55, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2
    });
    geo.center();

    this.prismUniforms = {
      uTime: { value: 0 },
      uTint: { value: this.tunnelUniforms.uTint.value }
    };
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: prismVert,
        fragmentShader: prismFrag,
        uniforms: this.prismUniforms,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    this.mesh.scale.setScalar(0.001); // hidden until enter()
    this.scene.add(this.mesh);

    this.clock = new THREE.Clock();
    this.ready = new Promise((r) => (this._resolveReady = r));
    this._firstFrame = true;

    addEventListener("resize", () => this.onResize());
    addEventListener("pointermove", (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
    });

    this.renderer.setAnimationLoop(() => this.render());
  }

  // called when the preloader dissolves — prism scales up into view
  enter() {
    gsap.to(this.mesh.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 1.6, ease: "expo.out" });
    this.target.scale = 1;
  }

  setScroll(p) { this.scrollProgress = p; }

  // per-section recolour of tunnel + prism ambient
  setTint(hex) {
    const c = new THREE.Color(hex);
    const t = this.tunnelUniforms.uTint.value;
    gsap.to(t, { r: c.r, g: c.g, b: c.b, duration: 1.4, ease: "power2.inOut" });
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  render() {
    const t = this.clock.getElapsedTime();
    this.tunnelUniforms.uTime.value = t;
    this.prismUniforms.uTime.value = t;

    // CUSTOMIZE_3D_MOUSE_EASE: lower = heavier tracking lag
    this.mouseEased.lerp(this.mouse, 0.05);

    // CUSTOMIZE_3D_SHAPE_SPEED: idle drift + scroll-driven spin strength
    const IDLE = 0.10;
    const SPIN_TURNS = 3.0; // full rotations across the whole page
    this.mesh.rotation.y = t * IDLE + this.scrollProgress * Math.PI * 2 * SPIN_TURNS + this.mouseEased.x * 0.4;
    this.mesh.rotation.x = Math.sin(t * 0.4) * 0.08 + this.mouseEased.y * 0.25;
    this.mesh.position.y = this.target.y + Math.sin(t * 0.8) * 0.08; // gentle float

    // eased framing from GSAP scroll tweens
    this.mesh.position.x += (this.target.x - this.mesh.position.x) * 0.06;
    const s = this.mesh.scale.x + (this.target.scale * 1.6 - this.mesh.scale.x) * 0.045;
    if (this.mesh.scale.x > 0.01) this.mesh.scale.setScalar(s);

    this.renderer.render(this.scene, this.camera);

    if (this._firstFrame) { this._firstFrame = false; this._resolveReady(); }
  }
}
