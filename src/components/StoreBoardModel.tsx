import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type ModelStatus = 'loading' | 'ready' | 'error' | 'unsupported';

function disposeObjectResources(root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach(material => {
      Object.values(material).forEach(value => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}

export function StoreBoardModel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ModelStatus>('loading');
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
    } catch (error) {
      console.error('Die 3D-Anzeige konnte nicht gestartet werden.', error);
      setStatus('unsupported');
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

    let displayBoard: THREE.Object3D | undefined;
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
        displayBoard = pivot;
        setStatus('ready');
      },
      undefined,
      error => {
        if (disposed) return;
        console.error('Das Blender-Brett konnte im Shop nicht geladen werden.', error);
        setStatus('error');
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
      if (displayBoard && isRotatingRef.current) displayBoard.rotation.y += delta * 0.24;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeObjectResources(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="district-board-model" role="img" aria-label="Interaktives 3D-Modell des Stadtbretts">
      <div className="district-board-glow" aria-hidden="true" />
      <div className="district-board-canvas" ref={hostRef} />
      {status === 'loading' && <span className="district-board-model-note" role="status">Das Stadtbrett wird geladen …</span>}
      {status === 'error' && <div className="district-board-fallback" role="alert">Das Stadtbrett konnte nicht geladen werden.</div>}
      {status === 'unsupported' && <div className="district-board-fallback" role="status">3D ist auf diesem Gerät nicht verfügbar.</div>}
      <button
        type="button"
        className="district-board-rotate"
        aria-pressed={isRotating}
        disabled={status !== 'ready'}
        onClick={() => setIsRotating(rotating => !rotating)}
      >
        {isRotating ? 'Drehung pausieren' : '3D-Modell drehen'}
      </button>
      <span className="district-board-label">ARENA DISTRICTS / CITY TABLE 01</span>
    </div>
  );
}
