import { useEffect, useRef } from "react";
import * as THREE from "three";

function createCharacter(scene) {
  const root = new THREE.Group();
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xb9856d, roughness: 0.7, metalness: 0, sheen: 0.12, sheenColor: 0xcda18d });
  const skinLight = new THREE.MeshPhysicalMaterial({ color: 0xc8947b, roughness: 0.64, metalness: 0, sheen: 0.1 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x171d27, roughness: 0.84 });
  const suit = new THREE.MeshStandardMaterial({ color: 0x101a27, roughness: 0.72, metalness: 0.08 });
  const suitLight = new THREE.MeshStandardMaterial({ color: 0x203248, roughness: 0.67, metalness: 0.12 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x58bfc6, emissive: 0x06343d, emissiveIntensity: 0.42, roughness: 0.48 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe5e8e9, roughness: 0.38 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x397b91, emissive: 0x061a23, emissiveIntensity: 0.16, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x10131b, roughness: 0.28 });
  const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x754c45, roughness: 0.68 });

  const mesh = (geometry, material, parent, position, scale) => {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(...position);
    if (scale) item.scale.set(...scale);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const torso = mesh(new THREE.CapsuleGeometry(0.48, 0.72, 6, 12), suit, root, [0, 0.45, 0], [1.05, 1, 0.62]);
  torso.rotation.z = Math.PI;
  mesh(new THREE.SphereGeometry(0.43, 24, 16), suit, root, [0, 0.98, 0], [1.32, 0.54, 0.64]);
  mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.42, 20), skin, root, [0, 1.47, 0]);

  const head = new THREE.Group();
  head.position.set(0, 1.94, 0);
  root.add(head);
  mesh(new THREE.SphereGeometry(0.47, 32, 24), skin, head, [0, 0.12, 0], [0.86, 1.14, 0.78]);
  mesh(new THREE.SphereGeometry(0.34, 24, 16), skin, head, [0, -0.15, 0.08], [1, 0.66, 0.86]);
  mesh(new THREE.SphereGeometry(0.085, 20, 14), skinLight, head, [-0.405, 0.05, 0], [0.42, 0.68, 0.6]);
  mesh(new THREE.SphereGeometry(0.085, 20, 14), skinLight, head, [0.405, 0.05, 0], [0.42, 0.68, 0.6]);
  mesh(new THREE.CapsuleGeometry(0.032, 0.085, 5, 10), skinLight, head, [0, 0.005, 0.36], [1, 1, 0.72]);
  mesh(new THREE.SphereGeometry(0.048, 18, 14), skinLight, head, [0, -0.045, 0.392], [1.1, 0.78, 0.82]);

  const eyes = new THREE.Group();
  eyes.position.set(0, 0.18, 0.335);
  head.add(eyes);
  for (const x of [-0.16, 0.16]) {
    mesh(new THREE.SphereGeometry(0.058, 20, 14), white, eyes, [x, 0, 0], [1, 0.58, 0.34]);
    mesh(new THREE.SphereGeometry(0.026, 18, 12), iris, eyes, [x, 0, 0.021], [1, 1, 0.48]);
    mesh(new THREE.SphereGeometry(0.013, 14, 10), dark, eyes, [x, 0, 0.034], [1, 1, 0.5]);
    const brow = mesh(new THREE.CapsuleGeometry(0.018, 0.105, 3, 6), hair, head, [x, 0.285, 0.32], [1, 1, 0.55]);
    brow.rotation.z = x < 0 ? -0.14 : 0.14;
  }

  mesh(new THREE.SphereGeometry(0.48, 32, 24), hair, head, [0, 0.41, -0.01], [0.9, 0.4, 0.78]);
  mesh(new THREE.SphereGeometry(0.13, 24, 16), hair, head, [0, 0.51, 0.16], [0.92, 0.28, 0.62]);
  for (const x of [-0.39, 0.39]) mesh(new THREE.SphereGeometry(0.08, 18, 12), hair, head, [x, 0.08, 0], [0.45, 1.35, 0.7]);
  const jaw = mesh(new THREE.SphereGeometry(0.062, 16, 10), skinLight, head, [0, -0.21, 0.345], [1.2, 0.42, 0.4]);
  const mouth = mesh(new THREE.SphereGeometry(0.044, 20, 12), mouthMaterial, head, [0, -0.125, 0.382], [1.42, 0.12, 0.22]);

  // Tailored lapel shapes and a restrained luminous collar accent.
  const lapelShape = new THREE.Shape();
  lapelShape.moveTo(0, 0.38); lapelShape.lineTo(0.18, 0.55); lapelShape.lineTo(0.32, 0.02); lapelShape.lineTo(0.11, -0.04); lapelShape.closePath();
  for (const side of [-1, 1]) {
    const lapel = new THREE.Mesh(new THREE.ShapeGeometry(lapelShape), suitLight);
    lapel.position.set(side * 0.02, 1.02, 0.405);
    lapel.rotation.y = side * -0.12;
    if (side < 0) lapel.scale.x = -1;
    root.add(lapel);
  }
  mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.36, 4), dark, root, [0, 0.82, 0.36], [1, 1, 0.3]);
  mesh(new THREE.BoxGeometry(0.025, 0.38, 0.018), cyan, root, [0.28, 0.78, 0.38]);
  mesh(new THREE.SphereGeometry(0.038, 12, 8), cyan, root, [0.31, 0.6, 0.4]);

  scene.add(root);
  root.userData = { head, jaw, eyes, mouth, torso };
  return root;
}

