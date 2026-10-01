/* Greenhouse shaders, moved from apps/world/src/world/shaders.ts. Colours are passed in (from style.json). */
import * as THREE from "three";

/**
 * The studio floor: a faint grid, a checker and sun shafts, on a standard material. UVs are in cells. `shafts` is a
 * shared uniform: 1 by day, 0 under lamplight (no sun after dark).
 */
export function floorShader(material: THREE.MeshStandardMaterial, shafts: { value: number }): THREE.MeshStandardMaterial {
  material.roughness = 0.93;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShafts = shafts;
    shader.vertexShader =
      "varying vec2 vFloor;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvFloor = uv;");
    shader.fragmentShader =
      "varying vec2 vFloor;\nuniform float uShafts;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec2 edge = abs(fract(vFloor + 0.5) - 0.5) / max(fwidth(vFloor), vec2(0.001));
      float line = 1.0 - min(min(edge.x, edge.y), 1.0);
      float checker = mod(floor(vFloor.x) + floor(vFloor.y), 2.0);
      diffuseColor.rgb *= 1.0 - checker * 0.018;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.48, 0.39), line * 0.05);
      float diagonal = vFloor.x + vFloor.y * 0.64;
      float shafts = smoothstep(0.1, 0.2, fract(diagonal / 3.0)) * (1.0 - smoothstep(0.82, 0.91, fract(diagonal / 3.0)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.91, 0.66), shafts * 0.06 * uShafts);
    `,
      );
  };
  return material;
}

export function glassMaterial(color: string, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: opacity }, uColor: { value: new THREE.Color(color) } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv;
      void main() { vUv = uv; vNormal = normalize(mat3(modelMatrix) * normal); vec4 p = modelMatrix * vec4(position, 1.0); vWorld = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv;
      void main() { float fresnel = pow(1.0 - abs(dot(normalize(cameraPosition - vWorld), normalize(vNormal))), 3.0);
      float etch = 1.0 - smoothstep(0.0, 0.025, abs(fract(vUv.y * 8.0) - 0.5));
      gl_FragColor = vec4(uColor + fresnel * 0.2, uOpacity * (0.4 + fresnel * 0.6 + etch * 0.18));
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
      void main() { vLocal = position.xz; vShape = aShape; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
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
