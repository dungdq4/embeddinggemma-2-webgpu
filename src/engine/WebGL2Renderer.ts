export const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec2 aVertex;
layout(location=1) in vec4 aRect;
layout(location=2) in vec4 aSurface;
layout(location=3) in vec4 aShape;
layout(location=4) in mat3 aRotation;
layout(location=7) in vec3 aWorld;
layout(location=8) in vec4 aParams;

uniform float uPerspective;
uniform vec2 uViewport;

out vec2 vUv;
flat out vec2 vSize;
flat out float vImage;
flat out float vOpacity;
flat out float vHover;
flat out float vLens;
flat out float vDispersion;
flat out vec4 vShape;
flat out vec4 vSurface;
flat out mat3 vRotation;
out vec3 vWorld;

void main(){
 vUv = aVertex + .5;
 vSize = aRect.zw;
 vImage = aParams.w;
 vOpacity = aParams.x;
 vHover = aParams.y;
 vLens = aParams.z;
 vDispersion = .05;
 vShape = aShape;
 vSurface = aSurface;
 vRotation = aRotation;
 
 vec3 local = vec3(aVertex * aRect.zw, 0.);
 vec3 world = aWorld + aRotation * local;
 vWorld = world;
 
 float z = uPerspective - world.z;
 vec2 projected = world.xy * (uPerspective / z);
 vec2 clip = (projected / (uViewport * .5));
 gl_Position = vec4(clip, (world.z + 5000.) / 10000., 1.);
}`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec2 vUv;
flat in vec2 vSize;
flat in float vImage;
flat in float vOpacity;
flat in float vHover;
flat in float vLens;
flat in float vDispersion;
flat in vec4 vShape;
flat in vec4 vSurface;
flat in mat3 vRotation;
in vec3 vWorld;

uniform sampler2DArray uImages;
uniform sampler2D uEnvironment;
uniform sampler2D uFocusedImage;
uniform float uPerspective;

out vec4 outColor;

float sdf(vec2 p){
 float radius = vShape.x;
 vec2 q = abs(p) - vSize * .5 + radius;
 return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - radius;
}

float bevel(vec2 p){
 float d = sdf(p);
 float t = clamp(1. + d / vShape.y, 0., 1.);
 return pow(max(1. - pow(t, 3.9), 0.), 1. / 3.9) * vShape.z;
}

vec2 cover(vec2 uv){
 float ratio = vSize.x / vSize.y;
 float imageRatio = vSurface.y;
 if(ratio < imageRatio) uv.x = (uv.x - .5) * ratio / imageRatio + .5;
 else uv.y = (uv.y - .5) * imageRatio / ratio + .5;
 return clamp(uv, vec2(.001), vec2(.999));
}

vec3 imageAt(vec2 uv){
 uv = cover(uv);
 if(vImage < -.5) return pow(texture(uFocusedImage, uv).rgb, vec3(2.2));
 uv = (uv - .5) * vSurface.zw + .5;
 vec2 edge = .5 * vSurface.zw;
 vec2 texel = .5 / vec2(textureSize(uImages, 0).xy);
 uv = clamp(uv, .5 - edge + texel, .5 + edge - texel);
 return pow(texture(uImages, vec3(uv, vImage)).rgb, vec3(2.2));
}

vec3 environment(vec3 ray){
 float c = cos(-2.), s = sin(-2.);
 ray = vec3(ray.x * c - ray.z * s, ray.y, ray.x * s + ray.z * c);
 vec2 uv = vec2(atan(ray.z, ray.x) / (6.2831853) + .5, asin(clamp(ray.y, -1., 1.)) / 3.14159265 + .5);
 vec4 rgbe = texture(uEnvironment, uv);
 return rgbe.rgb * exp2(rgbe.a * 255. - 128.) * (255. / 256.);
}

void main(){
 vec2 p = (vUv - .5) * vSize;
 float d = sdf(p);
 float aa = max(fwidth(d) * .5, .3);
 float alpha = (1. - smoothstep(-aa, aa, d)) * vOpacity;
 if(alpha < .01) discard;

 float epsilon = max(vShape.y * .06, .35);
 vec2 gradient = vec2(
   bevel(p + vec2(epsilon, 0.)) - bevel(p - vec2(epsilon, 0.)),
   bevel(p + vec2(0., epsilon)) - bevel(p - vec2(0., epsilon))
 ) / (2. * epsilon);

 float slope = length(gradient);
 gradient *= min(slope, 1.74) / max(slope, .0001);
 vec2 curve = p / sqrt(max(vSurface.x * vSurface.x - dot(p, p), 1.));
 vec3 normal = normalize(vec3(curve - gradient, 1.));
 vec3 view = normalize(transpose(vRotation) * (vec3(0., 0., uPerspective) - vWorld));
 float thickness = vShape.z * vLens;

 vec3 red = refract(-view, normal, 1. / 2.14);
 vec3 green = refract(-view, normal, 1. / 2.3);
 vec3 blue = refract(-view, normal, 1. / 2.46);

 red = mix(green, red, vDispersion);
 blue = mix(green, blue, vDispersion);

 vec2 ur = vUv + red.xy * (thickness / max(abs(red.z), .05)) * .7 / vSize;
 vec2 ug = vUv + green.xy * (thickness / max(abs(green.z), .05)) * .7 / vSize;
 vec2 ub = vUv + blue.xy * (thickness / max(abs(blue.z), .05)) * .7 / vSize;

 vec3 transmitted = vec3(imageAt(ur).r, imageAt(ug).g, imageAt(ub).b);
 vec3 worldNormal = normalize(vRotation * normal);
 vec3 worldView = normalize(vec3(0., 0., uPerspective) - vWorld);
 vec3 reflection = environment(reflect(-worldView, worldNormal));

 float fresnel = .045 + .955 * pow(clamp(1. - dot(normal, view), 0., 1.), 5.);
 float rim = smoothstep(-vShape.w, 0., d) * .11 * vLens;
 vec3 color = mix(transmitted, reflection, min(fresnel * 1.93, .27) * vLens) + vec3(rim);
 color += vec3(.009, .014, .017) * vHover * vLens;

 outColor = vec4(pow(max(color, vec3(0.)), vec3(1. / 2.2)), alpha);
}`;

