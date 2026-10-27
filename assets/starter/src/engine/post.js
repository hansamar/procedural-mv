// WebGL2 post: one film stock over every chapter.
// Order: shake/zoom -> directional shutter blur -> afterimage -> grade (safelight / cold) ->
// halation (red, from highlights only) -> exposure + shoulder -> invert -> flash -> vignette -> grain.

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;`;

// Bright-pass at quarter res, then separable blur.
const FS_BRIGHT = `${COMMON}
uniform sampler2D src; uniform float thr;
void main(){
  vec2 px = 1.0/vec2(textureSize(src,0));
  vec3 c = vec3(0.);
  for(int i=0;i<4;i++){ vec2 d = vec2(float(i&1),float(i>>1))-0.5; c += texture(src, uv + d*px*2.0).rgb; }
  c *= 0.25;
  float l = dot(c, vec3(0.299,0.587,0.114));
  o = vec4(c * smoothstep(thr, thr+0.25, l), 1.);
}`;

const FS_BLUR = `${COMMON}
uniform sampler2D src; uniform vec2 dir;
void main(){
  vec2 px = dir/vec2(textureSize(src,0));
  vec3 c = texture(src, uv).rgb * 0.2;
  float w[4] = float[4](0.19, 0.14, 0.08, 0.035);
  for(int i=0;i<4;i++){ float d = float(i+1)*1.6; c += (texture(src, uv+px*d).rgb + texture(src, uv-px*d).rgb)*w[i]; }
  o = vec4(c/ (0.2 + 2.0*(0.19+0.14+0.08+0.035)), 1.);
}`;

const FS_FINAL = `${COMMON}
uniform sampler2D scene; uniform sampler2D after; uniform sampler2D glow;
uniform vec2 res; uniform vec2 shake; uniform float zoom; uniform vec2 blur;
uniform float afterAmt; uniform float afterNeg;
uniform float red; uniform float cold; uniform float invert; uniform float flash;
uniform float expo; uniform float halation; uniform float vignette; uniform float grain; uniform float frame;
uniform float fade; uniform float hot; uniform float shoulder;
uniform float renderScale;

const vec3 INK  = vec3(0.024, 0.027, 0.035);
const vec3 BONE = vec3(0.886, 0.898, 0.914);
const vec3 SAFE = vec3(0.66, 0.11, 0.075);
const vec3 SAFEHI = vec3(1.0, 0.62, 0.50);
const vec3 COLD = vec3(0.56, 0.77, 0.78);

float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
uint hashu(uvec2 p, uint f){ uint h=p.x*1597334677u^p.y*3812015801u^f*2798796415u;
  h^=h>>16u; h*=2246822519u; h^=h>>13u; h*=3266489917u; h^=h>>16u; return h; }
float grainAt(vec2 fc, uint f){ return float(hashu(uvec2(fc), f)&16777215u)/16777215.0; }

vec3 sampleScene(vec2 st){
  if (dot(blur,blur) < 0.25) return texture(scene, st).rgb;
  vec3 c = vec3(0.); float n = 0.;
  for (int i=0;i<24;i++){ float k = float(i)/23.0 - 0.5; c += texture(scene, st + blur*k/res).rgb; n += 1.; }
  return c/n;
}

