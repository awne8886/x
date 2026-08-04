// ================================================================
// X STUDIO — blueprint loader → glass prism world
// ================================================================
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Scene3D } from "./components/Scene3D.js";

gsap.registerPlugin(ScrollTrigger);

const scene3d = new Scene3D(document.querySelector("#webgl"));

// ----------------------------------------------------------------
// SMOOTH SCROLL
// ----------------------------------------------------------------
// CUSTOMIZE_SCROLL_WEIGHT: raise duration for heavier drag
const lenis = new Lenis({
  duration: 1.6,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true
});
lenis.stop();
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

document.querySelectorAll("[data-scroll-link]").forEach((link) => {
  link.addEventListener("click", (e) => {
    const target = link.getAttribute("href");
    if (target && target.startsWith("#")) {
      e.preventDefault();
      lenis.scrollTo(target === "#top" ? 0 : target, { duration: 1.6 });
    }
  });
});

// ----------------------------------------------------------------
// TEXT DECODE (scramble) — random glyphs resolve left → right
// ----------------------------------------------------------------
// CUSTOMIZE_TEXT: glyph pool used while scrambling
const POOL = "XLHECA";

function decode(el, finalText, duration = 2.2) {
  return new Promise((resolve) => {
    const len = finalText.length;
    const start = performance.now();
    (function tick(now) {
      const p = Math.min((now - start) / (duration * 1000), 1);
      const solved = Math.floor(p * len);
      let solidPart = finalText.slice(0, solved);
      let ghostPart = "";
      for (let i = solved; i < len; i++) {
        ghostPart += finalText[i] === " " ? " " : POOL[(Math.random() * POOL.length) | 0];
      }
      el.innerHTML = solidPart + `<span class="ghost">${ghostPart}</span>`;
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    })(performance.now());
  });
}

// ----------------------------------------------------------------
// PRELOADER SEQUENCE
// guides fade in → letter stroke-draws → tagline decodes → cut to hero
// ----------------------------------------------------------------
const outer = document.querySelector("#letterOuter");
const inner = document.querySelector("#letterInner");
const decodeLine = document.querySelector("#decodeLine");

// prep stroke-draw: dash = full path length, offset hides it
[outer, inner].forEach((p) => {
  const L = p.getTotalLength();
  p.style.strokeDasharray = L;
  p.style.strokeDashoffset = L;
});

const introTl = gsap.timeline();
introTl
  .to(".preloader__guides .guides", { opacity: 0.3, duration: 1.2, ease: "power1.inOut" })
  // CUSTOMIZE_LOADER_SPEED: letter draw duration
  .to(outer, { strokeDashoffset: 0, duration: 2.4, ease: "power2.inOut" }, "-=0.4")
  .to(inner, { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut" }, "-=1.4")
  .add(() => decode(decodeLine, decodeLine.dataset.final), "-=2.2");

const pageLoaded = new Promise((r) => {
  if (document.readyState === "complete") r();
  else window.addEventListener("load", r, { once: true });
});
// CUSTOMIZE_PRELOADER_MIN_TIME: minimum seconds on screen
const minTime = new Promise((r) => setTimeout(r, 3400));

Promise.all([pageLoaded, minTime, scene3d.ready]).then(() => {
  const exitTl = gsap.timeline({
    onComplete: () => {
      document.querySelector("#preloader").style.display = "none";
      lenis.start();
      ScrollTrigger.refresh();
    }
  });
  exitTl
    // drawing "completes": guides + letter flare briefly, then the whole
    // blueprint dissolves straight into the hero (hard cut feel, no curtain)
    .to(".preloader__letter", { opacity: 1, duration: 0.15 })
    .to(".preloader__guides .guides", { opacity: 0.55, duration: 0.3, ease: "power1.in" })
    .to("#preloader", { opacity: 0, duration: 0.9, ease: "power2.inOut", delay: 0.2 })
    .add(() => scene3d.enter(), "-=0.8")
    .to("#hero [data-reveal]", { opacity: 1, y: 0, duration: 1.1, stagger: 0.12, ease: "expo.out" }, "-=0.4")
    .to(".bg-word span", { opacity: 1, duration: 1.2 }, "<");
});

// ----------------------------------------------------------------
// GIANT BACKGROUND WORD + PER-SECTION TINT
// word swaps and grid tint recolours as each section enters
// ----------------------------------------------------------------
const bgWordEl = document.querySelector("#bgWord span");

document.querySelectorAll("section[data-bg-word]").forEach((sec) => {
  ScrollTrigger.create({
    trigger: sec,
    start: "top 55%",
    end: "bottom 55%",
    onToggle: (self) => {
      if (!self.isActive) return;
      // CUSTOMIZE_TEXT: background words come from data-bg-word attributes
      gsap.to(bgWordEl, {
        opacity: 0, duration: 0.25, onComplete: () => {
          bgWordEl.textContent = sec.dataset.bgWord;
          gsap.to(bgWordEl, { opacity: 1, duration: 0.5 });
        }
      });
      scene3d.setTint(sec.dataset.tint); // grid tunnel recolours (white→blue→green→…)
    }
  });
});

// slow parallax drift on the giant word
gsap.to(bgWordEl, {
  xPercent: -12,
  ease: "none",
  scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 2 }
});

// ----------------------------------------------------------------
// SECTION REVEALS
// ----------------------------------------------------------------
["#about", "#contact"].forEach((sel) => {
  gsap.to(`${sel} [data-reveal]`, {
    opacity: 1, y: 0, duration: 1.1, stagger: 0.14, ease: "expo.out",
    scrollTrigger: { trigger: sel, start: "top 65%", once: true }
  });
});

// ----------------------------------------------------------------
// HORIZONTAL TRACK — pinned, right → left, velocity distortion
// ----------------------------------------------------------------
const strip = document.querySelector(".portfolio-strip");
const trackSection = document.querySelector(".portfolio-track-section");
const dist = () => strip.scrollWidth - window.innerWidth;

gsap.to(strip, {
  x: () => -dist(),
  ease: "none",
  scrollTrigger: {
    trigger: trackSection,
    start: "top top",
    // CUSTOMIZE_TRACK_LENGTH: multiplier = fly-past duration
    end: () => `+=${dist() * 1.2}`,
    pin: true,
    scrub: 1.1,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    // edge distortion: cards skew/stretch with scroll velocity,
    // easing back to rest when the wheel stops
    onUpdate: (self) => {
      const v = gsap.utils.clamp(-1200, 1200, self.getVelocity());
      gsap.to(".card", {
        skewX: v / -160,
        scaleY: 1 + Math.abs(v) / 14000,
        duration: 0.6,
        ease: "power3.out",
        overwrite: "auto"
      });
    }
  }
});

// cards remain real <a> tags — transforms never break clicks

// ----------------------------------------------------------------
// SCROLL ↔ 3D — the prism spins as you scroll, recedes during works
// ----------------------------------------------------------------
ScrollTrigger.create({
  trigger: document.body,
  start: "top top",
  end: "bottom bottom",
  onUpdate: (self) => scene3d.setScroll(self.progress)
});

gsap.to(scene3d.target, {
  scale: 0.72, y: 0.2,
  scrollTrigger: { trigger: trackSection, start: "top bottom", end: "top top", scrub: 1.4 }
});
gsap.to(scene3d.target, {
  scale: 1.0, y: 0,
  scrollTrigger: { trigger: "#contact", start: "top bottom", end: "top center", scrub: 1.4 }
});
