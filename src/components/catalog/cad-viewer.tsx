import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  OrbitControls,
  useGLTF,
  useProgress,
  Center,
} from "@react-three/drei";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import * as THREE from "three";
import type { Mesh, Group, Texture } from "three";
import { Box, Grid3x3, RefreshCw } from "lucide-react";

/** WASM-декодеры Draco лежат в public/draco/ — без них сжатая сетка не распакуется. */
const sharedDraco = new DRACOLoader();
sharedDraco.setDecoderPath("/draco/");
function attachDraco(loader: { setDRACOLoader: (l: DRACOLoader) => void }) {
  loader.setDRACOLoader(sharedDraco);
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;
    const extension = context.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const PLASTIC = { roughness: 0.52, metalness: 0 } as const;
export const DEFAULT_PART_COLOR = "#000000";
export type PartMaterial = {
  roughness: number;
  /** Пластик — диэлектрик: значение всегда приводится к 0. */
  metalness: number;
  opacity?: number;
  /** Микроплёнка от литья под давлением. */
  clearcoat?: number;
  /** Процедурная шагрень: микрорельеф литой корки. */
  texture?: "shagreen";
};

/**
 * Карта нормалей с микрошумом: имитирует шагрень — свет рассеивается
 * по микрорельефу, поверхность перестаёт быть «пластиковой пустотой».
 */
let shagreenCache: Texture | null = null;
function shagreenNormalMap(): Texture {
  if (shagreenCache) return shagreenCache;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const n = (Math.random() - 0.5) * 46;
    data[i * 4] = 128 + n;
    data[i * 4 + 1] = 128 + (Math.random() - 0.5) * 46;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.needsUpdate = true;
  shagreenCache = tex;
  return tex;
}

/** Единая PBR-настройка пластика: metalness 0 + тонкий clearcoat. */
function pbrProps(material: PartMaterial) {
  const opacity = material.opacity ?? 1;
  return {
    roughness: material.roughness,
    metalness: 0,
    clearcoat: material.clearcoat ?? 0.08,
    clearcoatRoughness: Math.min(0.6, material.roughness * 0.7),
    envMapIntensity: material.roughness < 0.4 ? 1.15 : 0.75,
    transparent: opacity < 1,
    opacity,
    ...(material.texture === "shagreen"
      ? { normalMap: shagreenNormalMap(), normalScale: new THREE.Vector2(0.35, 0.35) }
      : {}),
  };
}

/** Стиль Wireframe, адаптированный под цвет детали: линии + полупрозрачная «призрачная» заливка. */
export function wireStyle(hex: string) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.l >= 0.7) return { bg: "#ffffff", line: "#1a1a1a", fill: "#d9dcdf", opacity: 0.85, lineOpacity: 0.55 };
  if (hsl.l <= 0.18) return { bg: "#f0f0f0", line: "#2c3e50", fill: "#8e959d", opacity: 0.8, lineOpacity: 0.3 };
  const line = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.8), 0.12);
  return { bg: "#ffffff", line: `#${line.getHexString()}`, fill: hex, opacity: 0.8, lineOpacity: 0.45 };
}

function applyWire(m: Mesh, color: string) {
  const st = wireStyle(color);
  m.material = new THREE.MeshStandardMaterial({
    color: st.fill,
    transparent: true,
    opacity: st.opacity,
    roughness: 0.7,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  }) as never;
  const lines = new THREE.Mesh(
    m.geometry,
    new THREE.MeshBasicMaterial({ color: st.line, wireframe: true, transparent: true, opacity: st.lineOpacity }),
  );
  lines.raycast = () => {};
  m.add(lines);
}