export default function ProceduralMaleAvatar({ state = "ready", size = 280, onError }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const drawRef = useRef(null);
  useEffect(() => {
    stateRef.current = state;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) drawRef.current?.();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let frame = 0;
    let disposed = false;
    let character;
    const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
    camera.position.set(0, 1.58, 4.8);
    camera.lookAt(0, 1.32, 0);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      onError?.("WebGL is unavailable in this browser.");
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(size, size, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene.add(new THREE.HemisphereLight(0xc4e6ff, 0x111827, 2.2));
    const key = new THREE.DirectionalLight(0xffe4d5, 2.1); key.position.set(2, 4, 4); scene.add(key);
    const fill = new THREE.PointLight(0x3b9daf, 9, 10); fill.position.set(-2, 2.5, 0); scene.add(fill);
    const rim = new THREE.PointLight(0x62c5d0, 8, 8); rim.position.set(1, 2, -2); scene.add(rim);
    const clock = new THREE.Clock();

    try {
      character = createCharacter(scene);
    } catch {
      renderer.dispose();
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      const width = Math.min(canvas.clientWidth || size, 480);
      const height = canvas.clientHeight || width;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      drawRef.current?.();
    });
    observer.observe(canvas);

    const draw = () => {
      if (disposed || document.hidden) return;
      const current = stateRef.current;
        const { head, jaw, eyes, mouth, torso } = character.userData;
      if (motionPreference?.matches) {
        character.position.y = 0;
        head.rotation.y = current === "listening" ? -0.08 : current === "greeting" ? 0.07 : 0;
        head.rotation.x = current === "thinking" ? -0.08 : current === "interrupted" ? 0.06 : 0;
        head.rotation.z = 0;
        eyes.scale.y = 1;
          jaw.scale.y = 0.42;
          mouth.scale.y = current === "speaking" ? 0.22 : 0.12;
        renderer.render(scene, camera);
        return;
      }
      frame = requestAnimationFrame(draw);
      const t = clock.getElapsedTime();
      const breath = Math.sin(t * 0.72);
      character.position.y = Math.sin(t * 0.58) * 0.006;
      torso.scale.y = 1 + breath * 0.006;
      const targetHeadY = Math.sin(t * 0.32) * 0.018 + (current === "listening" ? -0.07 : current === "greeting" ? Math.sin(t * 1.55) * 0.09 : current === "responding" ? 0.025 : 0);
      const targetHeadX = current === "thinking" ? -0.065 : current === "interrupted" ? 0.045 : Math.sin(t * 0.45) * 0.008;
      head.rotation.y += (targetHeadY - head.rotation.y) * 0.045;
      head.rotation.x += (targetHeadX - head.rotation.x) * 0.045;
      head.rotation.z += (0 - head.rotation.z) * 0.045;
      const blink = (t % 4.2 > 4.07) ? 0.08 : 1;
      eyes.scale.y = blink;
      jaw.scale.y = 0.42;
      mouth.scale.y = current === "speaking" ? 0.12 + ((Math.sin(t * 7.2) + 1) * 0.055) : 0.12;
      renderer.render(scene, camera);
    };
    const onMotionPreferenceChange = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      draw();
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else draw();
    };
    drawRef.current = draw;
    motionPreference?.addEventListener?.("change", onMotionPreferenceChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    draw();
    return () => {
      disposed = true;
      drawRef.current = null;
      cancelAnimationFrame(frame);
      motionPreference?.removeEventListener?.("change", onMotionPreferenceChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer.disconnect();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose?.();
      });
      renderer.dispose();
    };
  }, [size, onError]);

  return <canvas ref={canvasRef} className="peoplecare-glb-canvas procedural-male-canvas" aria-label={`Stylized procedural male digital human, ${state}`} />;
}
