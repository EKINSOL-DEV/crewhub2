/* Greenhouse shaders, moved from apps/world/src/world/shaders.ts. Colours are passed in (from style.json). */
import * as THREE from "three";

/* ── Cloud shadows ──────────────────────────────────────────────────────────────────────────────────────────────
   Up to four soft ellipses that dim the key light (the first directional light: it casts the shadows, so three sorts it
   first) on every kit material, so a passing cloud darkens roofs, walls and people as well as the grass. Each
   fragment looks along the light to the ground (a roof's cloud shadow lies where the sun puts it). Shared uniforms,
   set by the environment; all zero (the default, and any material without them) means no clouds. */
const MAX_CLOUDS = 4;
export const CLOUDS = {
  /** Per cloud: centre x, z, then its local x axis over its half-length. */
  a: { value: Array.from({ length: MAX_CLOUDS }, () => new THREE.Vector4()) },
  /** Per cloud: its local z axis over its half-width, then how much it dims the key light. */
  b: { value: Array.from({ length: MAX_CLOUDS }, () => new THREE.Vector4()) },
  /** The light's slope: x and z over y of the direction towards it. */
  slope: { value: new THREE.Vector2() },
};
/** How much a cloud's middle dims the key light. */
const CLOUD_DIM = 0.7;

/** Sets the cloud shadows from [x, z, halfLength, halfWidth, turn] per cloud (fewer clears the rest). */
export function setClouds(clouds: ArrayLike<number>) {
  for (let i = 0; i < MAX_CLOUDS; i++) {
    const o = i * 5;
    if (o + 4 >= clouds.length) {
      CLOUDS.a.value[i]!.set(0, 0, 0, 0);
      CLOUDS.b.value[i]!.set(0, 0, 0, 0);
      continue;
    }
    const x = clouds[o]!, z = clouds[o + 1]!, rx = Math.max(0.01, clouds[o + 2]!), rz = Math.max(0.01, clouds[o + 3]!), turn = clouds[o + 4]!;
    const c = Math.cos(turn), s = Math.sin(turn);
    CLOUDS.a.value[i]!.set(x, z, c / rx, -s / rx);
    CLOUDS.b.value[i]!.set(s / rz, c / rz, CLOUD_DIM, 0);
  }
}

const CLOUD_PARS = `uniform vec4 uCloudA[${MAX_CLOUDS}];
uniform vec4 uCloudB[${MAX_CLOUDS}];
uniform vec2 uCloudSlope;
float greenhouseCloudShade() {
  // The fragment's world position from its view position (the view matrix is a rotation and a move).
  vec3 w = (-vViewPosition - viewMatrix[3].xyz) * mat3(viewMatrix);
  vec2 p = w.xz - w.y * uCloudSlope;
  float shade = 1.0;
  for (int i = 0; i < ${MAX_CLOUDS}; i++) {
    vec2 d = p - uCloudA[i].xy;
    float r = length(vec2(dot(d, uCloudA[i].zw), dot(d, uCloudB[i].xy)));
    float body = 1.0 - smoothstep(0.15, 1.0, r);
    shade *= 1.0 - uCloudB[i].z * body * body * (3.0 - 2.0 * body);
  }
  return shade;
}
`;

/** Adds the cloud shadows to a lit material's shader (call it from `onBeforeCompile`, with any other changes). */
export function cloudShadows(shader: THREE.WebGLProgramParametersWithUniforms) {
  if (!shader.fragmentShader.includes("#include <lights_fragment_begin>")) return;
  shader.uniforms.uCloudA = CLOUDS.a;
  shader.uniforms.uCloudB = CLOUDS.b;
  shader.uniforms.uCloudSlope = CLOUDS.slope;
  const begin = THREE.ShaderChunk.lights_fragment_begin.replace(
    "getDirectionalLightInfo( directionalLight, directLight );",
    `getDirectionalLightInfo( directionalLight, directLight );
		#if UNROLLED_LOOP_INDEX == 0
		directLight.color *= greenhouseCloudShade();
		#endif`,
  );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <lights_pars_begin>", `#include <lights_pars_begin>\n${CLOUD_PARS}`)
    .replace("#include <lights_fragment_begin>", begin);
}

