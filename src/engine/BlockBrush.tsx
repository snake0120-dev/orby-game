import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { VOXEL } from '../theme';
import { lookupBlock, UNKNOWN_COLOR } from '../game/blocks';
import { useBrush } from '../game/brushStore';
import { useGame } from '../game/store';
import { pickVoxel, type VoxelHit } from './pickVoxel';
import { cellAt, type VoxelMap } from './voxelMap';

/**
 * **마우스로 블록을 놓고 지운다** — 마인크래프트와 같은 손짓.
 *
 *   왼쪽 누르기      가리킨 면에 블록을 놓는다 (끌면 이어서 놓는다)
 *   오른쪽 / Alt     반대로 — 그 블록을 지운다
 *   가운데 누르기    가리킨 블록을 붓에 담는다 (스포이드)
 *
 * 놓은 자리는 `brushStore` 에 쌓이고, 구역 페이지가 그걸 바탕·개체와 함께
 * 다시 합쳐 맵을 짓는다. 즉 **여기서는 맵을 직접 고치지 않는다** — 칸 하나를
 * 고쳐도 걷는 칸과 그늘이 다시 계산돼야 하니, 합치는 자리를 한 곳에 둔다.
 *
 * 다시 합치는 데 한 호흡이 걸려서, 그동안 놓은 블록을 **미리 띄워 둔다**
 * (아래 `pending`). 누른 즉시 블록이 보이고, 진짜 맵이 도착하면 조용히 사라진다.
 */
export function BlockBrush() {
  const on = useBrush((s) => s.on);
  const map = useGame((s) => s.map);
  if (!on || !map) return null;
  return <Brush map={map} />;
}

/**
 * 아직 맵에 안 들어온 블록들을 **한 번에** 그린다.
 *
 * 칸마다 메시를 따로 두면 삼백 칸이 삼백 번의 그리기 명령이 된다 — 끌면서
 * 쌓는 동안 그게 그대로 멈칫거림이 됐다. 같은 정육면체를 자리만 바꿔 찍는
 * 것이므로 instancing 으로 한 번에 보낸다.
 */
function Pending({ list }: { list: { key: string; at: [number, number, number]; color: string }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    list.forEach((p, i) => {
      o.position.set(p.at[0], p.at[1], p.at[2]);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(p.color));
    });
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [list]);

  // 자리를 미리 잡아 둔다 — 개수가 바뀔 때마다 메시를 다시 만들지 않으려고
  return (
    <instancedMesh ref={ref} args={[BOX, undefined, PREVIEW_MAX]} frustumCulled={false}>
      <meshStandardMaterial roughness={0.92} />
    </instancedMesh>
  );
}

/** 강조 테두리와 미리보기가 쓰는 정육면체 — 한 번만 만든다 */
const BOX = new THREE.BoxGeometry(VOXEL, VOXEL, VOXEL);
const EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(VOXEL * 1.04, VOXEL * 1.04, VOXEL * 1.04));

/** 미리 띄울 블록 수 상한 — 한 번에 이만큼 넘게 밀릴 일은 없다 */
const PREVIEW_MAX = 300;

const world = (c: [number, number, number]): [number, number, number] => [
  c[0] * VOXEL, c[1] * VOXEL, c[2] * VOXEL,
];

