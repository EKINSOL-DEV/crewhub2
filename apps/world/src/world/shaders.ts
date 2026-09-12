import * as THREE from "three";

export function floorMaterial(width: number, depth: number) {
  const material = new THREE.MeshStandardMaterial({
    color: "#efe9db",
    roughness: 0.93,
  });
  const grid = { value: 0.0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrid = grid;
    shader.vertexShader =
      "varying vec2 vFloor;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvFloor = uv * vec2(" +
          width.toFixed(1) +
          "," +
          depth.toFixed(1) +
          ");",
      );
    shader.fragmentShader =
      "varying vec2 vFloor; uniform float uGrid;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec2 edge = abs(fract(vFloor + 0.5) - 0.5) / max(fwidth(vFloor), vec2(0.001));
      float line = 1.0 - min(min(edge.x, edge.y), 1.0);
      float checker = mod(floor(vFloor.x) + floor(vFloor.y), 2.0);
      diffuseColor.rgb *= 1.0 - checker * 0.018;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.48, 0.39), line * mix(0.035, 0.45, uGrid));
      float diagonal = vFloor.x + vFloor.y * 0.64;
      float shafts = smoothstep(0.1, 0.2, fract(diagonal / 3.0)) * (1.0 - smoothstep(0.82, 0.91, fract(diagonal / 3.0)));
      float sun = shafts * (1.0 - smoothstep(8.0, 14.0, vFloor.y)) * smoothstep(2.0, 4.0, vFloor.x);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.91, 0.66), sun * 0.12);
    `,
      );
  };
  return { material, grid };
}

export function glassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.22 },
      uColor: { value: new THREE.Color("#c0dccd") },
    },
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
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uActive: { value: 0 },
    },
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