void main(){
  vec2 st = (uv - 0.5)/zoom + 0.5 - shake/res;
  vec3 c = sampleScene(st);

  if (afterAmt > 0.001) {
    vec3 a = texture(after, st).rgb;
    float la = luma(a);
    float v = mix(la, 1.0 - la, afterNeg);
    // a retinal afterimage: cold, soft, added light
    c += COLD * v * v * afterAmt * 0.9;
  }

  float l = luma(c);
  vec3 safe = mix(INK, SAFE, smoothstep(0.0, 0.45, l));
  // a red lamp on steel: the red lives in the shadows and mids, the highlights stay chrome white;
  // only the highlight (hot) lets the red burn through to the whites
  safe = mix(safe, mix(BONE * 0.97, SAFEHI, hot), smoothstep(mix(0.3, 0.55, hot), mix(0.78, 1.0, hot), l));
  c = mix(c, safe, red);
  vec3 cl = mix(INK, COLD*1.05, smoothstep(0.0, 0.9, l));
  c = mix(c, cl, cold);

  // halation blooms *around* highlights: a cold silver bloom, like light off steel; red belongs to the safelight only
  vec3 g = texture(glow, st).rgb;
  vec3 spill = max(g - c * 0.9, 0.0);
  c += spill * halation * vec3(0.78, 0.86, 1.0) * 1.6 + g * halation * 0.06;

  c *= expo;
  // soft shoulder, whites roll into bone not into pure white
  vec3 sh = 1.0 - exp(-c*1.15);
  c = mix(c, sh, smoothstep(0.55, 1.2, max(c.r, max(c.g, c.b))) * shoulder);

  c = mix(c, BONE - c*0.92, invert);
  c = mix(c, BONE*1.06, clamp(flash, 0., 1.));

  vec2 dc = uv - 0.5;
  float vg = smoothstep(0.95, 0.25, length(dc*vec2(1.0, 0.82)));
  c *= mix(1.0, vg, vignette);
  c *= 1.0 - fade;

  vec3 sg = pow(clamp(c, 0., 1.), vec3(1.0/1.0));
  uint f = uint(frame);
  vec2 filmCoord = gl_FragCoord.xy / renderScale;
  float g1 = grainAt(filmCoord, f) - 0.5;
  float g2 = grainAt(floor(filmCoord*0.5), f+7u) - 0.5;
  float lum = luma(sg);
  sg += (g1*0.6 + g2*0.7) * grain * (0.45 + 1.4*lum*(1.0-lum));
  sg += (grainAt(gl_FragCoord.xy, f+13u) - 0.5)/255.0;
  o = vec4(sg, 1.);
}`;

export const POST_DEFAULTS = {
  shake: [0, 0],
  zoom: 1,
  blur: [0, 0],
  afterAmt: 0,
  afterNeg: 0,
  red: 0,
  cold: 0,
  invert: 0,
  flash: 0,
  expo: 1,
  halation: 0.35,
  vignette: 0.45,
  grain: 0.07,
  fade: 0,
  shoulder: 1, // 0 = flat graphics keep their exact whites and reds
};

export function createPost(canvas, W, H, renderScale = 1) {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error("需要 WebGL2");

  function prog(fs) {
    const p = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VS],
      [gl.FRAGMENT_SHADER, fs],
    ]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, "p");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function tex(w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  function target(w, h) {
    const t = tex(w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, w, h };
  }

  const sceneTex = tex();
  const afterTex = tex(2, 2);
  const qw = W >> 2;
  const qh = H >> 2;
  const A = target(qw, qh);
  const B = target(qw, qh);
  const pBright = prog(FS_BRIGHT);
  const pBlur = prog(FS_BLUR);
  const pFinal = prog(FS_FINAL);

  function upload(t, source) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  function pass(P, fb, w, h, bind) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.useProgram(P.p);
    bind(P.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function useTex(unit, t, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(loc, unit);
  }

  return {
    setAfter(source) {
      upload(afterTex, source);
    },
    render(source, s, frame) {
      upload(sceneTex, source);
      pass(pBright, A.fb, qw, qh, (u) => {
        useTex(0, sceneTex, u.src);
        gl.uniform1f(u.thr, 0.62);
      });
      for (const [from, to, dir] of [
        [A, B, [1, 0]],
        [B, A, [0, 1]],
        [A, B, [2.2, 0]],
        [B, A, [0, 2.2]],
      ]) {
        pass(pBlur, to.fb, qw, qh, (u) => {
          useTex(0, from.t, u.src);
          gl.uniform2f(u.dir, dir[0] * renderScale, dir[1] * renderScale);
        });
      }
      pass(pFinal, null, W, H, (u) => {
        useTex(0, sceneTex, u.scene);
        useTex(1, afterTex, u.after);
        useTex(2, A.t, u.glow);
        gl.uniform2f(u.res, W, H);
        gl.uniform2f(u.shake, s.shake[0] * renderScale, -s.shake[1] * renderScale);
        gl.uniform1f(u.zoom, s.zoom);
        gl.uniform2f(u.blur, s.blur[0] * renderScale, -s.blur[1] * renderScale);
        for (const k of ["afterAmt", "afterNeg", "red", "cold", "invert", "flash", "expo", "halation", "vignette", "grain", "fade", "hot", "shoulder"]) {
          gl.uniform1f(u[k], s[k]);
        }
        gl.uniform1f(u.frame, frame);
        gl.uniform1f(u.renderScale, renderScale);
      });
    },
  };
}