function Brush({ map }: { map: VoxelMap }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const [hover, setHover] = useState<VoxelHit | null>(null);
  const block = useBrush((s) => s.block);
  const mode = useBrush((s) => s.mode);
  const blocks = useBrush((s) => s.blocks);

  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const inv = new THREE.Matrix4();
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();

    /** 화면의 한 점 → 맞은 블록과 면 */
    const look = (ev: MouseEvent): VoxelHit | null => {
      const g = group.current;
      if (!g) return null;
      const r = el.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      /* 구조물은 아주 느리게 떠 있다(`Float`). 그 움직임을 빼고 봐야
         가리킨 칸이 반 칸씩 어긋나지 않는다. */
      inv.copy(g.matrixWorld).invert();
      o.copy(ray.ray.origin).applyMatrix4(inv);
      d.copy(ray.ray.direction).transformDirection(inv);
      return pickVoxel(map, o, d);
    };

    /* 지금 끌고 있는 손짓과 마지막으로 손댄 칸. 같은 칸을 지나갈 때
       다시 놓지 않게 기억한다 (되돌리기가 한 칸에 열 걸음이 되는 걸 막는다). */
    let drag: 'place' | 'erase' | null = null;
    let lastKey = '';

    /**
     * 맵 칸을 **그 자리에서** 같이 고친다.
     *
     * 진짜 맵은 한 호흡 뒤에 다시 합쳐져 온다. 그동안 조준선이 옛 지형을 보면,
     * 블록을 빠르게 쌓을 때 두 번째 블록이 첫 번째 안으로 들어간다.
     * 팔레트에 없는 블록이면 그냥 넘긴다 — 다시 합칠 때 어차피 들어온다.
     */
    const poke = (x: number, y: number, z: number, name: string | null) => {
      const v = name === null ? -1 : map.palette.indexOf(name);
      if (name !== null && v < 0) return;
      map.cells[x * map.h * map.d + y * map.d + z] = v;
    };

    const act = (hit: VoxelHit, how: 'place' | 'erase') => {
      const b = useBrush.getState();
      if (how === 'place') {
        const x = hit.cell[0] + hit.face[0];
        const y = hit.cell[1] + hit.face[1];
        const z = hit.cell[2] + hit.face[2];
        if (x < 0 || y < 0 || z < 0 || x >= map.w || y >= map.h || z >= map.d) return;
        const key = `${x},${y},${z}`;
        if (key === lastKey) return;
        lastKey = key;
        b.place(x, y, z);
        poke(x, y, z, b.block);
      } else {
        const [x, y, z] = hit.cell;
        const key = `${x},${y},${z}`;
        if (key === lastKey) return;
        lastKey = key;
        b.erase(x, y, z);
        poke(x, y, z, null);
      }
    };

    const onDown = (ev: PointerEvent) => {
      const hit = look(ev);
      setHover(hit);
      if (!hit) return;
      ev.preventDefault();

      // 가운데 단추 = 스포이드. 가리킨 블록을 붓에 담는다.
      if (ev.button === 1) {
        const v = cellAt(map, hit.cell[0], hit.cell[1], hit.cell[2]);
        if (v >= 0) useBrush.getState().set({ block: map.palette[v] });
        return;
      }

      // 오른쪽 단추와 Alt 는 **반대 손짓**이다 (지우는 중이면 놓는다)
      const flip = ev.button === 2 || ev.altKey;
      const base = useBrush.getState().mode;
      const how: 'place' | 'erase' = flip
        ? base === 'place' ? 'erase' : 'place'
        : base;
      drag = how;
      lastKey = '';
      // 끄는 동안에는 맵을 다시 짓지 않는다 — 손을 뗄 때 한 번만
      useBrush.getState().set({ painting: true });
      act(hit, how);
    };

    const onMove = (ev: PointerEvent) => {
      const hit = look(ev);
      setHover(hit);
      if (drag && hit) act(hit, drag);
    };
    const stop = () => {
      drag = null;
      lastKey = '';
      if (useBrush.getState().painting) useBrush.getState().set({ painting: false });
    };
    const leave = () => { stop(); setHover(null); };
    const menu = (ev: MouseEvent) => ev.preventDefault();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('contextmenu', menu);
    // 캔버스 밖에서 손을 떼도 끌기가 끝나야 한다
    window.addEventListener('pointerup', stop);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('contextmenu', menu);
      window.removeEventListener('pointerup', stop);
    };
  }, [gl, camera, map]);

  /** 아직 맵에 안 들어온 블록들 — 다시 합쳐질 때까지 대신 보여준다 */
  const pending = useMemo(() => {
    const out: { key: string; at: [number, number, number]; color: string }[] = [];
    for (const [key, name] of Object.entries(blocks)) {
      if (!name || out.length >= PREVIEW_MAX) continue;
      const [x, y, z] = key.split(',').map(Number);
      const v = cellAt(map, x, y, z);
      if (v >= 0 && map.palette[v] === name) continue;   // 이미 들어왔다
      out.push({ key, at: world([x, y, z]), color: lookupBlock(name)?.color ?? UNKNOWN_COLOR });
    }
    return out;
  }, [blocks, map]);

  const ghost: [number, number, number] | null =
    hover && mode === 'place'
      ? [hover.cell[0] + hover.face[0], hover.cell[1] + hover.face[1], hover.cell[2] + hover.face[2]]
      : null;
  const color = lookupBlock(block)?.color ?? UNKNOWN_COLOR;

  return (
    <group ref={group}>
      {hover && (
        <lineSegments geometry={EDGES} position={world(hover.cell)}>
          <lineBasicMaterial
            color={mode === 'erase' ? '#ff8f6a' : '#ffffff'}
            transparent
            opacity={0.85}
            toneMapped={false}
          />
        </lineSegments>
      )}
      {ghost && (
        <mesh geometry={BOX} position={world(ghost)}>
          <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
      <Pending list={pending} />
    </group>
  );
}
