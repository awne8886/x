// ================================================================
// X STUDIO — blueprint draw → liquid melt/ripple → prism world
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
// TEXT DECODE — scrambled glyphs resolve left → right
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
      let ghost = "";
      for (let i = solved; i < len; i++) {
        ghost += finalText[i] === " " ? " " : POOL[(Math.random() * POOL.length) | 0];
      }
      el.innerHTML = finalText.slice(0, solved) + `<span class="ghost">${ghost}</span>`;
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    })(performance.now());
  });
}

// ----------------------------------------------------------------
// PRELOADER — frames 1→66 of the sequence:
// void → guides draw → letter strokes → decode → LIQUID MELT + RIPPLE → hero
// ----------------------------------------------------------------
const outer = document.querySelector("#letterOuter");
const inner = document.querySelector("#letterInner");
const decodeLine = document.querySelector("#decodeLine");
const letterSvg = document.querySelector(".preloader__letter");

[outer, inner].forEach((p) => {
  const L = p.getTotalLength();
  p.style.strokeDasharray = L;
  p.style.strokeDashoffset = L;
});

const introTl = gsap.timeline();
introTl
  // guides fade in staggered, like frames 5–12
  .to(".preloader__guides .guides", { opacity: 0.3, duration: 1.2, ease: "power1.inOut" })
  // CUSTOMIZE_LOADER_SPEED: letter draw duration
  .to(outer, { strokeDashoffset: 0, duration: 2.4, ease: "power2.inOut" }, "-=0.4")
  .to(inner, { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut" }, "-=1.4")
  .add(() => decode(decodeLine, decodeLine.dataset.final), "-=2.2");

const pageLoaded = new Promise((r) => {
  if (document.readyState === "complete") r();
  else window.addEventListener("load", r, { once: true });
});
// CUSTOMIZE_PRELOADER_MIN_TIME: minimum ms on screen
const minTime = new Promise((r) => setTimeout(r, 3600));

Promise.all([pageLoaded, minTime, scene3d.ready]).then(() => {
  const exitTl = gsap.timeline({
    onComplete: () => {
      document.querySelector("#preloader").style.display = "none";
      lenis.start();
      ScrollTrigger.refresh();
    }
  });

  exitTl
    // guides retreat first — the drawing "lifts off the paper"
    .to(".preloader__guides .guides", { opacity: 0, duration: 0.8, ease: "power2.in" })
    // LIQUID MELT (frames ~34–55): the outline swirls, blurs and rotates
    // while the WebGL prism materialises underneath in its molten state
    .add(() => scene3d.enterMolten(), "<")
    .to(letterSvg, {
      rotate: 40,
      scale: 0.82,
      filter: "blur(14px)",
      opacity: 0,
      duration: 1.6,
      ease: "power3.inOut"
    }, "<")
    // RIPPLE burst — concentric shockwave through the grid tunnel
    .add(() => scene3d.ripple(), "-=0.9")
    .to("#preloader", { opacity: 0, duration: 0.6, ease: "power1.out" }, "-=0.6")
    // hero settles (frames 56–66)
    .to("#hero [data-reveal]", { opacity: 1, y: 0, duration: 1.1, stagger: 0.12, ease: "expo.out" }, "-=0.3")
    .to(".bg-word span", { opacity: 1, duration: 1.2 }, "<");
});

// ----------------------------------------------------------------
// GIANT BACKGROUND WORD + PER-SECTION TINT
// ----------------------------------------------------------------
const bgWordEl = document.querySelector("#bgWord span");

document.querySelectorAll("section[data-bg-word]").forEach((sec) => {
  ScrollTrigger.create({
    trigger: sec,
    start: "top 55%",
    end: "bottom 55%",
    onToggle: (self) => {
      if (!self.isActive) return;
      gsap.to(bgWordEl, {
        opacity: 0, duration: 0.25, onComplete: () => {
          bgWordEl.textContent = sec.dataset.bgWord;
          gsap.to(bgWordEl, { opacity: 1, duration: 0.5 });
        }
      });
      scene3d.setTint(sec.dataset.tint);
    }
  });
});

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
// CAROUSEL v2 — frames 97–140:
// cards fly in from the right and SNAP to dead center, one at a time.
// Center card scales up + shows meta; edges warp with velocity.
// ----------------------------------------------------------------
const strip = document.querySelector(".portfolio-strip");
const trackSection = document.querySelector(".portfolio-track-section");
const cards = gsap.utils.toArray(".card");
const warpMap = document.querySelector("#edgeWarpMap");

// x offset that puts card i's center on the viewport center
function centerX(i) {
  const c = cards[i];
  return -(c.offsetLeft + c.offsetWidth / 2 - window.innerWidth / 2);
}

const track = gsap.fromTo(strip,
  { x: () => centerX(0) },
  {
    x: () => centerX(cards.length - 1),
    ease: "none",
    scrollTrigger: {
      trigger: trackSection,
      start: "top top",
      // CUSTOMIZE_TRACK_LENGTH: px of scroll per card
      end: () => `+=${cards.length * window.innerHeight * 0.75}`,
      pin: true,
      scrub: 1.1,
      // the "settle into the middle" feel: snaps to each card's center
      snap: {
        snapTo: 1 / (cards.length - 1),
        duration: { min: 0.25, max: 0.7 },
        ease: "power3.out"
      },
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        // EDGE DISTORTION: displacement amount follows scroll velocity,
        // easing back to 0 (crisp edges) when a card is settled
        const v = Math.abs(gsap.utils.clamp(-1500, 1500, self.getVelocity()));
        // CUSTOMIZE_WARP_STRENGTH: multiplier for the edge melt
        gsap.to(warpMap, { attr: { scale: v / 28 }, duration: 0.4, overwrite: "auto" });
        updateCardEmphasis();
      },
      onScrubComplete: () => gsap.to(warpMap, { attr: { scale: 0 }, duration: 0.5 })
    }
  }
);

// scale/opacity by distance from viewport center; meta only when centered
function updateCardEmphasis() {
  const mid = window.innerWidth / 2;
  cards.forEach((card) => {
    const r = card.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - mid) / mid; // 0 center → 1+ edge
    const t = gsap.utils.clamp(0, 1, 1 - d);
    gsap.set(card, { scale: 0.82 + t * 0.18, opacity: 0.35 + t * 0.65 });
    gsap.to(card.querySelector(".card__meta"), {
      opacity: t > 0.82 ? 1 : 0,
      y: t > 0.82 ? 0 : 12,
      duration: 0.35,
      overwrite: "auto"
    });
  });
}
updateCardEmphasis();

// cards remain plain <a> tags — clicks work even mid-flight

// ----------------------------------------------------------------
// SCROLL ↔ 3D
// ----------------------------------------------------------------
ScrollTrigger.create({
  trigger: document.body,
  start: "top top",
  end: "bottom bottom",
  onUpdate: (self) => scene3d.setScroll(self.progress)
});

// prism steps aside + recedes while the carousel owns the center
gsap.to(scene3d.target, {
  x: -0.9, scale: 0.6,
  scrollTrigger: { trigger: trackSection, start: "top bottom", end: "top top", scrub: 1.4 }
});
gsap.to(scene3d.target, {
  x: 0, scale: 1,
  scrollTrigger: { trigger: "#contact", start: "top bottom", end: "top center", scrub: 1.4 }
});
