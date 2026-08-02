// ================================================================
// X STUDIO — orchestration layer
// Preloader → Lenis inertia scroll → ScrollTrigger ↔ 3D binding
// ================================================================
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Scene3D } from "./components/Scene3D.js";

gsap.registerPlugin(ScrollTrigger);

// ----------------------------------------------------------------
// 1. WEBGL SCENE
// ----------------------------------------------------------------
const scene3d = new Scene3D(document.querySelector("#webgl"));

// ----------------------------------------------------------------
// 2. SMOOTH SCROLL (heavy, cinematic inertia)
// ----------------------------------------------------------------
// CUSTOMIZE_SCROLL_WEIGHT: raise duration for an even heavier drag feel
const lenis = new Lenis({
  duration: 1.7,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  wheelMultiplier: 0.95
});

lenis.stop(); // lock the page while the preloader owns the viewport

lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

// Anchor links ride the smooth scroller instead of jumping
document.querySelectorAll("[data-scroll-link]").forEach((link) => {
  link.addEventListener("click", (e) => {
    const target = link.getAttribute("href");
    if (target && target.startsWith("#")) {
      e.preventDefault();
      lenis.scrollTo(target === "#top" ? 0 : target, { duration: 1.8 });
    }
  });
});

// ----------------------------------------------------------------
// 3. PRELOADER — "X" entrance, then curtain-out
// ----------------------------------------------------------------
const preloader = document.querySelector("#preloader");
const preX = document.querySelector(".preloader__x");
const preTag = document.querySelector(".preloader__tag");

const enterTl = gsap.timeline();
enterTl
  .fromTo(
    preX,
    { opacity: 0, scale: 0.7, rotate: -6 },
    { opacity: 1, scale: 1, rotate: 0, duration: 1.4, ease: "expo.out" }
  )
  .to(preTag, { opacity: 1, duration: 0.8, ease: "power2.out" }, "-=0.9");

// CUSTOMIZE_PRELOADER_MIN_TIME: minimum seconds the loader stays visible
const MIN_LOADER_TIME = 1.6;

const pageLoaded = new Promise((resolve) => {
  if (document.readyState === "complete") resolve();
  else window.addEventListener("load", resolve, { once: true });
});
const minTime = new Promise((r) => setTimeout(r, MIN_LOADER_TIME * 1000));

Promise.all([pageLoaded, minTime, scene3d.ready]).then(() => {
  const exitTl = gsap.timeline({
    onComplete: () => {
      preloader.style.display = "none";
      lenis.start();
      ScrollTrigger.refresh();
    }
  });

  exitTl
    // X blows up toward the camera and dissolves
    .to(preX, { scale: 1.6, opacity: 0, duration: 1.0, ease: "power4.in" })
    .to(preTag, { opacity: 0, duration: 0.4 }, "<")
    // curtain-out: both panels slide vertically apart
    .to(".preloader__curtain--a", { yPercent: -101, duration: 1.15, ease: "power4.inOut" }, "-=0.15")
    .to(".preloader__curtain--b", { yPercent: 101, duration: 1.15, ease: "power4.inOut" }, "<")
    // hero content lifts in as the curtains clear
    .add(revealHero, "-=0.7");
});

function revealHero() {
  gsap.to("#hero [data-reveal]", {
    opacity: 1,
    y: 0,
    duration: 1.3,
    stagger: 0.12,
    ease: "expo.out"
  });
}

// ----------------------------------------------------------------
// 4. SECTION REVEALS (about + contact lift in on scroll)
// ----------------------------------------------------------------
["#about", "#contact"].forEach((sel) => {
  gsap.to(`${sel} [data-reveal]`, {
    opacity: 1,
    y: 0,
    duration: 1.2,
    stagger: 0.14,
    ease: "expo.out",
    scrollTrigger: {
      trigger: sel,
      start: "top 65%",
      once: true
    }
  });
});

// ----------------------------------------------------------------
// 5. HORIZONTAL FLYING PORTFOLIO TRACK
// Pins the section; scroll drives the strip right → left.
// Cards stay clickable throughout (transforms never block anchors).
// ----------------------------------------------------------------
const strip = document.querySelector(".portfolio-strip");
const trackSection = document.querySelector(".portfolio-track-section");

function stripDistance() {
  return strip.scrollWidth - window.innerWidth;
}

gsap.to(strip, {
  x: () => -stripDistance(),
  ease: "none",
  scrollTrigger: {
    trigger: trackSection,
    start: "top top",
    // CUSTOMIZE_TRACK_LENGTH: multiplier = how long the fly-past lasts
    end: () => `+=${stripDistance() * 1.15}`,
    pin: true,
    scrub: 1.2,          // slight lag = cinematic momentum
    anticipatePin: 1,
    invalidateOnRefresh: true
  }
});

// ----------------------------------------------------------------
// 6. BIND THE 3D MESH TO SCROLL POSITION
// Global progress feeds the shader; per-section tweens reframe it.
// ----------------------------------------------------------------
ScrollTrigger.create({
  trigger: document.body,
  start: "top top",
  end: "bottom bottom",
  onUpdate: (self) => scene3d.setScroll(self.progress)
});

// Hero → About: mesh drifts right and shrinks slightly
gsap.to(scene3d.target, {
  x: 1.4,
  scale: 0.75,
  scrollTrigger: {
    trigger: "#about",
    start: "top bottom",
    end: "top top",
    scrub: 1.5
  }
});

// About → Works: mesh recedes far back, out of focus behind the cards
gsap.to(scene3d.target, {
  x: 0,
  z: -3.5,
  scale: 0.5,
  scrollTrigger: {
    trigger: trackSection,
    start: "top bottom",
    end: "top top",
    scrub: 1.5
  }
});

// Works → Contact: mesh returns to center, hero-sized again
gsap.to(scene3d.target, {
  z: 0,
  scale: 1.1,
  scrollTrigger: {
    trigger: "#contact",
    start: "top bottom",
    end: "top center",
    scrub: 1.5
  }
});