function GltfModel({
  url,
  wire,
  color,
  material,
  mmScale,
  rotation,
}: {
  url: string;
  wire: boolean;
  color: string;
  material: PartMaterial;
  mmScale?: boolean;
  rotation: readonly [number, number, number];
}) {
  const { scene } = useGLTF(url, true, undefined, attachDraco as never);
  const cloned = useMemo(() => {
    const s = scene.clone(true);
    const meshes: Mesh[] = [];
    s.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.material && !Array.isArray(m.material)) meshes.push(m);
    });
    for (const m of meshes) {
      // Базовые материалы из GLB заменяем на физически корректный пластик.
      const src = m.material as unknown as { map?: Texture | null; aoMap?: Texture | null };
      if (wire) {
        applyWire(m, color);
      } else {
        m.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(color),
          ...pbrProps(material),
          ...(material.metalness > 0 && mmScale ? { metalness: material.metalness } : {}),
          ...(src.map ? { map: src.map } : {}),
          ...(src.aoMap ? { aoMap: src.aoMap, aoMapIntensity: 1 } : {}),
        }) as never;
      }
      m.castShadow = true;
      m.receiveShadow = true;
    }
    // CAD-модели Z-up, Three.js Y-up. Ориентация задаётся для конкретного
    // артикула: у КРЕПСС +Z направлен к шляпке, поэтому нужен -90° по X.
    s.rotation.set(...rotation);
    s.updateMatrixWorld(true);
    // Fit to screen: нормализуем по наибольшей оси (60 мм у 60×40) и
    // переносим центр Bounding Box в начало координат — вращение без «восьмёрки».
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    // mmScale: единый масштаб 1 мм = 0.025 ед. (GLB хранится ×0.05) — 60×40 и 25×25
    // соотносятся по реальным габаритам; иначе — fit по наибольшей оси.
    const k = mmScale ? 0.5 : 1.5 / Math.max(size.x, size.y, size.z, 1e-6);
    const c = box.getCenter(new THREE.Vector3());
    const wrap = new THREE.Group();
    s.position.sub(c);
    wrap.add(s);
    wrap.scale.setScalar(k);
    return wrap;
  }, [scene, wire, color, material, mmScale, rotation]);
  // Освобождаем материалы предыдущего меша (геометрия общая с кэшем useGLTF).
  useEffect(
    () => () => {
      cloned.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && m.material && !Array.isArray(m.material)) (m.material as THREE.Material).dispose();
      });
      useGLTF.clear(url);
    },
    [cloned, url],
  );
  return <primitive object={cloned} />;
}

/**
 * Профиль вращения держателя KR-50 (мм → условные единицы сцены).
 * Строится по реальным габаритам изделия: ножка Ø34×22 мм, шар Ø50 мм,
 * срезанная макушка на высоте 63 мм, общая высота 65 мм.
 */
const TOWBAR_PROFILE: THREE.Vector2[] = (() => {
  const S = 0.0248; // масштаб мм → сцена (шар ≈ 1.24 ед. в диаметре)
  const H = 65; // общая высота, мм
  const R = 25; // радиус шара, мм
  const rSkirt = 17; // радиус ножки, мм
  const hSkirt = 22; // высота ножки, мм
  const yc = hSkirt + Math.sqrt(R * R - rSkirt * rSkirt); // центр шара, мм
  const yFlat = 63; // высота среза макушки, мм
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(rSkirt, 0),
    new THREE.Vector2(rSkirt, hSkirt),
  ];
  const a0 = Math.asin((hSkirt - yc) / R);
  const a1 = Math.asin((yFlat - yc) / R);
  const STEPS = 40;
  for (let i = 1; i <= STEPS; i += 1) {
    const a = a0 + ((a1 - a0) * i) / STEPS;
    pts.push(new THREE.Vector2(R * Math.cos(a), yc + R * Math.sin(a)));
  }
  pts.push(new THREE.Vector2(0, yFlat));
  // Центрируем по высоте и переводим в единицы сцены.
  return pts.map((p) => new THREE.Vector2(p.x * S, (p.y - H / 2) * S));
})();

/**
 * Параметрический прокси-меш: используется, пока в S3 нет Draco-модели артикула.
 * Геометрия строится по категории, поэтому вьювер всегда показывает узел, а не пустой холст.
 */

