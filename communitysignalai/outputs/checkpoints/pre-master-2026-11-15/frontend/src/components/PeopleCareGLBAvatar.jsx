import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import PeopleCareAvatar3D from "./PeopleCareAvatar3D.jsx";
import ProceduralMaleAvatar from "./ProceduralMaleAvatar.jsx";

const MODEL_URL = import.meta.env.VITE_PEOPLECARE_AVATAR_URL;

/** Loads a user-supplied rigged GLB, with an honest hologram fallback. */
export default function PeopleCareGLBAvatar({ state = "ready", size = 220 }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const renderRef = useRef(null);
  const [fallbackReason, setFallbackReason] = useState("");

  useEffect(() => {
    stateRef.current = state;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) renderRef.current?.(performance.now());
  }, [state]);

  useEffect(() => {
    if (!MODEL_URL) {
      return undefined;  
    }

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let disposed = false;
    let frameId = 0;
    let mixer = null;
    let renderer = null;
    let model = null;
    let activeAction = null;
    let idleAction = null;
    const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const clock = new THREE.Clock();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 1.45, 3.5);
    camera.lookAt(0, 1.2, 0);
    scene.add(new THREE.HemisphereLight(0xb9e6ff, 0x101528, 2.0));
    const keyLight = new THREE.DirectionalLight(0xc7e9ff, 2.5);
    keyLight.position.set(2, 4, 3);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x18bfff, 16, 8);
    rimLight.position.set(-2, 2, -1);
    scene.add(rimLight);

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(size, size, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    } catch {
      queueMicrotask(() => setFallbackReason("WebGL is unavailable in this browser."));
      return undefined;
    }

    const resize = () => {
      const width = Math.min(canvas.clientWidth || size, 560);
      const height = canvas.clientHeight || size;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer?.setSize(width, height, false);
      renderRef.current?.(performance.now());
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const loader = new GLTFLoader();
    let lastFrameAt = 0;
    loader.load(MODEL_URL, (gltf) => {
      if (disposed) return;
      model = gltf.scene;
      model.position.y = -0.1;
      scene.add(model);
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        const chooseClip = (words) => gltf.animations.find((clip) => words.some((word) => clip.name.toLowerCase().includes(word)));
        const idle = chooseClip(["idle", "stand"]);
        if (idle) {
          idleAction = mixer.clipAction(idle);
          activeAction = idleAction.play();
        }
        model.userData.stateClips = {
          speaking: chooseClip(["speak", "talk"]),
          listening: chooseClip(["listen"]),
          thinking: chooseClip(["think"]),
          greeting: chooseClip(["greet", "hello"]),
          responding: chooseClip(["respond"]),
          interrupted: chooseClip(["interrupt"]),
        };
      }
      setFallbackReason("");
      if (motionPreference?.matches) renderRef.current?.(performance.now());
    }, undefined, () => {
      if (!disposed) {
        disposed = true;
        cancelAnimationFrame(frameId);
        renderer?.dispose();
        setFallbackReason("The configured GLB could not be loaded; showing the stylized procedural male fallback.");
      }
    });

    const render = (frameTime) => {
      if (disposed || !renderer || document.hidden) return;
      if (motionPreference?.matches) {
        renderer.render(scene, camera);
        return;
      }
      frameId = requestAnimationFrame(render);
      if (frameTime - lastFrameAt < 1000 / 30) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      lastFrameAt = frameTime;
      mixer?.update(delta);
      if (model) {
        const currentState = stateRef.current;
        model.rotation.y += (currentState === "ready" ? 0.048 : 0.015) * delta;
        let nextAction = activeAction;
        const stateClip = model.userData.stateClips?.[currentState];
        if (stateClip) nextAction = mixer.clipAction(stateClip);
        else if (idleAction) nextAction = idleAction;
        if (nextAction && nextAction !== activeAction) {
          nextAction.reset().fadeIn(0.25).play();
          activeAction?.fadeOut(0.25);
          activeAction = nextAction;
        }
        // Approximate mouth motion only when the supplied rig exposes a jaw/mouth morph.
        if (currentState === "speaking") {
          const pulse = (Math.sin(performance.now() / 95) + 1) * 0.18;
          model.traverse((node) => {
            if (!node.isMesh || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
            for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
              if (/jawopen|mouthopen|viseme_aa/i.test(name)) node.morphTargetInfluences[index] = pulse;
            }
          });
        } else {
          model.traverse((node) => {
            if (!node.isMesh || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
            for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
              if (/jawopen|mouthopen|viseme_aa/i.test(name)) node.morphTargetInfluences[index] = 0;
            }
          });
        }
      }
      renderer.render(scene, camera);
    };
    const onMotionPreferenceChange = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      render(performance.now());
    };
    const onVisibilityChange = () => {
      if (document.hidden && frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (!document.hidden) render(performance.now());
    };
    renderRef.current = render;
    motionPreference?.addEventListener?.("change", onMotionPreferenceChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    render(performance.now());

    return () => {
      disposed = true;
      renderRef.current = null;
      cancelAnimationFrame(frameId);
      motionPreference?.removeEventListener?.("change", onMotionPreferenceChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer.disconnect();
      mixer?.stopAllAction();
      scene.traverse((node) => {
        node.geometry?.dispose?.();
        for (const material of (Array.isArray(node.material) ? node.material : [node.material])) material?.dispose?.();
      });
      renderer?.dispose();
    };
  }, [size]);

  const displayFallbackReason = fallbackReason;
  if (displayFallbackReason && displayFallbackReason.includes("WebGL is unavailable")) {
    return (
      <div className="avatar-glb-fallback" role="img" aria-label="PeopleCare AI hologram fallback">
        <PeopleCareAvatar3D state={state} size={size} interactive={false} />
        <small>{displayFallbackReason}</small>
      </div>
    );
  }
  if (displayFallbackReason) return <div className="avatar-glb-fallback"><ProceduralMaleAvatar state={state} size={size} onError={setFallbackReason} /><small>{displayFallbackReason}</small></div>;
  if (!MODEL_URL) return <ProceduralMaleAvatar state={state} size={size} onError={setFallbackReason} />;
  return <canvas ref={canvasRef} className="peoplecare-glb-canvas" aria-label={`PeopleCare digital assistant, ${state}`} />;
}
