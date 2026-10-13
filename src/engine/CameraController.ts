export const MIN_ZOOM = 0.18;
export const MAX_ZOOM = 2.5;
export const FRAME_TIME = 16.67;

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function orbitMatrix(pitch: number, yaw: number): number[] {
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  return [
    cosY,
    sinP * sinY,
    -cosP * sinY,
    0,
    cosP,
    sinP,
    sinY,
    -sinP * cosY,
    cosP * cosY,
  ];
}

export function matVecMul(m: number[], v: number[]): number[] {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

export function matTranspose(m: number[]): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function toSphere(x: number, y: number, radius: number): { position: number[]; q: number[] } {
  const theta = x / radius;
  const phi = y / radius;
  const normal = [Math.sin(theta) * Math.cos(phi), Math.sin(phi), Math.cos(theta) * Math.cos(phi)];
  const axis = [-normal[1], normal[0], 0, 1 + normal[2]];
  const len = Math.hypot(...axis);
  const q = len > 1e-12 ? [axis[0] / len, axis[1] / len, 0, axis[3] / len] : [1, 0, 0, 0];

  return {
    position: [normal[0] * radius, normal[1] * radius, (normal[2] - 1) * radius],
    q,
  };
}

export function raycastSphere(screenX: number, screenY: number, camera: AtlasCamera): [number, number] {
  const invOrbit = matTranspose(camera.orbit);
  const rayOrigin = matVecMul(invOrbit, [0, 0, camera.perspective - camera.shift]);
  const rayDir = matVecMul(invOrbit, [screenX / camera.perspective, screenY / camera.perspective, -1]);
  const sphereCenter = [rayOrigin[0], rayOrigin[1], rayOrigin[2] + camera.radius];

  const a = rayDir.reduce((sum, d) => sum + d * d, 0);
  const b = 2 * sphereCenter.reduce((sum, c, i) => sum + c * rayDir[i], 0);
  const c = sphereCenter.reduce((sum, c) => sum + c * c, 0) - camera.radius * camera.radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) return [screenX, screenY];

  const dist = (-b - Math.sqrt(discriminant)) / (2 * a);
  const hit = rayOrigin.map((origin, i) => origin + rayDir[i] * dist);

  return [
    Math.atan2(hit[0], hit[2] + camera.radius) * camera.radius,
    Math.asin(clamp(hit[1] / camera.radius, -1, 1)) * camera.radius,
  ];
}

export function projectScreen(
  worldPos: number[],
  camera: AtlasCamera,
  width: number,
  height: number
): { x: number; y: number; depth: number } {
  const rotated = matVecMul(camera.orbit, worldPos);
  rotated[2] += camera.shift;
  const depth = camera.perspective - rotated[2];

  return {
    x: width / 2 + (rotated[0] * camera.perspective) / depth,
    y: height / 2 + (rotated[1] * camera.perspective) / depth,
    depth,
  };
}

export interface AtlasCamera {
  perspective: number;
  radius: number;
  orbit: number[];
  shift: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export class CameraController {
  current: CameraState;
  target: CameraState;
  velocity = { x: 0, y: 0 };
  anchor: { x: number; y: number; px: number; py: number } | null = null;
  orbitTarget = { pitch: 0, yaw: 0 };
  cardScale = 1;
  camera: AtlasCamera = {
    perspective: 1200,
    radius: 5000,
    orbit: orbitMatrix(0, 0),
    shift: 0,
  };
  width = 1;
  height = 1;
  pitch = 0;
  yaw = 0;
  shift = 0;
  lastTime?: number;
  initial: CameraState;
  reduced: boolean;

  constructor(options: {
    width: number;
    height: number;
    reduced?: boolean;
    initial?: { x?: number; y?: number; zoom?: number };
  }) {
    this.initial = {
      x: options.initial?.x ?? 0,
      y: options.initial?.y ?? 0,
      zoom: clamp(options.initial?.zoom ?? 1, MIN_ZOOM, MAX_ZOOM),
    };
    this.current = { ...this.initial };
    this.target = { ...this.initial };
    this.reduced = options.reduced ?? false;
    this.resize(options.width, options.height);
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, Number.isFinite(w) ? w : 1);
    this.height = Math.max(1, Number.isFinite(h) ? h : 1);
    this.cardScale = (this.width * (this.height > this.width ? 0.72 : 0.38)) / 656;
    const factor = Math.max(this.width, this.height) / 1728;
    this.camera = {
      perspective: 1200 * factor,
      radius: 5000 * factor,
      orbit: orbitMatrix(this.pitch, this.yaw),
      shift: this.shift,
    };
    this.anchor = null;
  }

