import * as THREE from './vendor/three.module.min.js';
import { createImageRig, gestureAt } from './mascot-rig.js';
import { createBlinkTimeline } from './mascot-blink.js';

const artworkUrl = new URL('./assets/mascot-2-5d.png', import.meta.url).href;
const blinkArtworkUrl = new URL('./assets/mascot-blink-closed.png', import.meta.url).href;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const gestureNames = new Set(['greet', 'celebrate', 'encourage', 'idle']);

function criticallyDamped(value, velocity, destination, dt) {
  const omega = 8;
  const offset = value - destination;
  const decay = Math.exp(-omega * dt);
  const impulse = velocity + omega * offset;
  return {
    value: destination + (offset + impulse * dt) * decay,
    velocity: (velocity - omega * impulse * dt) * decay
  };
}

function createController(host) {
  if (host.querySelector(':scope > .mascot-motion-canvas')) return null;
  const image = host.querySelector('img');
  if (!image) return null;

  const canvas = document.createElement('canvas');
  canvas.className = 'mascot-motion-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.motionState = 'fallback';
  host.dataset.motionState = 'fallback';
  host.dataset.motionPlayback = 'paused';
  host.insertBefore(canvas, image);

  let renderer = null;
  let scene = null;
  let camera = null;
  let rig = null;
  let resizeObserver = null;
  let intersectionObserver = null;
  let overlayObserver = null;
  let frameRequest = 0;
  let generation = 0;
  let lastFrame = null;
  let elapsed = 0;
  let gestureStart = 0;
  let gesture = 'idle';
  let visible = false;
  let destroyed = false;
  let rendererFailed = false;
  const blinkTimeline = createBlinkTimeline();
  let x = 0, y = 0, vx = 0, vy = 0, targetX = 0, targetY = 0;

  const isVisible = () => {
    if (!visible || document.hidden || reducedMotion.matches || destroyed) return false;
    const overlay = host.closest('.celebration-overlay');
    return !overlay || (!overlay.hidden && getComputedStyle(overlay).display !== 'none');
  };

  function setFallback(state = 'fallback') {
    host.classList.remove('has-mascot-motion');
    host.dataset.motionState = state;
    canvas.dataset.motionState = state;
  }

  function releaseRenderer() {
    generation++;
    stopAnimation();
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (rig) rig.dispose();
    rig = null;
    scene = null;
    camera = null;
    const oldRenderer = renderer;
    renderer = null;
    if (oldRenderer) {
      oldRenderer.dispose();
    }
    canvas.width = 0;
    canvas.height = 0;
    setFallback(reducedMotion.matches ? 'reduced' : 'fallback');
    host.dataset.blinkState = 'unavailable';
  }

  function resize() {
    if (!renderer || !rig || destroyed) return;
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const pixelRatio = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    renderer.setPixelRatio(pixelRatio);
    canvas.dataset.renderScale = String(pixelRatio);
    renderer.setSize(bounds.width, bounds.height, false);
    const aspect = bounds.width / bounds.height;
    const viewHeight = Math.max(1, rig.aspect / aspect) * 1.04;
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    drawOnce();
  }

  function updatePose(dt) {
    const lookX = criticallyDamped(x, vx, targetX, dt);
    const lookY = criticallyDamped(y, vy, targetY, dt);
    x = lookX.value; vx = lookX.velocity;
    y = lookY.value; vy = lookY.velocity;

    const pose = gestureAt(gesture, elapsed - gestureStart);
    if (pose.finished && gesture !== 'idle') {
      gesture = 'idle';
      host.dataset.motionGesture = gesture;
    }
    rig.uniforms.uTime.value = elapsed;
    rig.uniforms.uAmount.value = 1;
    rig.uniforms.uLook.value.set(x, y);
    rig.uniforms.uGreeting.value = pose.greeting;
    rig.uniforms.uNod.value = pose.nod;
    rig.uniforms.uJoy.value = pose.joy;
    rig.uniforms.uBlink.value = rig.blinkReady ? blinkTimeline.sample(elapsed) : 0;
    rig.root.position.set(Math.sin(elapsed * 0.67) * 0.0018 + pose.greeting * 0.004,
      Math.sin(elapsed * 1.55) * 0.003 + pose.lift * 0.022 - pose.nod * 0.006, 0);
    rig.root.rotation.set(-y * 0.026 + pose.nod * 0.075,
      x * 0.038,
      Math.sin(elapsed * 0.73) * 0.004 + pose.greeting * 0.027 + pose.joy * 0.021);
    const breath = Math.sin(elapsed * 1.55);
    rig.root.scale.set(1 + breath * 0.0018, 1 + breath * 0.0028 - pose.nod * 0.009, 1);
  }

  function drawOnce() {
    if (!renderer || !rig || destroyed) return false;
    try {
      updatePose(0);
      renderer.render(scene, camera);
      return true;
    } catch {
      failRenderer();
      return false;
    }
  }

  function failRenderer() {
    rendererFailed = true;
    releaseRenderer();
  }

  function animate(now) {
    frameRequest = 0;
    if (!isVisible() || !renderer || !rig) {
      stopAnimation();
      return;
    }
    const rawDt = lastFrame === null ? 0 : Math.max(0, (now - lastFrame) / 1000);
    lastFrame = now;
    elapsed += rawDt;
    try {
      updatePose(Math.min(rawDt, 0.05));
      renderer.render(scene, camera);
    } catch {
      failRenderer();
      return;
    }
    frameRequest = requestAnimationFrame(animate);
  }

  function startAnimation() {
    if (!isVisible() || !renderer || frameRequest) return;
    lastFrame = null;
    blinkTimeline.reset(elapsed);
    host.dataset.motionPlayback = 'running';
    frameRequest = requestAnimationFrame(animate);
  }

  function stopAnimation() {
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    lastFrame = null;
    host.dataset.motionPlayback = 'paused';
    blinkTimeline.reset(elapsed);
  }

  function prepareTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  async function loadBlinkTexture(token) {
    host.dataset.blinkState = 'loading';
    try {
      const texture = await new THREE.TextureLoader().loadAsync(blinkArtworkUrl);
      if (destroyed || token !== generation || !rig) {
        texture.dispose();
        return;
      }
      rig.setBlinkTexture(prepareTexture(texture));
      blinkTimeline.reset(elapsed);
      host.dataset.blinkState = 'ready';
    } catch {
      if (!destroyed && token === generation) host.dataset.blinkState = 'unavailable';
    }
  }

  async function ensureRenderer() {
    if (!isVisible() || destroyed || rendererFailed) return;
    if (renderer) {
      if (rig) {
        resize();
        startAnimation();
      }
      return;
    }
    const token = ++generation;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas, alpha: true, antialias: true, powerPreference: 'low-power'
      });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-0.6, 0.6, 0.6, -0.6, 0.01, 10);
      camera.position.z = 3;

      const texture = await new THREE.TextureLoader().loadAsync(artworkUrl);
      if (destroyed || token !== generation || reducedMotion.matches || !visible) {
        texture.dispose();
        if (token === generation) releaseRenderer();
        return;
      }
      rig = createImageRig(prepareTexture(texture));
      scene.add(rig.root);
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();
      if (!drawOnce()) return;
      host.classList.add('has-mascot-motion');
      host.dataset.motionState = 'ready';
      canvas.dataset.motionState = 'ready';
      loadBlinkTexture(token);
      startAnimation();
    } catch {
      if (token === generation) {
        failRenderer();
      }
    }
  }

  function play(action) {
    if (!gestureNames.has(action)) return;
    gesture = action;
    host.dataset.motionGesture = action;
    gestureStart = elapsed;
    if (action !== 'idle') {
      targetX = 0;
      targetY = 0;
      if (!reducedMotion.matches) {
        visible = true;
        ensureRenderer();
      }
    }
    drawOnce();
  }

  function onMotion(event) {
    play(event.detail?.action);
  }

  function onPointerMove(event) {
    if (host.id !== 'mascot' || host.classList.contains('is-dragging') || reducedMotion.matches) return;
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    targetX = THREE.MathUtils.clamp((event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width * 2), -1, 1);
    targetY = THREE.MathUtils.clamp(((bounds.top + bounds.height / 2) - event.clientY) / (bounds.height * 2), -1, 1);
    if (renderer && isVisible() && !frameRequest) startAnimation();
  }

  function onPointerReset() {
    targetX = targetY = 0;
  }

  function onVisibilityChange() {
    if (document.hidden) {
      stopAnimation();
    } else {
      const bounds = host.getBoundingClientRect();
      const overlay = host.closest('.celebration-overlay');
      visible = bounds.bottom > 0 && bounds.top < window.innerHeight
        && bounds.right > 0 && bounds.left < window.innerWidth
        && (!overlay || (!overlay.hidden && getComputedStyle(overlay).display !== 'none'));
      if (visible) ensureRenderer();
    }
  }

  function onReducedMotionChange() {
    if (reducedMotion.matches) releaseRenderer();
    else if (visible) ensureRenderer();
  }

  function onContextLost(event) {
    event.preventDefault();
    if (!renderer) return;
    rendererFailed = true;
    releaseRenderer();
  }

  function onContextRestored() {
    if (destroyed) return;
    rendererFailed = false;
    if (isVisible()) ensureRenderer();
  }

  host.addEventListener('mascot:motion', onMotion);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  if (host.id === 'mascot') {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointercancel', onPointerReset, { passive: true });
    window.addEventListener('blur', onPointerReset);
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('resize', resize, { passive: true });
  reducedMotion.addEventListener('change', onReducedMotionChange);

  intersectionObserver = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0);
    if (visible && !reducedMotion.matches) ensureRenderer();
    else {
      stopAnimation();
    }
  });
  intersectionObserver.observe(host);

  const overlay = host.closest('.celebration-overlay');
  if (overlay) {
    overlayObserver = new MutationObserver(() => {
      if (overlay.hidden || getComputedStyle(overlay).display === 'none') {
        visible = false;
        stopAnimation();
      } else {
        const bounds = host.getBoundingClientRect();
        visible = bounds.bottom > 0 && bounds.top < window.innerHeight
          && bounds.right > 0 && bounds.left < window.innerWidth;
        if (visible) ensureRenderer();
      }
    });
    overlayObserver.observe(overlay, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  }

  if (reducedMotion.matches) setFallback('reduced');

  return {
    host,
    play,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      host.removeEventListener('mascot:motion', onMotion);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointercancel', onPointerReset);
      window.removeEventListener('blur', onPointerReset);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', resize);
      reducedMotion.removeEventListener('change', onReducedMotionChange);
      intersectionObserver?.disconnect();
      overlayObserver?.disconnect();
      releaseRenderer();
      canvas.remove();
      delete host.dataset.motionState;
      delete host.dataset.motionPlayback;
      delete host.dataset.motionGesture;
      delete host.dataset.blinkState;
    }
  };
}

export function initMascotMotion(root = document) {
  return [...root.querySelectorAll('[data-mascot-motion]')]
    .map(createController)
    .filter(Boolean);
}

export function playMascotMotion(host, action) {
  if (!host || !gestureNames.has(action)) return false;
  host.dispatchEvent(new CustomEvent('mascot:motion', { bubbles: false, detail: { action } }));
  return true;
}

let mascotControllers = [];
function bootstrapMascotMotion() {
  mascotControllers = initMascotMotion();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapMascotMotion, { once: true });
} else {
  bootstrapMascotMotion();
}

window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  mascotControllers.forEach(controller => controller.destroy());
  mascotControllers = [];
}, { once: true });
