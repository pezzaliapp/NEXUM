// Node program for Sigma: nature encoded by shape (D7) — object ■, event ●, insight ◆ — drawn as GL points.
// Built on Sigma's public NodeProgram class; no additional package.

import { NodeProgram } from "sigma/rendering";
import type { NodeDisplayData, RenderParams } from "sigma/types";
import { floatColor } from "sigma/utils";

const VERTEX = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_shape;
uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform mat3 u_matrix;
varying vec4 v_color;
varying float v_border;
varying float v_shape;
const float bias = 255.0 / 254.0;
void main() {
  gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
  gl_PointSize = a_size / u_sizeRatio * u_pixelRatio * 2.0;
  v_border = (0.5 / a_size) * u_sizeRatio;
  v_shape = a_shape;
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
varying float v_border;
varying float v_shape;
void main(void) {
  vec2 m = gl_PointCoord - vec2(0.5, 0.5);
  float d;
  if (v_shape < 0.5) d = 0.5 - length(m);
  else if (v_shape < 1.5) d = 0.40 - max(abs(m.x), abs(m.y));
  else d = 0.5 - (abs(m.x) + abs(m.y));
  #ifdef PICKING_MODE
  gl_FragColor = d > 0.0 ? v_color : vec4(0.0);
  #else
  float t = d > v_border ? 1.0 : (d > 0.0 ? d / v_border : 0.0);
  gl_FragColor = mix(vec4(0.0), v_color, t);
  #endif
}`;

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext;
const UNIFORMS = ["u_sizeRatio", "u_pixelRatio", "u_matrix"] as const;

export class NodeShapeProgram extends NodeProgram<(typeof UNIFORMS)[number]> {
  getDefinition() {
    return {
      VERTICES: 1,
      VERTEX_SHADER_SOURCE: VERTEX,
      FRAGMENT_SHADER_SOURCE: FRAGMENT,
      METHOD: WebGLRenderingContext.POINTS,
      UNIFORMS,
      ATTRIBUTES: [
        { name: "a_position", size: 2, type: FLOAT },
        { name: "a_size", size: 1, type: FLOAT },
        { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_shape", size: 1, type: FLOAT },
      ],
    };
  }

  processVisibleItem(nodeIndex: number, startIndex: number, data: NodeDisplayData) {
    const a = this.array;
    a[startIndex++] = data.x;
    a[startIndex++] = data.y;
    a[startIndex++] = data.size;
    a[startIndex++] = floatColor(data.color);
    a[startIndex++] = nodeIndex;
    a[startIndex++] = (data as NodeDisplayData & { shape?: number }).shape ?? 0;
  }

  setUniforms({ sizeRatio, pixelRatio, matrix }: RenderParams, { gl, uniformLocations }: any) {
    gl.uniform1f(uniformLocations.u_pixelRatio, pixelRatio);
    gl.uniform1f(uniformLocations.u_sizeRatio, sizeRatio);
    gl.uniformMatrix3fv(uniformLocations.u_matrix, false, matrix);
  }
}
