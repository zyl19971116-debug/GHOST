'use client';

import * as React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * The on-chain node globe.
 *
 * Everything is generated procedurally with a seeded PRNG, so the geometry is
 * identical on every load and between server and client. No textures, no model
 * files, no image assets — just points, arcs and a wireframe shell.
 *
 * Performance notes: geometry counts scale with a quality tier derived from
 * viewport width and `prefers-reduced-motion`; the render loop is stopped
 * entirely when motion is reduced or the tab is hidden.
 */

interface GlobeConfig {
  nodeCount: number;
  highlightCount: number;
  arcCount: number;
  shellSegments: number;
  dpr: number;
  animate: boolean;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Fibonacci sphere — even point distribution without clustering at the poles. */
function fibonacciSphere(count: number, radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points.push(new THREE.Vector3(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius));
  }
  return points;
}

function Globe({ config }: { config: GlobeConfig }) {
  const groupRef = React.useRef<THREE.Group>(null);
  const shellRef = React.useRef<THREE.LineSegments>(null);
  const { pointer } = useThree();
  const radius = 1.72;

  const data = React.useMemo(() => {
    const rand = rng(0x9f3a71);
    const nodes = fibonacciSphere(config.nodeCount, radius);
    const highlights = fibonacciSphere(config.highlightCount, radius * 1.008).map((p, i) => ({
      position: p,
      scale: 0.012 + rand() * 0.02,
      phase: rand() * Math.PI * 2,
      hue: i % 5 === 0 ? 1 : 0,
    }));

    // Arcs between nearby highlights, lifted above the surface.
    const arcs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < config.arcCount; i++) {
      const a = highlights[Math.floor(rand() * highlights.length)];
      const b = highlights[Math.floor(rand() * highlights.length)];
      if (!a || !b || a === b) continue;
      const mid = a.position.clone().add(b.position).multiplyScalar(0.5);
      const lift = 1 + a.position.distanceTo(b.position) * 0.34;
      mid.normalize().multiplyScalar(radius * lift);
      const curve = new THREE.QuadraticBezierCurve3(a.position, mid, b.position);
      const pts = curve.getPoints(28);
      arcs.push(new THREE.BufferGeometry().setFromPoints(pts));
    }

    // Wireframe shell built by hand so no external geometry imports are needed.
    const shellPts: number[] = [];
    const rings = 14;
    const segs = config.shellSegments;
    for (let ri = 1; ri < rings; ri++) {
      const phi = (ri / rings) * Math.PI;
      const y = Math.cos(phi) * radius;
      const r = Math.sin(phi) * radius;
      for (let si = 0; si < segs; si++) {
        const t0 = (si / segs) * Math.PI * 2;
        const t1 = ((si + 1) / segs) * Math.PI * 2;
        shellPts.push(Math.cos(t0) * r, y, Math.sin(t0) * r, Math.cos(t1) * r, y, Math.sin(t1) * r);
      }
    }
    for (let si = 0; si < segs; si += 2) {
      const theta = (si / segs) * Math.PI * 2;
      for (let ri = 1; ri < rings; ri++) {
        const p0 = (ri / rings) * Math.PI;
        const p1 = ((ri + 1) / rings) * Math.PI;
        shellPts.push(
          Math.sin(p0) * Math.cos(theta) * radius, Math.cos(p0) * radius, Math.sin(p0) * Math.sin(theta) * radius,
          Math.sin(p1) * Math.cos(theta) * radius, Math.cos(p1) * radius, Math.sin(p1) * Math.sin(theta) * radius,
        );
      }
    }
    const shell = new THREE.BufferGeometry();
    shell.setAttribute('position', new THREE.Float32BufferAttribute(shellPts, 3));

    return { nodes, highlights, arcs, shell };
  }, [config.nodeCount, config.highlightCount, config.arcCount, config.shellSegments]);

  const nodeGeo = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(data.nodes.length * 3);
    data.nodes.forEach((p, i) => {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    });
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [data.nodes]);

  const instancedRef = React.useRef<THREE.InstancedMesh>(null);
  const dummy = React.useMemo(() => new THREE.Object3D(), []);
  const elapsed = React.useRef(0);

  useFrame((state, delta) => {
    if (!config.animate) return;
    elapsed.current += delta;
    const t = elapsed.current;

    if (groupRef.current) {
      // Slow constant spin plus a gentle pointer parallax.
      groupRef.current.rotation.y += delta * 0.085;
      const targetX = pointer.y * 0.16;
      const targetZ = -pointer.x * 0.1;
      groupRef.current.rotation.x += (targetX - groupRef.current.rotation.x) * 0.035;
      groupRef.current.rotation.z += (targetZ - groupRef.current.rotation.z) * 0.035;
    }

    if (instancedRef.current) {
      data.highlights.forEach((h, i) => {
        const pulse = 1 + Math.sin(t * 1.7 + h.phase) * 0.5;
        dummy.position.copy(h.position);
        dummy.scale.setScalar(h.scale * pulse * 3.4);
        dummy.updateMatrix();
        instancedRef.current!.setMatrixAt(i, dummy.matrix);
      });
      instancedRef.current.instanceMatrix.needsUpdate = true;
      const mat = instancedRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.72 + Math.sin(t * 1.1) * 0.18;
    }

    if (shellRef.current) {
      const m = shellRef.current.material as THREE.LineBasicMaterial;
      m.opacity = 0.16 + Math.sin(t * 0.6) * 0.05;
    }
    void state;
  });

  return (
    <group ref={groupRef}>
      {/* Unlit node cloud */}
      <points geometry={nodeGeo}>
        <pointsMaterial
          size={0.021}
          color="#CFE1FF"
          sizeAttenuation
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Wireframe shell */}
      <lineSegments ref={shellRef} geometry={data.shell}>
        <lineBasicMaterial color="#8DBEFF" transparent opacity={0.18} depthWrite={false} />
      </lineSegments>

      {/* Lit nodes */}
      <instancedMesh ref={instancedRef} args={[undefined, undefined, data.highlights.length]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color="#8DBEFF" transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>

      {/* Connection arcs */}
      {data.arcs.map((g, i) => (
        <ArcLine key={i} geometry={g} animate={config.animate} index={i} />
      ))}

      {/* Outer orbital rings */}
      <OrbitRing radius={radius * 1.42} tilt={0.42} speed={0.14} animate={config.animate} color="#8DBEFF" />
      <OrbitRing radius={radius * 1.66} tilt={-0.62} speed={-0.09} animate={config.animate} color="#827CFF" />
    </group>
  );
}

