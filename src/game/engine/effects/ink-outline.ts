// Ink outline (M0 T11) — the single biggest "it's a game now" lever. A
// custom postprocessing Effect: depth discontinuities give silhouettes,
// color discontinuities give interior lines between toon fill bands.
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { Color, Uniform } from "three";

const fragmentShader = /* glsl */ `
  uniform vec3 outlineColor;
  uniform float depthBias;
  uniform float depthMul;
  uniform float colorMul;

  float ink_depth(const in vec2 uv) {
    return viewZToOrthographicDepth(getViewZ(readDepth(uv)), cameraNear, cameraFar);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    vec2 t = texelSize;
    float dC = ink_depth(uv);
    float depthEdge =
      abs(ink_depth(uv + vec2(t.x, 0.0)) - dC) +
      abs(ink_depth(uv - vec2(t.x, 0.0)) - dC) +
      abs(ink_depth(uv + vec2(0.0, t.y)) - dC) +
      abs(ink_depth(uv - vec2(0.0, t.y)) - dC);
    depthEdge = smoothstep(depthBias, depthBias * 3.0, depthEdge) * depthMul;

    vec3 cC = inputColor.rgb;
    vec3 cR = texture2D(inputBuffer, uv + vec2(t.x, 0.0)).rgb;
    vec3 cU = texture2D(inputBuffer, uv + vec2(0.0, t.y)).rgb;
    float colorEdge = (length(cR - cC) + length(cU - cC)) * colorMul;

    float edge = clamp(depthEdge + colorEdge, 0.0, 1.0);
    outputColor = vec4(mix(inputColor.rgb, outlineColor, edge), inputColor.a);
  }
`;

export interface InkOutlineOptions {
  color?: string;
  depthBias?: number;
  depthMul?: number;
  colorMul?: number;
}

export class InkOutlineEffect extends Effect {
  constructor({
    color = "#233043",
    depthBias = 0.0012,
    depthMul = 0.9,
    colorMul = 0.28,
  }: InkOutlineOptions = {}) {
    super("InkOutlineEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ["outlineColor", new Uniform(new Color(color))],
        ["depthBias", new Uniform(depthBias)],
        ["depthMul", new Uniform(depthMul)],
        ["colorMul", new Uniform(colorMul)],
      ]),
    });
  }
}
