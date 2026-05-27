import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready(): void;
        expand(): void;
        close(): void;
        themeParams: {
          bg_color?: string;
          text_color?: string;
          button_color?: string;
        };
        colorScheme: "light" | "dark";
        MainButton: {
          text: string;
          show(): void;
          hide(): void;
          onClick(fn: () => void): void;
        };
      };
    };
  }
}

function getParam(key: string): string {
  const p = new URLSearchParams(window.location.search);
  return p.get(key) ?? "";
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [modelTitle, setModelTitle] = useState("");

  const modelUrl = getParam("model");
  const title = getParam("title");

  useEffect(() => {
    setModelTitle(title || "3D Model");
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, [title]);

  useEffect(() => {
    if (!modelUrl || !mountRef.current) return;

    const container = mountRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    const isDark = window.Telegram?.WebApp?.colorScheme === "dark" || true;
    scene.background = new THREE.Color(isDark ? "#17212b" : "#f0f4f8");

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000);
    camera.position.set(0, 1, 3);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.1;
    controls.maxDistance = 20;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x8899ff, 0.4);
    fillLight.position.set(-5, 2, -5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, -3, -5);
    scene.add(rimLight);

    // Grid
    const grid = new THREE.GridHelper(10, 20, 0x334455, 0x334455);
    (grid.material as THREE.Material).opacity = 0.3;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Load model
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // Center and scale the model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;

        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));

        // Position on grid
        const newBox = new THREE.Box3().setFromObject(model);
        model.position.y -= newBox.min.y;

        // Enable shadows on all meshes
        model.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });

        scene.add(model);
        setStatus("ready");
        setProgress(100);

        // Fit camera to model
        const fittedBox = new THREE.Box3().setFromObject(model);
        const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
        const fittedSize = fittedBox.getSize(new THREE.Vector3());
        const maxSize = Math.max(fittedSize.x, fittedSize.y, fittedSize.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxSize / 2 / Math.tan(fov / 2)) * 1.8;
        camera.position.set(fittedCenter.x, fittedCenter.y + maxSize * 0.3, fittedCenter.z + cameraZ);
        controls.target.copy(fittedCenter);
        controls.update();
      },
      (event) => {
        if (event.total > 0) {
          setProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
      (err) => {
        console.error("GLB load error:", err);
        setErrorMsg("Не удалось загрузить 3D-модель. Попробуйте скачать файл.");
        setStatus("error");
      },
    );

    // Handle touch to stop auto-rotate
    const onTouch = () => { controls.autoRotate = false; };
    renderer.domElement.addEventListener("pointerdown", onTouch);

    // Resize
    const onResize = () => {
      const w2 = container.clientWidth;
      const h2 = container.clientHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };
    window.addEventListener("resize", onResize);

    // Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onTouch);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [modelUrl]);

  return (
    <div className="viewer-root">
      {/* Header */}
      <div className="viewer-header">
        <span className="viewer-title">{modelTitle || "3D Model Viewer"}</span>
        <div className="viewer-controls-hint">
          <span>🖱 Вращение · Скролл = зум</span>
        </div>
      </div>

      {/* 3D Canvas */}
      <div ref={mountRef} className="viewer-canvas" />

      {/* Loading overlay */}
      {status === "loading" && (
        <div className="viewer-overlay">
          <div className="viewer-spinner" />
          <p className="viewer-overlay-text">Загрузка модели… {progress}%</p>
          <div className="viewer-progress-bar">
            <div className="viewer-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div className="viewer-overlay">
          <div className="viewer-error-icon">❌</div>
          <p className="viewer-overlay-text">{errorMsg}</p>
        </div>
      )}

      {/* No model param */}
      {!modelUrl && (
        <div className="viewer-overlay">
          <div className="viewer-error-icon">🔗</div>
          <p className="viewer-overlay-text">Модель не указана.<br />Откройте через бота после генерации.</p>
        </div>
      )}
    </div>
  );
}