function ProxyModel({
  category,
  wire,
  color,
  material,
}: {
  category: string;
  wire: boolean;
  color: string;
  material: PartMaterial;
}) {
  const ws = wireStyle(color);
  const mat = wire ? (
    <meshBasicMaterial color={ws.line} wireframe />
  ) : (
    <meshPhysicalMaterial color={color} {...pbrProps(material)} />
  );

  // Держатель колпачка фаркопа «Каршар» KR-50 — реконструкция по фото изделия:
  // шар Ø50 мм со срезанной макушкой, плавно переходящий в прямую ножку Ø34 мм.
  if (category.includes("фарк")) {
    return (
      <mesh castShadow receiveShadow>
        <latheGeometry args={[TOWBAR_PROFILE, 72]} />
        {mat}
      </mesh>
    );
  }

  if (category.includes("Колпач")) {

    return (
      <group>
        <mesh castShadow>
          <cylinderGeometry args={[0.55, 0.6, 0.9, 48]} />
          {mat}
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <torusGeometry args={[0.6, 0.06, 16, 48]} />
          {mat}
        </mesh>
      </group>
    );
  }
  // Крышка канистры — круглый корпус DIN 61 с накаткой и внутренним обтюратором
  if (category.includes("канистр")) {
    return (
      <group>
        <mesh castShadow>
          <cylinderGeometry args={[0.72, 0.72, 0.42, 64]} />
          {mat}
        </mesh>
        <mesh position={[0, 0.23, 0]}>
          <cylinderGeometry args={[0.68, 0.72, 0.05, 64]} />
          {mat}
        </mesh>
        <mesh position={[0, -0.26, 0]}>
          <cylinderGeometry args={[0.58, 0.58, 0.14, 48]} />
          {mat}
        </mesh>
        <mesh position={[0, -0.38, 0]}>
          <coneGeometry args={[0.5, 0.16, 48]} />
          {mat}
        </mesh>
      </group>
    );
  }
  if (category.includes("Хомут")) {
    return (
      <group rotation={[Math.PI / 2.2, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.8, 0.07, 20, 80, Math.PI * 1.7]} />
          {mat}
        </mesh>
        <mesh position={[0.8, 0, 0]}>
          <boxGeometry args={[0.34, 0.3, 0.26]} />
          {mat}
        </mesh>
      </group>
    );
  }
  if (category.includes("Крепёж")) {
    return (
      <group>
        <mesh>
          <cylinderGeometry args={[0.13, 0.13, 1.7, 32]} />
          {mat}
        </mesh>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.36, 0.36, 0.16, 6]} />
          {mat}
        </mesh>
        <mesh position={[0, -0.9, 0]}>
          <coneGeometry args={[0.14, 0.28, 24]} />
          {mat}
        </mesh>
      </group>
    );
  }
  if (category.includes("Опор")) {
    return (
      <group>
        <mesh>
          <boxGeometry args={[1.5, 0.28, 0.9]} />
          {mat}
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[0.5, 0.6, 0.66]} />
          {mat}
        </mesh>
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} position={[x, -0.28, 0]}>
            <cylinderGeometry args={[0.16, 0.2, 0.3, 24]} />
            {mat}
          </mesh>
        ))}
      </group>
    );
  }
  // Заглушки трубные — квадратный корпус с юбкой и рёбрами жёсткости
  return (
    <group>
      <mesh>
        <boxGeometry args={[1.2, 0.22, 1.2]} />
        {mat}
      </mesh>
      <mesh position={[0, -0.42, 0]}>
        <boxGeometry args={[1.02, 0.65, 1.02]} />
        {mat}
      </mesh>
      {[0, Math.PI / 2].map((r) => (
        <mesh key={r} position={[0, -0.42, 0]} rotation={[0, r, 0]}>
          <boxGeometry args={[0.96, 0.6, 0.08]} />
          {mat}
        </mesh>
      ))}
    </group>
  );
}