function ArcLine({ geometry, animate, index }: { geometry: THREE.BufferGeometry; animate: boolean; index: number }) {
  const ref = React.useRef<THREE.Line>(null);
  const object = React.useMemo(() => {
    const mat = new THREE.LineBasicMaterial({
      color: index % 3 === 0 ? '#827CFF' : '#8DBEFF',
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Line(geometry, mat);
  }, [geometry, index]);

  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    (object.material as THREE.LineBasicMaterial).opacity = 0.16 + Math.abs(Math.sin(t * 0.7 + index)) * 0.42;
  });

  return <primitive ref={ref} object={object} />;
}

function OrbitRing({
  radius,
  tilt,
  speed,
  animate,
  color,
}: {
  radius: number;
  tilt: number;
  speed: number;
  animate: boolean;
  color: string;
}) {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!animate || !ref.current) return;
    ref.current.rotation.z += delta * speed;
  });
  return (
    <mesh ref={ref} rotation={[tilt, 0, 0]}>
      <torusGeometry args={[radius, 0.0045, 6, 160]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/** Particle halo drifting around the globe. */
function OrbitalDust({ count, animate }: { count: number; animate: boolean }) {
  const geo = React.useMemo(() => {
    const rand = rng(0x51ce77);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 2.2 + rand() * 1.9;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.cos(phi) * 0.62;
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [count]);

  const ref = React.useRef<THREE.Points>(null);
  useFrame((_, delta) => {
    if (!animate || !ref.current) return;
    ref.current.rotation.y -= delta * 0.045;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.026}
        color="#9FC8FF"
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export function GhostGlobeCanvas({ className }: { className?: string }) {
  const [config, setConfig] = React.useState<GlobeConfig>({
    nodeCount: 900,
    highlightCount: 64,
    arcCount: 22,
    shellSegments: 40,
    dpr: 1.6,
    animate: true,
  });

  React.useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const w = window.innerWidth;
    const mobile = w < 768;
    const tablet = w < 1280;
    setConfig({
      nodeCount: mobile ? 420 : tablet ? 700 : 1000,
      highlightCount: mobile ? 34 : tablet ? 52 : 72,
      arcCount: mobile ? 12 : tablet ? 18 : 26,
      shellSegments: mobile ? 22 : tablet ? 32 : 44,
      dpr: Math.min(window.devicePixelRatio || 1, mobile ? 1.4 : 1.75),
      animate: !reduce,
    });
  }, []);

  // Freeze the loop when the tab is hidden — offscreen rendering is wasted work.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <div className={className} aria-hidden="true">
      <Canvas
        dpr={config.dpr}
        frameloop={config.animate && visible ? 'always' : 'demand'}
        camera={{ position: [0, 0.35, 5.1], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <Globe config={config} />
        <OrbitalDust count={config.animate ? 320 : 90} animate={config.animate} />
      </Canvas>
    </div>
  );
}
