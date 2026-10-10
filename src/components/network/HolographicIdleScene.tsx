'use client';
import * as React from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const NODE_COUNT = 46;

function DecorativeNetwork({ reduced }: { reduced: boolean }) {
  const rig = React.useRef<THREE.Group>(null);
  const orbitRig = React.useRef<THREE.Group>(null);
  const core = React.useRef<THREE.Mesh>(null);
  const scan = React.useRef<THREE.Mesh>(null);
  const instances = React.useRef<THREE.InstancedMesh>(null);
  const nodes = React.useMemo(() => Array.from({ length: NODE_COUNT }, (_, i) => {
    const angle = i * 2.399963;
    const z = 1 - (2 * (i + 0.5)) / NODE_COUNT;
    const radius = 1.15 + (i % 5) * 0.16;
    const ring = Math.sqrt(Math.max(0, 1 - z * z));
    return new THREE.Vector3(Math.cos(angle) * ring * radius, z * 1.38, Math.sin(angle) * ring * radius);
  }), []);
  const connections = React.useMemo(() => {
    const values: number[] = [];
    nodes.forEach((node, i) => {
      nodes.map((other, index) => ({ index, distance: node.distanceTo(other) }))
        .filter(({ index }) => index !== i).sort((a, b) => a.distance - b.distance)
        .slice(0, i % 4 === 0 ? 3 : 2).forEach(({ index }) => {
          if (index < i) return;
          values.push(node.x, node.y, node.z, nodes[index].x, nodes[index].y, nodes[index].z);
        });
    });
    return new Float32Array(values);
  }, [nodes]);
  const dust = React.useMemo(() => {
    const data = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i += 1) {
      const a = i * 2.399963; const z = 1 - (2 * i) / 239; const radius = 2.35 + (i % 11) * 0.13;
      const ring = Math.sqrt(Math.max(0, 1 - z * z));
      data[i * 3] = Math.cos(a) * ring * radius; data[i * 3 + 1] = z * radius; data[i * 3 + 2] = Math.sin(a) * ring * radius;
    }
    return data;
  }, []);

  React.useLayoutEffect(() => {
    if (!instances.current) return;
    const helper = new THREE.Object3D();
    nodes.forEach((position, i) => {
      const scale = i % 13 === 0 ? 0.15 : i % 7 === 0 ? 0.1 : 0.055 + (i % 3) * 0.012;
      helper.position.copy(position); helper.scale.setScalar(scale); helper.updateMatrix();
      instances.current!.setMatrixAt(i, helper.matrix);
      instances.current!.setColorAt(i, new THREE.Color(i % 11 === 0 ? '#A889FF' : i % 5 === 0 ? '#DCEBFF' : '#8EC5FF'));
    });
    instances.current.instanceMatrix.needsUpdate = true;
    if (instances.current.instanceColor) instances.current.instanceColor.needsUpdate = true;
  }, [nodes]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (!reduced) {
      if (rig.current) { rig.current.rotation.y += delta * 0.055; rig.current.rotation.x = Math.sin(t * 0.16) * 0.07; }
      if (orbitRig.current) orbitRig.current.rotation.z -= delta * 0.075;
    }
    if (core.current) core.current.scale.setScalar(0.9 + Math.sin(t * 1.45) * 0.1);
    if (scan.current) {
      const pulse = 0.8 + ((t * 0.32) % 1) * 1.25;
      scan.current.scale.setScalar(pulse);
      (scan.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.27 - (pulse - 0.8) * 0.18);
    }
  });

  return <group ref={rig} scale={1.08}>
    <mesh><sphereGeometry args={[1.75, 36, 24]} /><meshBasicMaterial color="#4D83D9" wireframe transparent opacity={0.115} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
    <mesh><sphereGeometry args={[1.34, 30, 20]} /><meshBasicMaterial color="#8EC5FF" wireframe transparent opacity={0.065} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
    <lineSegments><bufferGeometry><bufferAttribute attach="attributes-position" args={[connections, 3]} /></bufferGeometry><lineBasicMaterial color="#6BAAFF" transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} /></lineSegments>
    <instancedMesh ref={instances} args={[undefined, undefined, NODE_COUNT]}><icosahedronGeometry args={[1, 1]} /><meshBasicMaterial vertexColors transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} /></instancedMesh>
    <group ref={orbitRig}>{[
      [2.05, .012, Math.PI / 2.6, .15, .2], [2.2, .009, .36, -.45, Math.PI / 2], [1.92, .008, -.52, .2, Math.PI / 2.7],
      [2.38, .007, Math.PI / 2, .65, -.25], [1.68, .006, -.2, Math.PI / 2, .48],
    ].map(([radius, tube, x, y, z], i) => <mesh key={i} rotation={[x, y, z]}><torusGeometry args={[radius, tube, 7, 110]} /><meshBasicMaterial color={i === 2 ? '#DCEBFF' : '#5C9FFF'} transparent opacity={i === 2 ? .3 : .2} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>)}</group>
    <mesh ref={scan} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.18, .018, 8, 100]} /><meshBasicMaterial color="#DCEBFF" transparent opacity={.2} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
    <mesh ref={core}><icosahedronGeometry args={[.28, 2]} /><meshBasicMaterial color="#DCEBFF" transparent opacity={.98} blending={THREE.AdditiveBlending} /></mesh>
    <mesh><sphereGeometry args={[.58, 24, 18]} /><meshBasicMaterial color="#8EC5FF" transparent opacity={.1} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
    <mesh><sphereGeometry args={[.9, 24, 18]} /><meshBasicMaterial color="#4D83D9" transparent opacity={.035} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[dust, 3]} /></bufferGeometry><pointsMaterial color="#8EC5FF" size={.025} transparent opacity={.42} depthWrite={false} blending={THREE.AdditiveBlending} /></points>
  </group>;
}

export function HolographicIdleScene() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => { const query = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(query.matches); update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []);
  return <div className="absolute inset-0" aria-hidden="true">
    <div className="network-holo-fallback"><i /><i /><i /><i /><span />{Array.from({ length: 14 }, (_, i) => <b key={i} />)}</div>
    <Canvas dpr={[1, 1.45]} camera={{ position: [0, 0, 7.1], fov: 44 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
      <fog attach="fog" args={['#030711', 6.5, 12]} /><DecorativeNetwork reduced={reduced} />
    </Canvas>
  </div>;
}
