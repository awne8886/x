// ================================================================
// Scene3D — grid tunnel + glass prism with MOLTEN entry and RIPPLE
// ================================================================
import * as THREE from "three";
import gsap from "gsap";

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
  uniform float uRipple;      // 0 = calm, 1 = full shockwave
  uniform float uRippleTime;  // seconds since ripple started
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;

    // RIPPLE: concentric rings radiating from screen center,
    // displacing the grid like a stone dropped in water
    vec2 c = uv - 0.5;
    float dist = length(c);
    float wave = sin(dist * 42.0 - uRippleTime * 9.0) * exp(-dist * 5.0);
    uv += normalize(c + 1e-5) * wave * 0.035 * uRipple;

    // fine grid
    vec2 gv = uv * vec2(48.0, 22.0);
    vec2 d = abs(fract(gv) - 0.5);
    float fine = smoothstep(0.46, 0.5, max(d.x, d.y));

    // coarse panel checker
    vec2 pv = floor(uv * vec2(9.0, 4.0) + vec2(uTime * 0.015, 0.0));
    float checker = mod(pv.x + pv.y, 2.0);

    vec3 base = uTint * (0.04 + checker * 0.10);
    vec3 col = base + uTint * fine * 0.30;
    col += uTint * abs(wave) * uRipple * 1.6; // rings glow as they pass

    float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
    gl_FragColor = vec4(col * fade, 1.0);
  }
`;

const prismVert = /* glsl */ `
  uniform float uTime;
  uniform float uMelt; // 1 = liquid swirl, 0 = solid glass
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vWorld;

  // cheap 3D noise
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  void main() {
    vec3 pos = position;

    // MOLTEN state: vertices swirl around Y and bulge with noise,
    // collapsing to the crisp extrusion as uMelt → 0
    float swirl = uMelt * (pos.y * 2.0 + uTime * 1.4);
    float cs = cos(swirl), sn = sin(swirl);
    pos.xz = mat2(cs, -sn, sn, cs) * pos.xz;
    pos += normal * noise(pos * 2.4 + uTime * 0.6) * uMelt * 0.35;

    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = viewMatrix * wp;
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const prismFrag = /* glsl */ `
  uniform float uTime;
  uniform float uMelt;
  uniform vec3 uTint;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vWorld;

  void main() {
    vec3 n = normalize(vNormal);
    float fresnel = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 2.0);

    float band = sin(vWorld.y * 7.0 + n.x * 9.0 + uTime * 0.5)
               * sin(vWorld.x * 5.0 - n.y * 7.0 + uTime * 0.3);
    float streak = smoothstep(0.55, 0.95, band * 0.5 + 0.5);

    vec3 spectrum = 0.5 + 0.5 * cos(6.2831 * (fresnel + vWorld.y * 0.18 + uTime * 0.02 + vec3(0.0, 0.33, 0.67)));

    vec3 glass = vec3(0.02);
    glass += vec3(0.85) * fresnel * 0.6;
    glass += spectrum * streak * (0.35 + fresnel);
    glass += uTint * 0.08;

    // molten look: milky white/grey fluid (frames ~34–55), no spectrum yet
    vec3 molten = vec3(0.75) * (0.35 + fresnel * 0.8);
    vec3 col = mix(glass, molten, uMelt);

    float alpha = mix(0.45 + fresnel * 0.55, 0.85, uMelt);
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

    // ---- grid tunnel ----
    this.tunnelUniforms = {
      // CUSTOMIZE_3D_TINT_DEFAULT: starting tunnel colour
      uTint: { value: new THREE.Color("#8a8a8a") },
      uTime: { value: 0 },
      uRipple: { value: 0 },
      uRippleTime: { value: 0 }
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
    tunnel.rotation.z = Math.PI / 2;
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
      depth: 0.55, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2,
      steps: 2, curveSegments: 8
    });
    geo.center();

    this.prismUniforms = {
      uTime: { value: 0 },
      uMelt: { value: 1 },
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
    this.mesh.scale.setScalar(0.001);
    this.scene.add(this.mesh);

    this.clock = new THREE.Clock();
    this.rippleStart = -10;
    this.ready = new Promise((r) => (this._resolveReady = r));
    this._firstFrame = true;

    addEventListener("resize", () => this.onResize());
    addEventListener("pointermove", (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
    });

    this.renderer.setAnimationLoop(() => this.render());
  }

  // molten entry: prism scales up as swirling liquid, then hardens to glass
  enterMolten() {
    // CUSTOMIZE_MELT_DURATION: seconds of liquid → solid
    gsap.to(this.mesh.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 1.4, ease: "expo.out" });
    gsap.to(this.prismUniforms.uMelt, { value: 0, duration: 2.2, ease: "power2.inOut", delay: 0.3 });
    this.target.scale = 1;
  }

  // concentric shockwave through the grid, decays on its own
  ripple() {
    this.rippleStart = this.clock.getElapsedTime();
    this.tunnelUniforms.uRipple.value = 1;
    gsap.to(this.tunnelUniforms.uRipple, { value: 0, duration: 2.4, ease: "power2.out" });
  }

  setScroll(p) { this.scrollProgress = p; }

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
    this.tunnelUniforms.uRippleTime.value = t - this.rippleStart;
    this.prismUniforms.uTime.value = t;

    // CUSTOMIZE_3D_MOUSE_EASE: lower = heavier lag
    this.mouseEased.lerp(this.mouse, 0.05);

    // CUSTOMIZE_3D_SHAPE_SPEED: idle drift + scroll spin
    const IDLE = 0.10;
    const SPIN_TURNS = 3.0;
    this.mesh.rotation.y = t * IDLE + this.scrollProgress * Math.PI * 2 * SPIN_TURNS + this.mouseEased.x * 0.4;
    this.mesh.rotation.x = Math.sin(t * 0.4) * 0.08 + this.mouseEased.y * 0.25;
    this.mesh.position.y = this.target.y + Math.sin(t * 0.8) * 0.08;

    this.mesh.position.x += (this.target.x - this.mesh.position.x) * 0.06;
    const s = this.mesh.scale.x + (this.target.scale * 1.6 - this.mesh.scale.x) * 0.045;
    if (this.mesh.scale.x > 0.01) this.mesh.scale.setScalar(s);

    this.renderer.render(this.scene, this.camera);

    if (this._firstFrame) { this._firstFrame = false; this._resolveReady(); }
  }
}
