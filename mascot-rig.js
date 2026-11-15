import * as THREE from './vendor/three.module.min.js';

// The source stays one intact image. Small, continuous mesh motion adds depth
// while the eyes, face, labels, and outfit remain faithful to the approved art.
export function createImageRig(texture) {
  const aspect = texture.image.width / texture.image.height;
  const geometry = new THREE.PlaneGeometry(aspect, 1, 56, 72);
  const uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uLook: { value: new THREE.Vector2() },
    uGreeting: { value: 0 },
    uNod: { value: 0 },
    uJoy: { value: 0 },
    uBlink: { value: 0 },
    uBlinkMap: { value: texture },
    uArtworkSize: { value: new THREE.Vector2(texture.image.width, texture.image.height) }
  };
  let blinkTexture = null;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    forceSinglePass: true
  });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      uniform float uTime;
      uniform float uAmount;
      uniform vec2 uLook;
      uniform float uGreeting;
      uniform float uNod;
      uniform float uJoy;
      vec2 turn(vec2 point, float angle) {
        float c = cos(angle), s = sin(angle);
        return vec2(c * point.x - s * point.y, s * point.x + c * point.y);
      }
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float head = smoothstep(0.46, 0.62, uv.y);
      float body = smoothstep(0.14, 0.28, uv.y) * (1.0 - head);
      float cloud = 1.0 - smoothstep(0.10, 0.21, uv.y);
      float breath = sin(uTime * 1.55);
      float sway = sin(uTime * 0.73);
      vec2 headPivot = vec2(0.0, 0.025);
      float headAngle = (sway * 0.005 - uLook.x * 0.009
        + uGreeting * 0.020) * uAmount;
      vec2 headPoint = turn(transformed.xy - headPivot, headAngle) + headPivot;
      transformed.xy = mix(transformed.xy, headPoint, head);
      transformed.x += head * uLook.x * 0.006 * uAmount;
      transformed.y += (head * (breath * 0.0018 - uNod * 0.012)
        + body * breath * 0.0013) * uAmount;
      transformed.x *= 1.0 + body * breath * 0.0025 * uAmount;
      float edge = smoothstep(0.22, 0.43, abs(uv.x - 0.5));
      transformed.x += edge * sin(uTime * 0.85 + uv.y * 5.0)
        * 0.0018 * uAmount;
      transformed.y += cloud * sin(uTime * 0.95 + 0.8) * 0.0015 * uAmount;
      vec2 reliefPoint = (uv - vec2(0.5, 0.64)) / vec2(0.27, 0.23);
      float relief = exp(-dot(reliefPoint, reliefPoint) * 1.8);
      transformed.z += (head * 0.012 + body * 0.008 + relief * 0.012) * uAmount;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>', `
      #include <map_pars_fragment>
      #ifdef USE_MAP
      uniform float uBlink;
      uniform sampler2D uBlinkMap;
      uniform vec2 uArtworkSize;

      float eyeRegion(vec2 point, vec2 center) {
        vec2 q = abs(point - center) / vec2(75.0, 63.0);
        float distance = dot(q * q, q * q);
        return 1.0 - smoothstep(0.55, 1.0, distance);
      }

      vec3 blinkEye(vec2 point, vec2 center, vec3 original, vec3 closed) {
        float area = eyeRegion(point, center);
        if (area <= 0.0) return original;
        // Compress the existing eye toward its lower lid, then settle onto the
        // relaxed closed lid. Outside these two feathered regions is untouched.
        float openness = max(0.025, 1.0 - uBlink);
        vec2 source = point;
        source.y = (point.y - center.y - 14.0 * uBlink) / openness + center.y;
        vec2 sourceUv = vec2(source.x, uArtworkSize.y - source.y) / uArtworkSize;
        vec3 openEye = texture2D(map, sourceUv).rgb;
        float openArea = eyeRegion(source, center) * (1.0 - smoothstep(0.72, 1.0, uBlink));
        vec3 eye = mix(closed, openEye, openArea);
        return mix(original, eye, area * smoothstep(0.0, 0.12, uBlink));
      }
      #endif
    `).replace('#include <map_fragment>', `
      #include <map_fragment>
      #ifdef USE_MAP
        if (uBlink > 0.0001) {
          vec2 point = vec2(vMapUv.x, 1.0 - vMapUv.y) * uArtworkSize;
          vec3 closed = texture2D(uBlinkMap, vMapUv).rgb;
          diffuseColor.rgb = blinkEye(point, vec2(465.0, 511.0), diffuseColor.rgb, closed);
          diffuseColor.rgb = blinkEye(point, vec2(668.0, 511.0), diffuseColor.rgb, closed);
        }
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'mascot-faithful-25d-blink-v2';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  return {
    root,
    aspect,
    uniforms,
    get blinkReady() { return Boolean(blinkTexture); },
    setBlinkTexture(nextTexture) {
      blinkTexture?.dispose();
      blinkTexture = nextTexture;
      uniforms.uBlinkMap.value = nextTexture;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      blinkTexture?.dispose();
    }
  };
}

export function gestureAt(kind, seconds) {
  const duration = { greet: 3.1, celebrate: 3.3, encourage: 2.5 }[kind] || 0;
  if (!duration || seconds >= duration) return { finished: true, greeting: 0, nod: 0, joy: 0, lift: 0 };
  const p = Math.max(0, seconds / duration);
  const envelope = Math.sin(Math.PI * p) ** 2;
  const wave = Math.sin(p * Math.PI * 4);
  return {
    finished: false,
    greeting: kind === 'greet' ? wave * envelope : 0,
    nod: kind === 'encourage' ? (0.5 - 0.5 * Math.cos(p * Math.PI * 4)) * envelope
      : kind === 'greet' ? envelope * 0.35 : 0,
    joy: kind === 'celebrate' ? wave * envelope : 0,
    lift: kind === 'celebrate' ? (0.5 - 0.5 * Math.cos(p * Math.PI * 6)) * envelope : 0
  };
}