export function parseRadianceHDR(buffer: ArrayBuffer): { width: number; height: number; pixels: Uint8Array } {
  const bytes = new Uint8Array(buffer);
  let pos = 0;
  let width = 0;
  let height = 0;

  while (pos < bytes.length) {
    let lineEnd = pos;
    while (lineEnd < bytes.length && bytes[lineEnd] !== 10) lineEnd++;
    const line = new TextDecoder().decode(bytes.subarray(pos, lineEnd));
    pos = lineEnd + 1;
    const match = line.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
    if (match) {
      height = Number(match[1]);
      width = Number(match[2]);
      break;
    }
  }

  if (!width || !height || width * height > 32e6) {
    throw new Error('Invalid environment image');
  }

  const pixels = new Uint8Array(width * height * 4);
  const scanline = new Uint8Array(width * 4);

  for (let y = 0; y < height; y++) {
    if (bytes[pos] === 2 && bytes[pos + 1] === 2) {
      if ((bytes[pos + 2] << 8 | bytes[pos + 3]) !== width) {
        throw new Error('Invalid environment scanline');
      }
      pos += 4;
      for (let ch = 0; ch < 4; ch++) {
        let x = 0;
        while (x < width) {
          const val = bytes[pos++];
          const count = val > 128 ? val - 128 : val;
          if (!count || x + count > width || pos + (val > 128 ? 1 : count) > bytes.length) {
            throw new Error('Truncated environment image');
          }
          if (val > 128) {
            scanline.fill(bytes[pos++], ch * width + x, ch * width + x + count);
          } else {
            scanline.set(bytes.subarray(pos, pos + count), ch * width + x);
            pos += count;
          }
          x += count;
        }
      }
      for (let x = 0; x < width; x++) {
        for (let ch = 0; ch < 4; ch++) {
          pixels[(y * width + x) * 4 + ch] = scanline[ch * width + x];
        }
      }
    } else {
      if (pos + width * 4 > bytes.length) throw new Error('Truncated environment image');
      pixels.set(bytes.subarray(pos, pos + width * 4), y * width * 4);
      pos += width * 4;
    }
  }

  return { width, height, pixels };
}

export function createRoundedGridMesh(cols = 24, rows = 18): { vertices: Float32Array; indices: Uint16Array } {
  const vertices = new Float32Array((cols + 1) * (rows + 1) * 2);
  const indices = new Uint16Array(cols * rows * 6);

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const idx = (r * (cols + 1) + c) * 2;
      vertices[idx] = c / cols - 0.5;
      vertices[idx + 1] = r / rows - 0.5;
    }
  }

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + cols + 1;
      indices.set([a, a + 1, b, b, a + 1, b + 1], idx);
      idx += 6;
    }
  }

  return { vertices, indices };
}

