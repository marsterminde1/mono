import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function StoreBoardModel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [modelLoadFailed, setModelLoadFailed] = useState(false);
  const [isRotating, setIsRotating] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const isRotatingRef = useRef(isRotating);
  isRotatingRef.current = isRotating;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setFailed(true);
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(8.5, 8.2, 9.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 8;
    controls.maxDistance = 14;
    controls.autoRotate = false;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#f3f5ff', '#171824', 2.2));
    const keyLight = new THREE.DirectionalLight('#fff0dc', 3.6);
    keyLight.position.set(-5, 10, 7);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const rimLight = new THREE.PointLight('#ef4d34', 22, 18);
    rimLight.position.set(5, 4, -4);
    scene.add(rimLight);
    const fillLight = new THREE.PointLight('#59d5c3', 18, 18);
    fillLight.position.set(-5, 3, 5);
    scene.add(fillLight);

    const materials = new Set<THREE.Material>();
    const material = (color: THREE.ColorRepresentation, roughness = 0.55, metalness = 0) => {
      const result = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.add(result);
      return result;
    };
    const board = new THREE.Group();
    scene.add(board);
    let displayBoard: THREE.Object3D = board;

    const addBox = (
      parent: THREE.Object3D,
      size: [number, number, number],
      position: [number, number, number],
      surface: THREE.Material,
    ) => {
      const geometry = new THREE.BoxGeometry(...size);
      const mesh = new THREE.Mesh(geometry, surface);
      mesh.position.set(...position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    addBox(board, [7.6, 0.42, 7.6], [0, -0.15, 0], material('#18191e', 0.35, 0.5));
    addBox(board, [7.5, 0.07, 7.5], [0, 0.09, 0], material('#d1a878', 0.3, 0.72));
    addBox(board, [7.26, 0.13, 7.26], [0, 0.18, 0], material('#28272b', 0.75));

    const districtColors = ['#e45a41', '#e7aa4a', '#71b9a2', '#8e81c8'];
    const tileMaterial = material('#ddd5c6', 0.63);
    const brassMaterial = material('#bd9a69', 0.34, 0.65);
    const positions: Array<[number, number, number, number]> = [];
    for (let i = 0; i <= 8; i++) positions.push([-3.15 + i * 0.7875, 0.32, 3.14, 0]);
    for (let i = 1; i <= 8; i++) positions.push([3.14, 0.32, 3.14 - i * 0.7875, Math.PI / 2]);
    for (let i = 1; i <= 8; i++) positions.push([3.14 - i * 0.7875, 0.32, -3.14, Math.PI]);
    for (let i = 1; i < 8; i++) positions.push([-3.14, 0.32, -3.14 + i * 0.7875, -Math.PI / 2]);

    positions.forEach(([x, y, z, rotation], index) => {
      const corner = index === 0 || index === 8 || index === 16 || index === 24;
      const lot = new THREE.Group();
      lot.position.set(x, y, z);
      lot.rotation.y = rotation;
      addBox(lot, [corner ? 0.72 : 0.62, 0.13, 0.62], [0, 0, 0], tileMaterial);
      addBox(lot, [corner ? 0.72 : 0.62, 0.045, 0.14], [0, 0.088, -0.23], material(districtColors[Math.floor(index / 8) % districtColors.length], 0.42));
      addBox(lot, [0.48, 0.025, 0.012], [0, 0.09, 0.305], brassMaterial);

      if (!corner && index % 4 === 2) {
        const height = 0.3 + (index % 3) * 0.09;
        const tower = addBox(lot, [0.18, height, 0.18], [0, 0.14 + height / 2, 0.08], material(districtColors[Math.floor(index / 8) % districtColors.length], 0.33, 0.18));
        tower.castShadow = true;
      }
      board.add(lot);
    });

    const cityBase = addBox(board, [3.8, 0.18, 3.8], [0, 0.31, 0], material('#333139', 0.62));
    cityBase.receiveShadow = true;
    const city = new THREE.Group();
    city.position.y = 0.42;
    board.add(city);

    const buildingColors = ['#eee7dc', '#d2c8bc', '#8b909b', '#e48b68', '#83b8aa'];
    const buildingSpots: Array<[number, number, number]> = [
      [-1.12, -0.75, 0.58], [-0.38, -0.8, 0.98], [0.48, -0.82, 0.68], [1.12, -0.54, 0.42],
      [-1.22, 0.12, 0.88], [-0.42, 0.1, 0.46], [0.38, 0.05, 0.76], [1.12, 0.17, 1.04],
      [-0.98, 0.95, 0.47], [-0.1, 0.86, 0.86], [0.78, 0.93, 0.53],
    ];
    buildingSpots.forEach(([x, z, height], index) => {
      const color = buildingColors[index % buildingColors.length];
      const building = addBox(city, [0.48, height, 0.48], [x, height / 2, z], material(color, 0.52, 0.08));
      building.rotation.y = index % 2 ? 0.06 : -0.05;
      const roof = addBox(city, [0.51, 0.045, 0.51], [x, height + 0.025, z], brassMaterial);
      roof.castShadow = false;

      const windowMaterial = material('#f4bf79', 0.32, 0.1);
      for (let floor = 0; floor < Math.floor(height / 0.16); floor++) {
        addBox(city, [0.045, 0.035, 0.012], [x - 0.1, 0.13 + floor * 0.15, z + 0.246], windowMaterial);
        addBox(city, [0.045, 0.035, 0.012], [x + 0.1, 0.13 + floor * 0.15, z + 0.246], windowMaterial);
      }
    });

    const titleCanvas = document.createElement('canvas');
    titleCanvas.width = 512;
    titleCanvas.height = 256;
    const context = titleCanvas.getContext('2d');
    if (context) {
      context.fillStyle = '#242329';
      context.fillRect(0, 0, titleCanvas.width, titleCanvas.height);
      context.strokeStyle = '#d7ae7b';
      context.lineWidth = 5;
      context.strokeRect(12, 12, 488, 232);
      context.fillStyle = '#fbf4e9';
      context.textAlign = 'center';
      context.font = '700 32px Arial';
      context.fillText('ARENA DISTRICTS', 256, 111);
      context.fillStyle = '#d7ae7b';
      context.font = '20px Arial';
      context.fillText('CITY STRATEGY GAME', 256, 157);
    }
    const titleTexture = new THREE.CanvasTexture(titleCanvas);
    titleTexture.colorSpace = THREE.SRGBColorSpace;
    const titleMaterial = new THREE.MeshBasicMaterial({ map: titleTexture, side: THREE.DoubleSide });
    materials.add(titleMaterial);
    const title = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), titleMaterial);
    title.rotation.x = -Math.PI / 2;
    title.position.set(0, 0.414, 0);
    board.add(title);

    const pawn = new THREE.Group();
    pawn.position.set(-0.2, 0.52, 0.3);
    const gold = material('#e1b66f', 0.22, 0.78);
    const pawnBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.12, 32), gold);
    pawnBase.castShadow = true;
    pawn.add(pawnBase);
    const pawnBody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.19, 0.48, 24), gold);
    pawnBody.position.y = 0.3;
    pawnBody.castShadow = true;
    pawn.add(pawnBody);
    const pawnHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), gold);
    pawnHead.position.y = 0.62;
    pawnHead.castShadow = true;
    pawn.add(pawnHead);
    city.add(pawn);

    const diceMaterial = material('#f1ece2', 0.3, 0.05);
    const pipMaterial = material('#e4563d', 0.36);
    const dice = new THREE.Group();
    dice.position.set(2.28, 0.42, 1.9);
    const die = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), diceMaterial);
    die.rotation.set(0.24, 0.35, -0.18);
    die.castShadow = true;
    dice.add(die);
    const pipPositions: Array<[number, number, number]> = [[-0.1, 0.11, 0.266], [0.1, -0.11, 0.266], [-0.266, 0.1, 0.1], [0.266, -0.1, -0.1]];
    pipPositions.forEach(position => {
      const pip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), pipMaterial);
      pip.position.set(...position);
      dice.add(pip);
    });
    board.add(dice);

    const disposeObjectResources = (root: THREE.Object3D) => {
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach(meshMaterial => {
          Object.values(meshMaterial).forEach(value => {
            if (value instanceof THREE.Texture) value.dispose();
          });
          meshMaterial.dispose();
        });
      });
    };

    new GLTFLoader().load(
      new URL('../../arena_board_v2.glb', import.meta.url).href,
      gltf => {
        const model = gltf.scene;
        if (disposed) {
          disposeObjectResources(model);
          return;
        }

        model.scale.setScalar(3.8 / 4.267578125);
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.y += 0.39 - bounds.max.y;
        model.position.z -= center.z;
        model.updateMatrixWorld(true);
        model.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });

        const pivot = new THREE.Group();
        pivot.add(model);
        scene.add(pivot);
        scene.remove(board);
        disposeObjectResources(board);
        materials.clear();
        displayBoard = pivot;
        setModelLoadFailed(false);
      },
      undefined,
      error => {
        if (disposed) return;
        console.error('Das Blender-Brett konnte im Shop nicht geladen werden; die Ersatzvorschau bleibt aktiv.', error);
        setModelLoadFailed(true);
      }
    );

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    let lastFrameTime = performance.now();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const currentTime = performance.now();
      const delta = Math.min((currentTime - lastFrameTime) / 1000, 0.1);
      lastFrameTime = currentTime;
      controls.update();
      if (isRotatingRef.current) displayBoard.rotation.y += delta * 0.24;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeObjectResources(scene);
      materials.forEach(item => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="district-board-model" role="img" aria-label="Interaktives 3D-Modell eines eigenen Stadtbrettspiels">
      <div className="district-board-glow" aria-hidden="true" />
      <div className="district-board-canvas" ref={hostRef} />
      <button
        type="button"
        className="district-board-rotate"
        aria-pressed={isRotating}
        onClick={() => setIsRotating(rotating => !rotating)}
      >
        {isRotating ? 'Drehung pausieren' : '3D-Modell drehen'}
      </button>
      {modelLoadFailed && <span className="district-board-model-note" role="status">Die Ersatzvorschau ist aktiv.</span>}
      {failed && <div className="district-board-fallback">Eine eigene Stadt. Ein Spielzug kann alles ändern.</div>}
      <span className="district-board-label">ARENA DISTRICTS / CITY TABLE 01</span>
    </div>
  );
}
