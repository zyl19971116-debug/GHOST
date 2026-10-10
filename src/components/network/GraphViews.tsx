'use client';

import * as React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { cn } from '@/lib/utils';
import { layoutGraph, type LaidOutNode } from '@/lib/graph/layout';
import type { RelationshipEdge, RelationshipNode } from '@/lib/types';

export interface GraphViewProps {
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
  subject: string | null;
  selected: string | null;
  onSelect: (address: string | null) => void;
  /** Addresses matching the current wallet filter. Empty set = no filter. */
  highlighted: Set<string>;
  className?: string;
}

const NODE_COLOR = {
  subject: '#F2F6FF',
  contract: '#827CFF',
  counterparty: '#8DBEFF',
  token: '#8DBEFF',
  unknown: '#8A9AB8',
} as const;

function nodeRadius(n: LaidOutNode): number {
  const base = n.kind === 'subject' ? 13 : 5;
  return base + Math.sqrt(Math.max(0, n.txCount)) * 1.9;
}

// ===========================================================================
// 2D canvas view
// ===========================================================================
export function GraphView2D({ nodes, edges, subject, selected, onSelect, highlighted, className }: GraphViewProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 800, height: 560 });
  const [transform, setTransform] = React.useState({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = React.useState<string | null>(null);
  const dragRef = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const laid = React.useMemo(
    () => layoutGraph(nodes, edges, { width: size.width, height: size.height }),
    [nodes, edges, size.width, size.height],
  );
  const byId = React.useMemo(() => new Map(laid.map((n) => [n.address, n])), [laid]);

  // Draw
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    // Edges
    for (const e of edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      const connected = !selected || e.source === selected || e.target === selected;
      const dim = !connected || (highlighted.size > 0 && !(highlighted.has(e.source) || highlighted.has(e.target)));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = dim
        ? 'rgba(141,190,255,0.06)'
        : selected
          ? 'rgba(183,218,255,0.82)'
        : e.direction === 'both'
          ? 'rgba(130,124,255,0.5)'
          : 'rgba(141,190,255,0.34)';
      ctx.lineWidth = ((selected && connected ? 1.25 : 0.6) + Math.min(e.txCount, 10) * 0.16) / transform.k ** 0.35;
      ctx.stroke();
    }

    // Nodes
    for (const n of laid) {
      const r = nodeRadius(n);
      const dim = highlighted.size > 0 && !highlighted.has(n.address);
      const color = NODE_COLOR[n.kind] ?? NODE_COLOR.unknown;
      const isSelected = selected === n.address;
      const isHovered = hovered === n.address;

      ctx.globalAlpha = dim ? 0.16 : 1;

      if (n.kind === 'subject' || isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 10, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 12);
        g.addColorStop(0, 'rgba(141,190,255,0.36)');
        g.addColorStop(1, 'rgba(141,190,255,0)');
        ctx.fillStyle = g;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.kind === 'subject' ? 'rgba(20,32,56,0.95)' : 'rgba(6,12,24,0.9)';
      ctx.fill();
      ctx.strokeStyle = isSelected || isHovered ? '#FFFFFF' : color;
      ctx.lineWidth = (isSelected ? 2.4 : n.kind === 'subject' ? 2.2 : 1.3) / transform.k ** 0.3;
      ctx.stroke();

      // Core dot scaled by activity
      ctx.beginPath();
      ctx.arc(n.x, n.y, Math.max(1.6, r * 0.34), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (n.depth === 2) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(130,124,255,0.5)';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Labels for the subject and the selected node
      if (n.kind === 'subject' || isSelected) {
        ctx.globalAlpha = dim ? 0.3 : 1;
        ctx.font = `600 ${11 / transform.k ** 0.25}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#F2F6FF';
        ctx.textAlign = 'center';
        const label = n.kind === 'subject' ? 'SUBJECT' : `${n.address.slice(0, 6)}…${n.address.slice(-4)}`;
        ctx.fillText(label, n.x, n.y + r + 14 / transform.k ** 0.25);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    // Centre the layout on first paint
    if (transform.x === 0 && transform.y === 0 && transform.k === 1 && laid.length > 0) {
      setTransform({ x: 0, y: 0, k: 1 });
    }
  }, [laid, edges, byId, transform, selected, hovered, highlighted, size]);

  const hitTest = React.useCallback(
    (clientX: number, clientY: number): string | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const px = (clientX - rect.left - transform.x) / transform.k;
      const py = (clientY - rect.top - transform.y) / transform.k;
      let best: string | null = null;
      let bestDist = Infinity;
      for (const n of laid) {
        const dx = n.x - px;
        const dy = n.y - py;
        const d = dx * dx + dy * dy;
        const r = nodeRadius(n) + 6;
        if (d < r * r && d < bestDist) {
          bestDist = d;
          best = n.address;
        }
      }
      return best;
    },
    [laid, transform],
  );

  return (
    <div
      ref={wrapRef}
      className={cn('relative h-full w-full overflow-hidden bg-[rgba(3,6,13,0.55)]', className)}
      style={{ cursor: dragRef.current ? 'grabbing' : hovered ? 'pointer' : 'grab', touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size.width, height: size.height }}
        onWheel={(e) => {
          e.preventDefault();
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const factor = e.deltaY < 0 ? 1.12 : 0.893;
          const k = Math.min(4.5, Math.max(0.25, transform.k * factor));
          setTransform((t) => ({
            k,
            x: mx - (mx - t.x) * (k / t.k),
            y: my - (my - t.y) * (k / t.k),
          }));
        }}
        onPointerDown={(e) => {
          const hit = hitTest(e.clientX, e.clientY);
          if (hit) {
            onSelect(hit === selected ? null : hit);
            return;
          }
          dragRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (dragRef.current) {
            setTransform((t) => ({
              ...t,
              x: dragRef.current!.tx + (e.clientX - dragRef.current!.x),
              y: dragRef.current!.ty + (e.clientY - dragRef.current!.y),
            }));
            return;
          }
          const hit = hitTest(e.clientX, e.clientY);
          setHovered(hit);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerLeave={() => {
          dragRef.current = null;
          setHovered(null);
        }}
      />

      {/* Zoom controls */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        {[
          { label: '+', fn: () => setTransform((t) => ({ ...t, k: Math.min(4.5, t.k * 1.2) })) },
          { label: '−', fn: () => setTransform((t) => ({ ...t, k: Math.max(0.25, t.k / 1.2) })) },
          { label: '⤢', fn: () => setTransform({ x: 0, y: 0, k: 1 }) },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.fn}
            className="focus-ring flex h-7 w-7 items-center justify-center border border-[rgba(141,190,255,0.25)] bg-[rgba(3,6,13,0.8)] font-mono text-xs text-ice transition-colors hover:border-[rgba(141,190,255,0.6)] hover:bg-[rgba(141,190,255,0.14)]"
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 font-mono text-[0.5625rem] uppercase tracking-wide2 text-muted">
        ZOOM {(transform.k * 100).toFixed(0)}% · SCROLL TO ZOOM · DRAG TO PAN · CLICK A NODE
      </div>
    </div>
  );
}

// ===========================================================================
// 3D view
// ===========================================================================
type EdgeObject = {
  key: string;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
};

function Scene3D({ laid, edges, selected, onSelect, highlighted, autoRotate, rotation }: {
  laid: LaidOutNode[];
  edges: RelationshipEdge[];
  selected: string | null;
  onSelect: (a: string | null) => void;
  highlighted: Set<string>;
  autoRotate: boolean;
  rotation: { x: number; y: number };
}) {
  const group = React.useRef<THREE.Group>(null);
  const byId = React.useMemo(() => new Map(laid.map((n) => [n.address, n])), [laid]);

  const edgeObjects = React.useMemo<EdgeObject[]>(() => {
    const out: EdgeObject[] = [];
    edges.forEach((e, i) => {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) return;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3((a.x - 400) / 90, -(a.y - 280) / 90, a.z / 110),
        new THREE.Vector3((b.x - 400) / 90, -(b.y - 280) / 90, b.z / 110),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: e.direction === 'both' ? 0x827cff : 0x8dbeff,
        transparent: true,
        opacity: selected
          ? (e.source === selected || e.target === selected ? 0.82 : 0.045)
          : 0.22 + Math.min(e.confidence, 0.8) * 0.5,
        depthWrite: false,
      });
      out.push({ key: `${e.id}-${i}`, line: new THREE.Line(geo, mat) });
    });
    return out;
  }, [edges, byId, selected]);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, rotation.x, 0.12);
    if (autoRotate) group.current.rotation.y += delta * 0.075;
    else group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, rotation.y, 0.12);
    const focus = selected ? byId.get(selected) : null;
    const tx = focus ? -(focus.x - 400) / 90 : 0;
    const ty = focus ? (focus.y - 280) / 90 : 0;
    const tz = focus ? -focus.z / 110 : 0;
    group.current.position.lerp(new THREE.Vector3(tx, ty, tz), 0.08);
  });

  return (
    <group ref={group}>
      {edgeObjects.map((e) => (
        <primitive key={e.key} object={e.line} />
      ))}

      {laid.map((n) => {
        const dim = highlighted.size > 0 && !highlighted.has(n.address);
        const r = (nodeRadius(n) / 90) * 1.5;
        const color = NODE_COLOR[n.kind] ?? NODE_COLOR.unknown;
        const opacity = dim ? 0.16 : n.depth === 2 ? 0.55 : n.kind === 'subject' ? 0.98 : 0.82;
        const position: [number, number, number] = [(n.x - 400) / 90, -(n.y - 280) / 90, n.z / 110];
        return (
          <group key={n.address} position={position}>
          <mesh
            key={n.address}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelect(n.address === selected ? null : n.address);
            }}
            onDoubleClick={(ev) => {
              ev.stopPropagation();
              onSelect(n.address);
            }}
            onPointerOver={(ev) => {
              ev.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
            }}
          >
            {n.kind === 'contract' ? <octahedronGeometry args={[r * 1.15, 1]} /> : <icosahedronGeometry args={[r, n.kind === 'subject' ? 3 : 1]} />}
            <meshBasicMaterial
              color={selected === n.address ? 0xffffff : color}
              transparent
              opacity={opacity}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh scale={1.75}>
            {n.kind === 'contract' ? <octahedronGeometry args={[r * 1.15, 1]} /> : <icosahedronGeometry args={[r, 1]} />}
            <meshBasicMaterial color={color} wireframe transparent opacity={dim ? 0.025 : selected === n.address ? 0.2 : 0.07} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          {n.kind === 'subject' && <>
            <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r * 1.7, 0.012, 6, 64]} /><meshBasicMaterial color="#DCEBFF" transparent opacity={0.58} blending={THREE.AdditiveBlending} /></mesh>
            <mesh rotation={[0.35, 0.1, Math.PI / 2]}><torusGeometry args={[r * 2.1, 0.008, 6, 64]} /><meshBasicMaterial color="#6BAAFF" transparent opacity={0.34} blending={THREE.AdditiveBlending} /></mesh>
          </>}
          </group>
        );
      })}

      {/* Halo on the subject */}
      {laid
        .filter((n) => n.kind === 'subject')
        .map((n) => (
          <mesh key="halo" position={[(n.x - 400) / 90, -(n.y - 280) / 90, n.z / 110]}>
            <sphereGeometry args={[0.62, 20, 20]} />
            <meshBasicMaterial color={0x8dbeff} transparent opacity={0.13} depthWrite={false} />
          </mesh>
        ))}
    </group>
  );
}

function CameraRig({ distance }: { distance: number }) {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, distance, 0.12);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function GraphView3D({ nodes, edges, subject, selected, onSelect, highlighted, className }: GraphViewProps) {
  const [size, setSize] = React.useState({ width: 800, height: 560 });
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const laid = React.useMemo(
    () => layoutGraph(nodes, edges, { width: 800, height: 560, depth: 300 }),
    [nodes, edges],
  );

  const [autoRotate, setAutoRotate] = React.useState(true);
  const [rotation, setRotation] = React.useState({ x: 0, y: 0 });
  const [distance, setDistance] = React.useState(7.2);
  const drag = React.useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const resetCamera = () => { setRotation({ x: 0, y: 0 }); setDistance(7.2); onSelect(null); };

  React.useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setAutoRotate(false);
  }, []);

  return (
    <div ref={wrapRef} className={cn('relative h-full w-full overflow-hidden bg-[rgba(3,6,13,0.55)]', className)}
      style={{ touchAction: 'none', cursor: drag.current ? 'grabbing' : 'grab' }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, rx: rotation.x, ry: rotation.y }; setAutoRotate(false); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (!drag.current) return; setRotation({ x: Math.max(-1.15, Math.min(1.15, drag.current.rx + (e.clientY - drag.current.y) * 0.006)), y: drag.current.ry + (e.clientX - drag.current.x) * 0.006 }); }}
      onPointerUp={()=>{ drag.current = null; }} onPointerLeave={()=>{ drag.current = null; }}
      onWheel={(e)=>{ e.preventDefault(); setDistance((d)=>Math.max(3.8,Math.min(12,d+e.deltaY*0.008))); }}>
      <Canvas
        dpr={[1, 1.6]}
        camera={{ position: [0, 0, 7.2], fov: 46 }}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => onSelect(null)}
      >
        <CameraRig distance={distance} />
        <ambientLight intensity={0.85} />
        <Scene3D
          laid={laid}
          edges={edges}
          selected={selected}
          onSelect={onSelect}
          highlighted={highlighted}
          autoRotate={autoRotate}
          rotation={rotation}
        />
      </Canvas>

      <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setAutoRotate((v) => !v)}
          className="focus-ring border border-[rgba(141,190,255,0.25)] bg-[rgba(3,6,13,0.8)] px-2.5 py-1.5 font-mono text-[0.5625rem] uppercase tracking-wide2 text-ice transition-colors hover:border-[rgba(141,190,255,0.6)]"
        >
          ROTATION {autoRotate ? 'ON' : 'OFF'}
        </button>
        <button type="button" onClick={resetCamera} className="focus-ring border border-[rgba(141,190,255,0.25)] bg-[rgba(3,6,13,0.8)] px-2.5 py-1.5 font-mono text-[0.5625rem] uppercase tracking-wide2 text-ice transition-colors hover:border-[rgba(141,190,255,0.6)]">RESET CAMERA</button>
        <button type="button" onClick={()=>setDistance(8.4)} className="focus-ring border border-[rgba(141,190,255,0.25)] bg-[rgba(3,6,13,0.8)] px-2.5 py-1.5 font-mono text-[0.5625rem] uppercase tracking-wide2 text-ice transition-colors hover:border-[rgba(141,190,255,0.6)]">FIT GRAPH</button>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 font-mono text-[0.5625rem] uppercase tracking-wide2 text-muted">
        DRAG TO ORBIT · SCROLL TO ZOOM · CLICK A NODE
      </div>
    </div>
  );
}