/** Floor patterns: the studio's cream cells, warm wood planks, light tiles, smooth concrete. */
export type FloorPattern = "cells" | "wood" | "tile" | "concrete";

const PATTERNS: Record<FloorPattern, string> = {
  cells: `
      vec2 edge = abs(fract(vFloor + 0.5) - 0.5) / max(fwidth(vFloor), vec2(0.001));
      float line = 1.0 - min(min(edge.x, edge.y), 1.0);
      float checker = mod(floor(vFloor.x) + floor(vFloor.y), 2.0);
      diffuseColor.rgb *= 1.0 - checker * 0.018;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.48, 0.39), line * 0.05);`,
  // Planks a third of a cell wide running east to west, with staggered butt joints and a soft grain.
  wood: `
      vec2 p = vec2(vFloor.x, vFloor.y * 3.0);
      float row = floor(p.y);
      float along = p.x / 2.4 + fract(row * 0.618) ;
      vec2 seam = vec2(abs(fract(along + 0.5) - 0.5) * 2.4, abs(fract(p.y + 0.5) - 0.5) / 3.0) / max(fwidth(vFloor), vec2(0.001));
      float joint = 1.0 - min(min(seam.x, seam.y), 1.0);
      float tone = fract(sin(row * 12.9898 + floor(along) * 78.233) * 43758.5453);
      float grain = sin(p.x * 7.0 + sin(p.x * 1.3 + row) * 2.0) * 0.5 + 0.5;
      diffuseColor.rgb *= 0.95 + tone * 0.07 + grain * 0.025;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.78, joint * 0.55);`,
  // Two-cell square tiles with pale grout and a faint alternate tint.
  tile: `
      vec2 t = vFloor / 2.0;
      vec2 edge = abs(fract(t + 0.5) - 0.5) * 2.0 / max(fwidth(vFloor), vec2(0.001));
      float grout = 1.0 - min(min(edge.x, edge.y) / 1.6, 1.0);
      float checker = mod(floor(t.x) + floor(t.y), 2.0);
      diffuseColor.rgb *= 1.0 - checker * 0.04;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.84, 0.86, 0.82), grout * 0.8);`,
  // Smooth concrete: faint saw cuts every four cells and a soft cloudiness.
  concrete: `
      vec2 c = vFloor / 4.0;
      vec2 edge = abs(fract(c + 0.5) - 0.5) * 4.0 / max(fwidth(vFloor), vec2(0.001));
      float cut = 1.0 - min(min(edge.x, edge.y), 1.0);
      float cloud = sin(vFloor.x * 0.9 + sin(vFloor.y * 0.7) * 1.8) * sin(vFloor.y * 1.1 + vFloor.x * 0.3);
      diffuseColor.rgb *= 0.985 + cloud * 0.02;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.82, cut * 0.5);`,
};

/**
 * The studio floor: a pattern and soft sun shafts on a standard material. UVs are in cells. `shafts` is a shared
 * uniform: 1 by day, 0 under lamplight (no sun after dark).
 */