export function createWebGL2Renderer(
  canvas: HTMLCanvasElement,
  onFrame: () => void,
  options: { onContextLost?: () => void; textureLayers?: number } = {}
) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
  });

  if (!gl) return null;

  const program = gl.createProgram();
  if (!program) return null;

  const shaders: WebGLShader[] = [];
  const buffers: WebGLBuffer[] = [];
  const textures: WebGLTexture[] = [];
  let vao: WebGLVertexArrayObject | null = null;
  let disposed = false;
  let contextLost = false;
  const abortCtrl = new AbortController();

  const cleanup = () => {
    for (const s of shaders) gl.deleteShader(s);
    for (const b of buffers) gl.deleteBuffer(b);
    for (const t of textures) gl.deleteTexture(t);
    if (vao) gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
  };

  try {
    for (const [src, type] of [
      [VERTEX_SHADER, gl.VERTEX_SHADER],
      [FRAGMENT_SHADER, gl.FRAGMENT_SHADER],
    ] as [string, number][]) {
      const s = gl.createShader(type);
      if (!s) throw new Error('Glass shader unavailable');
      shaders.push(s);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) || 'Shader error');
      }
      gl.attachShader(program, s);
    }

    gl.linkProgram(program);
    if (!gl.getShaderParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getShaderInfoLog(program) || 'Program link error');
    }

    const highMesh = createRoundedGridMesh(24, 18);
    const lowMesh = createRoundedGridMesh(8, 6);
    let activeMesh = highMesh;

    vao = gl.createVertexArray();
    const highVbo = gl.createBuffer()!;
    const highIbo = gl.createBuffer()!;
    const lowVbo = gl.createBuffer()!;
    const lowIbo = gl.createBuffer()!;
    const instVbo = gl.createBuffer()!;

    const texArray = gl.createTexture()!;
    const texEnv = gl.createTexture()!;
    const texFocused = gl.createTexture()!;

    buffers.push(highVbo, highIbo, lowVbo, lowIbo, instVbo);
    textures.push(texArray, texEnv, texFocused);

    gl.bindVertexArray(vao);

    // Setup Low Mesh
    gl.bindBuffer(gl.ARRAY_BUFFER, lowVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lowMesh.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lowIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lowMesh.indices, gl.STATIC_DRAW);

    // Setup High Mesh (Default)
    gl.bindBuffer(gl.ARRAY_BUFFER, highVbo);
    gl.bufferData(gl.ARRAY_BUFFER, highMesh.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, highIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, highMesh.indices, gl.STATIC_DRAW);

    // Setup Instance Attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
    gl.bufferData(gl.ARRAY_BUFFER, 2048 * 84, gl.DYNAMIC_DRAW);

    // Locations 1..6:
    // 1: rect (vec4) offset 0
    // 2: surface (vec4) offset 16
    // 3: shape (vec4) offset 32
    // 4..6: rotation matrix (mat3) offset 48, 60, 72 (or 3x vec4)
    // 7: world (vec3)
    // 8: params (vec4)
    let stride = 84;
    for (let loc = 1; loc <= 6; loc++) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, loc === 6 ? 1 : 4, gl.FLOAT, false, stride, (loc - 1) * 16);
      gl.vertexAttribDivisor(loc, 1);
    }

    // Allocate 2D Array Texture for Cards
    const maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
    const numLayers = Math.max(2, Math.min(options.textureLayers || 96, maxLayers));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texArray);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 640, 640, numLayers);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Initial dummy environment texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texEnv);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([60, 65, 70, 128])
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Initial focused texture
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texFocused);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Load studio.hdr
    fetch('./studio.hdr', { signal: abortCtrl.signal })
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('HDR missing'))))
      .then(parseRadianceHDR)
      .then(({ width, height, pixels }) => {
        if (disposed || contextLost || gl.isContextLost()) return;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texEnv);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        onFrame();
      })
      .catch(() => {});

    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'uImages'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'uEnvironment'), 1);
    gl.uniform1i(gl.getUniformLocation(program, 'uFocusedImage'), 2);

    const uPerspectiveLoc = gl.getUniformLocation(program, 'uPerspective');
    const uViewportLoc = gl.getUniformLocation(program, 'uViewport');

    let currentWidth = 1;
    let currentHeight = 1;

    return {
      resize(w: number, h: number, dpr: number = 1) {
        currentWidth = w;
        currentHeight = h;
        const bw = Math.max(1, Math.round(w * dpr));
        const bh = Math.max(1, Math.round(h * dpr));
        if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw;
          canvas.height = bh;
        }
      },

      render(cards: any[], camera: any, options: any = {}) {
        if (contextLost || gl.isContextLost()) return;

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (!cards.length) return;

        gl.useProgram(program);
        gl.uniform1f(uPerspectiveLoc, camera.perspective);
        gl.uniform2f(uViewportLoc, currentWidth, currentHeight);

        gl.bindVertexArray(vao);
        gl.drawElementsInstanced(
          gl.TRIANGLES,
          activeMesh.indices.length,
          gl.UNSIGNED_SHORT,
          0,
          Math.min(cards.length, 2048)
        );
      },

      dispose() {
        if (disposed) return;
        disposed = true;
        abortCtrl.abort();
        cleanup();
      },
    };
  } catch (err) {
    cleanup();
    console.info('Atlas renderer uses CSS fallback:', err);
    return null;
  }
}