function Spin({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const ref = useRef<Group>(null);
  useFrame((_, d) => {
    if (enabled && ref.current) ref.current.rotation.y += d * 0.18;
  });
  return <group ref={ref}>{children}</group>;
}

function CadLoader() {
  const { progress, active } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface/80">
      <div className="w-56">
        <div className="h-px w-full bg-border">
          <div
            className="h-px bg-primary transition-[width] duration-200"
            style={{ width: `${Math.max(4, progress)}%` }}
          />
        </div>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Загрузка CAD-геометрии... {progress.toFixed(0)}%
        </p>
      </div>
    </div>
  );
}

export function CadViewer({
  glbUrl,
  category,
  color = DEFAULT_PART_COLOR,
  material = PLASTIC,
  zoom,
  modelRotation = [Math.PI / 2, 0, 0],
  onShowPhoto,
}: {
  glbUrl: string | null;
  category: string;
  color?: string;
  material?: PartMaterial;
  /** Индивидуальные лимиты OrbitControls; при наличии модель в реальном мм-масштабе. */
  zoom?: { min: number; max: number };
  /** Коррекция локальных CAD-осей в систему Three.js (Y-up). */
  modelRotation?: readonly [number, number, number];
  onShowPhoto?: () => void;
}) {
  const [wire, setWire] = useState(false);
  const [auto, setAuto] = useState(true);
  const [grabbing, setGrabbing] = useState(false);
  const [lost, setLost] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  // Мобильные браузеры отбирают WebGL-контекст (сворачивание, нехватка памяти) —
  // пересоздаём Canvas автоматически, до 3 попыток.
  const [canvasKey, setCanvasKey] = useState(0);
  useEffect(() => setSupported(supportsWebGL()), []);
  useEffect(() => {
    if (!lost || canvasKey >= 3) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recover = () => {
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(() => {
        setLost(false);
        setCanvasKey((k) => k + 1);
      }, [600, 1500, 3000][canvasKey] ?? 3000);
    };
    recover();
    document.addEventListener("visibilitychange", recover);
    return () => {
      document.removeEventListener("visibilitychange", recover);
      if (timer) clearTimeout(timer);
    };
  }, [lost, canvasKey]);
  // На смартфонах и устройствах с грубым указателем режем нагрузку на GPU.
  const isMobile =
    typeof window !== "undefined" &&
    (window.innerWidth < 768 || window.matchMedia("(any-pointer: coarse)").matches);
  const glRef = useRef<{
    dispose: () => void;
    forceContextLoss?: () => void;
    getContext?: () => (WebGLRenderingContext | WebGL2RenderingContext) | null;
    renderLists?: { dispose: () => void };
  } | null>(null);

  // Без ручной очистки серия открытий карточек выжирает WebGL-контексты на мобильных.
  // Освобождаем контекст асинхронно: drei успевает удалить свои render-target'ы.
  // Проверка isContextLost исключает ошибку "context already lost" в консоли.
  useEffect(
    () => () => {
      const gl = glRef.current;
      glRef.current = null;
      if (!gl) return;
      setTimeout(() => {
        try {
          const ctx = gl.getContext?.();
          if (ctx && ctx.isContextLost()) return;
          // forceContextLoss не вызываем: Canvas сам освобождает контекст при
          // размонтировании, повторный вызов даёт "context already lost".
          gl.renderLists?.dispose();
        } catch {
          /* контекст уже освобождён браузером */
        }
      }, 0);
    },
    [],
  );


  const retry3d = () => {
    setLost(false);
    setCanvasKey((key) => key + 1);
  };

  if (supported === false) {
    return (
      <div className="grid h-64 place-items-center rounded-lg bg-surface p-6 text-center sm:h-72 lg:h-[380px]">
        <div>
          <p className="text-sm font-semibold text-foreground">Браузер не поддерживает WebGL</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Откройте фотографию товара или обновите браузер.</p>
          {onShowPhoto && (
            <button type="button" onClick={onShowPhoto} className="mt-4 min-h-[44px] rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Открыть фото
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative h-64 overflow-hidden rounded-lg ${
        wire ? "bg-background" : "bg-surface"
      } transition-colors duration-300 sm:h-72 lg:h-[380px] ${
        grabbing ? "cursor-grabbing" : "cursor-grab"
      }`}
      // Жест вращения не должен прокручивать страницу под пальцем
      style={{ touchAction: "none", ...(wire ? { backgroundColor: wireStyle(color).bg } : {}) }}
      onPointerUp={() => setGrabbing(false)}
      onPointerLeave={() => setGrabbing(false)}
    >
      {supported && <Canvas
        key={canvasKey}
        camera={{ position: [2.6, 1.8, 2.6], fov: 40 }}
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        shadows={!isMobile}
        gl={{ antialias: !isMobile, powerPreference: isMobile ? "low-power" : "default" }}
        onCreated={({ gl, scene }) => {
          glRef.current = gl as unknown as typeof glRef.current;
          const canvas = (gl as unknown as { domElement: HTMLCanvasElement }).domElement;
          canvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            setLost(true);
          });
          canvas.addEventListener("webglcontextrestored", () => setLost(false));
          void scene;
        }}
        onPointerDown={() => {
          setAuto(false);
          setGrabbing(true);
        }}
        onWheel={() => setAuto(false)}
      >
        {/* Студийный софтбокс вместо жёстких direct-теней */}
        <ambientLight intensity={0.55} />
        <Suspense fallback={null}>
          <Center>
            <Spin enabled={auto}>
              {glbUrl ? (
                <GltfModel
                  url={glbUrl}
                  wire={wire}
                  color={color}
                  material={material}
                  mmScale={!!zoom}
                  rotation={modelRotation}
                />
              ) : (
                <ProxyModel category={category} wire={wire} color={color} material={material} />
              )}
            </Spin>
          </Center>
          {/* Студийный свет обычными источниками: drei-Environment с детьми
              роняет контекст при закрытии карточки (dispose cube render target). */}
          <ambientLight intensity={0.85} />
          <hemisphereLight args={["#ffffff", "#c8ccd2", 0.7]} />
          <directionalLight position={[0, 5, 2]} intensity={2.2} color="#ffffff" />
          <directionalLight position={[-5, 1, 1]} intensity={0.9} color="#f4f6f8" />
          <directionalLight position={[5, 1, -1]} intensity={0.9} color="#eef1f4" />
          {/* Мягкое контактное затенение вместо чёрной проекционной тени */}
          {!isMobile && (
            <ContactShadows
              position={[0, -1.15, 0]}
              opacity={0.32}
              scale={9}
              blur={2.8}
              far={4}
              resolution={512}
            />
          )}
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={zoom?.min ?? 2}
          maxDistance={zoom?.max ?? 7}
          enableDamping
          dampingFactor={0.08}
          // Один палец — вращение, два пальца — pinch-to-zoom
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
      </Canvas>}

      {lost && canvasKey >= 3 && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-surface p-6 text-center">
          <div>
            <p className="text-sm font-semibold text-foreground">3D-просмотр временно остановлен</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Браузер освободил графическую память. Можно запустить просмотр снова.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={retry3d} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
                <RefreshCw className="size-4" /> Повторить 3D
              </button>
              {onShowPhoto && (
                <button type="button" onClick={onShowPhoto} className="min-h-[44px] rounded-lg border border-border px-4 text-sm font-semibold text-foreground">
                  Открыть фото
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <CadLoader />

      <button
        type="button"
        onClick={() => setWire((v) => !v)}
        aria-pressed={wire}
        className={`absolute bottom-3 left-3 flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors ${
          wire
            ? "border-2 border-primary bg-transparent text-primary hover:bg-primary/10"
            : "border-border bg-card/90 text-foreground hover:border-primary hover:text-primary"
        }`}
      >
        {wire ? <Box className="size-3.5" strokeWidth={1.75} /> : <Grid3x3 className="size-3.5" strokeWidth={1.75} />}
        {wire ? "Solid (пластик)" : "Wireframe (сетка)"}
      </button>

      <p className="pointer-events-none absolute right-3 top-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        WebGL · PBR · вращение мышью / свайпом
      </p>
    </div>
  );
}

export default CadViewer;