export function floorShader(
  material: THREE.MeshStandardMaterial,
  shafts: { value: number },
  pattern: FloorPattern = "cells",
): THREE.MeshStandardMaterial {
  material.roughness = 0.93;
  material.onBeforeCompile = (shader) => {
    cloudShadows(shader);
    shader.uniforms.uShafts = shafts;
    shader.vertexShader =
      "varying vec2 vFloor;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvFloor = uv;");
    shader.fragmentShader =
      "varying vec2 vFloor;\nuniform float uShafts;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      ${PATTERNS[pattern]}
      float diagonal = vFloor.x + vFloor.y * 0.64;
      float shafts = smoothstep(0.1, 0.2, fract(diagonal / 3.0)) * (1.0 - smoothstep(0.82, 0.91, fract(diagonal / 3.0)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.91, 0.66), shafts * 0.06 * uShafts);
    `,
      );
  };
  // One program per pattern: the patterns differ only inside the closure, so the cache key must say which.
  material.customProgramCacheKey = () => `greenhouse-floor-${pattern}`;
  return material;
}

export function glassMaterial(color: string, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: opacity }, uColor: { value: new THREE.Color(color) }, uSheen: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv;
      void main() { vUv = uv; vNormal = normalize(mat3(modelMatrix) * normal); vec4 p = modelMatrix * vec4(position, 1.0); vWorld = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uSheen; varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv;
      void main() { float fresnel = pow(1.0 - abs(dot(normalize(cameraPosition - vWorld), normalize(vNormal))), 3.0);
      float etch = 1.0 - smoothstep(0.0, 0.025, abs(fract(vUv.y * 8.0) - 0.5));
      // A soft diagonal sheen in world space, so it runs on across the panes: the glass catches the sky.
      float d = fract((vWorld.x - vWorld.z) * 0.22 + vWorld.y * 0.55);
      float sheen = (1.0 - smoothstep(0.0, 0.07, abs(d - 0.3))) * 0.8 + (1.0 - smoothstep(0.0, 0.025, abs(d - 0.4))) * 0.5;
      sheen *= uSheen;
      gl_FragColor = vec4(uColor + fresnel * 0.2 + sheen * 0.35, uOpacity * (0.4 + fresnel * 0.6 + etch * 0.18) + sheen * 0.22);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
}

/**
 * Soft contact shade where walls meet a floor: a frame strip whose uv.y runs from 0 at the wall line to 1 inside the
 * room; the shade fades out across it. Plain attributes only, so a building's strips merge into one mesh.
 */
export function edgeShadeMaterial(color: string, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    vertexShader: `varying float vEdge; void main() { vEdge = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vEdge;
      void main() { float a = 1.0 - smoothstep(0.0, 1.0, vEdge);
      gl_FragColor = vec4(uColor, uOpacity * a * a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
}

export function haloMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uActive: { value: 0 } },
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uTime; uniform float uActive;
      void main() { float d = length(vUv - 0.5); float ring = smoothstep(0.32, 0.35, d) * (1.0 - smoothstep(0.38, 0.41, d));
      float glow = (1.0 - smoothstep(0.1, 0.46, d)) * 0.12;
      float pulse = 0.85 + sin(uTime * 2.0) * 0.15 * uActive;
      gl_FragColor = vec4(uColor, (ring * (0.25 + 0.65 * uActive) + glow) * pulse);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
}

/** World x/z of a vertex, instanced or merged, as a varying the fragment patterns below read. */
function worldXZ(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader =
    "varying vec2 vTownXZ;\n" +
    shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec4 townWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      townWorld = instanceMatrix * townWorld;
      #endif
      vTownXZ = (modelMatrix * townWorld).xz;`,
    );
  shader.fragmentShader =
    `varying vec2 vTownXZ;
    float townHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float townNoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(townHash(i), townHash(i + vec2(1.0, 0.0)), f.x), mix(townHash(i + vec2(0.0, 1.0)), townHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
` + shader.fragmentShader;
}

/**
 * Paving laid in world space, so it lines up across pieces: cobbles (small stones in a running bond) or flagstones
 * (large slabs). Each stone gets its own shade, the joints are darker and the stones' edges soft.
 */
export function pavingShader(material: THREE.MeshStandardMaterial, stone: [number, number], joint: number): THREE.MeshStandardMaterial {
  material.roughness = 0.95;
  // The program differs per stone size; the default cache key (the callback's source) would not tell them apart.
  material.customProgramCacheKey = () => `town-paving:${stone.join(",")}:${joint}`;
  material.onBeforeCompile = (shader) => {
    cloudShadows(shader);
    worldXZ(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec2 st = vTownXZ / vec2(${stone[0].toFixed(3)}, ${stone[1].toFixed(3)});
      st.x += step(1.0, mod(floor(st.y), 2.0)) * 0.5;
      vec2 cell = floor(st), f = fract(st) - 0.5;
      vec2 width = fwidth(st);
      vec2 edge = smoothstep(vec2(0.5) - width * 1.5 - ${joint.toFixed(3)}, vec2(0.5) - ${joint.toFixed(3)}, abs(f));
      float jointMask = max(edge.x, edge.y);
      float shade = townHash(cell) * 0.12 - 0.06 + (townNoise(vTownXZ * 0.35) - 0.5) * 0.06;
      diffuseColor.rgb *= (1.0 + shade) * (1.0 - jointMask * 0.22);
      diffuseColor.rgb *= 1.0 - smoothstep(0.25, 0.5, length(f)) * 0.05;
    `,
    );
  };
  return material;
}

/** Grass with a soft mottle in world space, so wide lawns are never one flat colour. */
/** The evening (0 by day, 1 in lamplight): the grass mottles more and warms in patches (set by `townLight`). */
export const GRASS_NIGHT = { value: 0 };
/**
 * 0 by day and in lamplight, up to 1 in the light theme's dusk and dawn (set by `townLight`): a warm low sun on green
 * reads olive and khaki, so the lawns keep their colour, a little richer and towards a golden green.
 */
export const GRASS_GOLDEN = { value: 0 };

export function grassShader(material: THREE.MeshStandardMaterial, amount: number): THREE.MeshStandardMaterial {
  material.roughness = 1;
  material.customProgramCacheKey = () => `town-grass:${amount}`;
  material.onBeforeCompile = (shader) => {
    cloudShadows(shader);
    worldXZ(shader);
    shader.uniforms.uGrassNight = GRASS_NIGHT;
    shader.uniforms.uGrassGolden = GRASS_GOLDEN;
    shader.fragmentShader = shader.fragmentShader.replace("varying vec2 vTownXZ;", "varying vec2 vTownXZ;\nuniform float uGrassNight;\nuniform float uGrassGolden;").replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float mottle = townNoise(vTownXZ * 0.18) * 0.6 + townNoise(vTownXZ * 0.9) * 0.3 + townHash(floor(vTownXZ * 9.0)) * 0.1;
      diffuseColor.rgb *= 1.0 + (mottle - 0.5) * ${amount.toFixed(3)} * (1.0 + uGrassNight * 1.2);
      diffuseColor.g *= 1.0 + (townNoise(vTownXZ * 0.07 + 3.0) - 0.5) * ${(amount * 0.5).toFixed(3)};
      // Evening: soft warm patches (dry grass, clover) so the dark lawns are not one flat green.
      float warm = smoothstep(0.42, 0.75, townNoise(vTownXZ * 0.11 + 7.0)) * uGrassNight;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(1.24, 1.08, 0.8), warm);
      // Golden hour: more saturation and a fresh green that the warm sun turns golden, never grey-yellow.
      float grassLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = max(mix(vec3(grassLuma), diffuseColor.rgb, 1.0 + 0.12 * uGrassGolden), 0.0);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 1.0, 0.9), uGrassGolden);
    `,
    );
  };
  return material;
}

/** The pond: a soft ripple and a lighter rim towards the bank. UVs run 0..1 over the pond. */
export function waterShader(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  material.roughness = 0.25;
  material.customProgramCacheKey = () => "town-water";
  material.onBeforeCompile = (shader) => {
    cloudShadows(shader);
    worldXZ(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float ripple = townNoise(vTownXZ * vec2(1.6, 3.2));
      diffuseColor.rgb *= 0.94 + ripple * 0.1;
    `,
    );
  };
  return material;
}

/**
 * Soft ground decals drawn on flat planes from `Kit.decal`: a blob contact shadow (normal blending, darkens) or a warm
 * light pool (additive, brightens). The plane's local x/z is the position; the `aShape` attribute holds the rounded
 * rectangle's half-size and its soft edge in world units, so one material draws every size. Colours are passed in.
 */
export function decalMaterial(color: string, opacity: number, additive: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `attribute vec3 aShape; varying vec2 vLocal; varying vec3 vShape;
      void main() { vLocal = position.xz; vShape = aShape; vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vLocal; varying vec3 vShape;
      void main() { float d = length(max(abs(vLocal) - vShape.xy, 0.0)) / max(vShape.z, 0.001);
      float a = 1.0 - smoothstep(0.0, 1.0, d);
      a *= a;
      gl_FragColor = vec4(uColor, uOpacity * a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
}
