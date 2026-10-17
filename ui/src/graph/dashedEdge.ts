// Edge program for Sigma: a dashed straight edge, for the links a rule inferred (graph/edgeStyle.ts). Sigma's own
// rectangle edge (same attributes, same picking) with the distance along the edge in screen pixels: the gaps are
// discarded when drawing, never when picking, so a dashed edge is clicked like any other.
// Built on Sigma's public EdgeRectangleProgram; no additional package.

import { EdgeRectangleProgram } from "sigma/rendering";

const DASH = 6.0, GAP = 4.0;   // CSS pixels, at every zoom

const VERTEX = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;
uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_feather;
uniform vec2 u_resolution;
varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;
varying float v_along;
const float bias = 255.0 / 254.0;
void main() {
  vec2 normal = a_normal * a_normalCoef;
  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;
  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;
  float pixelsThickness = max(normalLength, u_minEdgeThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;
  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness, 1)).xy, 0, 1);
  vec2 s = (u_matrix * vec3(a_positionStart, 1)).xy;
  vec2 e = (u_matrix * vec3(a_positionEnd, 1)).xy;
  v_along = a_positionCoef * length((e - s) * u_resolution * 0.5);
  v_thickness = webGLThickness / u_zoomRatio;
  v_normal = unitNormal;
  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;
  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif
  v_color.a *= bias;
}`;

const FRAGMENT = /* glsl */ `
precision mediump float;
varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;
varying float v_along;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);
void main(void) {
  #ifdef PICKING_MODE
  gl_FragColor = v_color;
  #else
  if (mod(v_along, ${(DASH + GAP).toFixed(1)}) > ${DASH.toFixed(1)}) discard;
  float dist = length(v_normal) * v_thickness;
  float t = smoothstep(v_thickness - v_feather, v_thickness, dist);
  gl_FragColor = mix(v_color, transparent, t);
  #endif
}`;

export class EdgeDashedProgram extends EdgeRectangleProgram {
  getDefinition() {
    const d = super.getDefinition();
    return { ...d, VERTEX_SHADER_SOURCE: VERTEX, FRAGMENT_SHADER_SOURCE: FRAGMENT, UNIFORMS: [...d.UNIFORMS, "u_resolution"] } as any;
  }
  setUniforms(params: any, ctx: any) {
    super.setUniforms(params, ctx);
    ctx.gl.uniform2f(ctx.uniformLocations.u_resolution, params.width, params.height);
  }
}