  zoomAt(targetZoom: number, screenX: number = 0, screenY: number = 0) {
    if (!Number.isFinite(targetZoom) || targetZoom <= 0) return;
    const clamped = clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
    const [worldX, worldY] = raycastSphere(screenX, screenY, this.camera);

    this.anchor = {
      x: this.target.x + worldX / (this.target.zoom * this.cardScale),
      y: this.target.y + worldY / (this.target.zoom * this.cardScale),
      px: worldX,
      py: worldY,
    };
    this.target.zoom = clamped;
    this.target.x = this.anchor.x - worldX / (clamped * this.cardScale);
    this.target.y = this.anchor.y - worldY / (clamped * this.cardScale);
    this.velocity = { x: 0, y: 0 };
  }

  panBy(dx: number, dy: number) {
    this.stop();
    this.target.x += dx / (this.target.zoom * this.cardScale);
    this.target.y += dy / (this.target.zoom * this.cardScale);
  }

  setView(view: Partial<CameraState>) {
    this.stop();
    if (view.x !== undefined && Number.isFinite(view.x)) this.target.x = view.x;
    if (view.y !== undefined && Number.isFinite(view.y)) this.target.y = view.y;
    if (view.zoom !== undefined && Number.isFinite(view.zoom)) {
      this.target.zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
    }
  }

  setOrbit(screenX: number, screenY: number) {
    if (this.reduced) return;
    this.orbitTarget.pitch = ((screenY / this.height) * 2 - 1) * 0.05;
    this.orbitTarget.yaw = -(((screenX / this.width) * 2 - 1) * 0.05);
  }

  stop() {
    this.velocity = { x: 0, y: 0 };
    this.anchor = null;
  }

  step(time: number, isDragging: boolean = false): boolean {
    const delta = this.lastTime === undefined ? FRAME_TIME : time - this.lastTime;
    const rate = Math.min(2, Math.max(0.2, delta / FRAME_TIME || 1));
    this.lastTime = time;

    if (!isDragging && Math.hypot(this.velocity.x, this.velocity.y) > 0.05) {
      this.target.x += this.velocity.x * rate;
      this.target.y += this.velocity.y * rate;
      this.velocity.x *= Math.pow(0.88, rate);
      this.velocity.y *= Math.pow(0.88, rate);
      this.anchor = null;
    }

    const zoomDamp = this.reduced ? 1 : 1 - Math.pow(0.84, rate);
    const orbitDamp = this.reduced ? 1 : 1 - Math.pow(0.89, rate);

    this.current.zoom = Math.exp(
      Math.log(this.current.zoom) + (Math.log(this.target.zoom) - Math.log(this.current.zoom)) * zoomDamp
    );

    if (this.anchor) {
      this.current.x = this.anchor.x - this.anchor.px / (this.current.zoom * this.cardScale);
      this.current.y = this.anchor.y - this.anchor.py / (this.current.zoom * this.cardScale);
    } else {
      this.current.x += (this.target.x - this.current.x) * zoomDamp;
      this.current.y += (this.target.y - this.current.y) * zoomDamp;
    }

    const tiltTarget = this.reduced
      ? 0
      : -this.camera.perspective *
        0.095 *
        Math.tanh(
          (Math.hypot(this.velocity.x, this.velocity.y) * this.cardScale) / (this.camera.perspective * 0.065)
        );

    this.pitch += (this.orbitTarget.pitch - this.pitch) * orbitDamp;
    this.yaw += (this.orbitTarget.yaw - this.yaw) * orbitDamp;
    this.shift += (tiltTarget - this.shift) * orbitDamp;

    const moving =
      Math.abs(this.current.x - this.target.x) +
        Math.abs(this.current.y - this.target.y) +
        Math.abs(this.current.zoom - this.target.zoom) * 1000 +
        Math.hypot(this.velocity.x, this.velocity.y) >
      0.09;

    const rotating =
      Math.abs(this.pitch - this.orbitTarget.pitch) + Math.abs(this.yaw - this.orbitTarget.yaw) > 2e-5 ||
      Math.abs(this.shift - tiltTarget) > 0.025;

    if (!moving) {
      Object.assign(this.current, this.target);
      this.anchor = null;
      this.velocity = { x: 0, y: 0 };
    }

    if (!rotating) {
      this.pitch = this.orbitTarget.pitch;
      this.yaw = this.orbitTarget.yaw;
      this.shift = tiltTarget;
    }

    this.camera = {
      ...this.camera,
      orbit: orbitMatrix(this.pitch, this.yaw),
      shift: this.shift,
    };

    return moving || rotating;
  }

  reset(view?: Partial<CameraState>) {
    this.setView({ ...this.initial, ...view });
    this.orbitTarget = { pitch: 0, yaw: 0 };
  }
}

