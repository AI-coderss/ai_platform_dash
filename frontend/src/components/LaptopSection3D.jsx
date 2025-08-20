/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
// LaptopSection3D.jsx
// deps: npm i three gsap split-type
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS3DRenderer, CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import gsap from "gsap";
import SplitType from "split-type";
import "../styles/LaptopSection3D.css";

export default function LaptopSection3D() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  // Card / UI refs
  const cardWrapRef = useRef(null);
  const cardRef = useRef(null);
  const cardParticlesRef = useRef(null);
  const animatedNodes = useRef([]);
  const animateTimelines = useRef([]);

  const [camOn, setCamOn] = useState(false);
  const camOnRef = useRef(false);

  // DOM/3D refs
  const videoElRef = useRef(null);
  const ifrObjRef = useRef(null);
  const screenMeshRef = useRef(null);

  const timelines = useRef({
    mainTl: null, laptopAppearTl: null, laptopOpeningTl: null,
    screenOnTl: null, cameraOnTl: null, floatingTl: null
  });

  const threeRefs = useRef({
    scene: null, camera: null, renderer: null, cssRenderer: null, orbit: null,
    darkPlasticMaterial: null, cameraMaterial: null, baseMetalMaterial: null,
    logoMaterial: null, screenMaterial: null, keyboardMaterial: null,
    macGroup: null, lidGroup: null, bottomGroup: null,
    lightHolder: null, screenLight: null, pmrem: null
  });

  const api = useRef({ setCamera: async () => {} });

  useEffect(() => {
    // =========================
    // 3D LAPTOP
    // =========================
    const IFRAME_URL = "https://ai-platform-dash.onrender.com";
    const canvasEl = canvasRef.current;

    const videoEl = document.createElement("video");
    videoElRef.current = videoEl;
    videoEl.autoplay = true;
    videoEl.muted = true;
    videoEl.setAttribute("playsinline", "");
    const screenSize = [29.4, 20];

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 10, 1000);
    camera.position.set(0, 8, 75);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: canvasEl });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if ("outputColorSpace" in renderer) {
      renderer.outputColorSpace = "srgb";
    } else if ("outputEncoding" in renderer) {
      renderer.outputEncoding = 3001; // sRGBEncoding numeric fallback
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.6);
    hemi.position.set(0, 1, 0); scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(30, 40, 25); scene.add(dir);

    const lightHolder = new THREE.Group(); scene.add(lightHolder);
    const point = new THREE.PointLight(0xFFF5E1, 0.5);
    point.position.set(0, 5, 50); lightHolder.add(point);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.minDistance = 45; orbit.maxDistance = 120;
    orbit.enablePan = false; orbit.enableDamping = true;

    const macGroup = new THREE.Group();
    macGroup.position.z = -10;
    macGroup.position.x = 18; // << push laptop further RIGHT for a significant gap
    scene.add(macGroup);

    const lidGroup = new THREE.Group(); macGroup.add(lidGroup);
    const bottomGroup = new THREE.Group(); macGroup.add(bottomGroup);

    const cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.domElement.className = "dsah-css3d-layer";
    cssRenderer.domElement.style.pointerEvents = "none";
    wrapRef.current.appendChild(cssRenderer.domElement);

    const darkPlasticMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d0d0f, roughness: 0.85, metalness: 0.8, envMapIntensity: 0.9
    });
    const cameraMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const baseMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0xD0D5DB, roughness: 0.32, metalness: 0.92, envMapIntensity: 1.2
    });
    const logoMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const screenMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide
    });
    const keyboardMaterial = darkPlasticMaterial;

    const loader = new GLTFLoader();
    loader.load(
      "https://ksenia-k.com/models/mac-noUv.glb",
      (glb) => {
        [...glb.scene.children].forEach(child => {
          if (child.name === "_top") {
            lidGroup.add(child);
            [...child.children].forEach(mesh => {
              if (mesh.name === "lid") mesh.material = baseMetalMaterial;
              else if (mesh.name === "logo") mesh.material = logoMaterial;
              else if (mesh.name === "screen-frame") mesh.material = darkPlasticMaterial;
              else if (mesh.name === "camera") mesh.material = cameraMaterial;
            });
          } else if (child.name === "_bottom") {
            bottomGroup.add(child);
            [...child.children].forEach(mesh => {
              if (mesh.name === "base") mesh.material = baseMetalMaterial;
              else if (mesh.name === "legs") mesh.material = darkPlasticMaterial;
              else if (mesh.name === "keyboard") mesh.material = darkPlasticMaterial;
              else if (mesh.name === "inner") mesh.material = darkPlasticMaterial;
            });
          }
        });

        const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenSize[0], screenSize[1]), screenMaterial);
        screenMesh.position.set(0, 10.5, -0.11);
        screenMesh.rotation.set(Math.PI, 0, 0);
        lidGroup.add(screenMesh);
        screenMeshRef.current = screenMesh;

        const screenLight = new THREE.RectAreaLight(0xffffff, 0, screenSize[0], screenSize[1]);
        screenLight.position.set(0, 10.5, 0);
        screenLight.rotation.set(Math.PI, 0, 0);
        lidGroup.add(screenLight);

        const darkScreen = screenMesh.clone();
        darkScreen.position.set(0, 10.5, -0.111);
        darkScreen.rotation.set(Math.PI, Math.PI, 0);
        darkScreen.material = darkPlasticMaterial;
        lidGroup.add(darkScreen);

        const wPx = 1440;
        const hPx = Math.round((wPx * screenSize[1]) / screenSize[0]);

        const wrapper = document.createElement("div");
        wrapper.style.width = `${wPx}px`;
        wrapper.style.height = `${hPx}px`;
        wrapper.style.border = "0";
        wrapper.style.overflow = "hidden";
        wrapper.style.background = "black";
        wrapper.style.backfaceVisibility = "hidden";
        wrapper.style.webkitBackfaceVisibility = "hidden";
        wrapper.style.transformStyle = "preserve-3d";
        wrapper.style.pointerEvents = "auto";

        const inner = document.createElement("div");
        inner.style.width = "100%";
        inner.style.height = "100%";
        inner.style.transform = "scaleY(-1)";
        inner.style.transformOrigin = "center center";
        inner.style.backfaceVisibility = "hidden";
        inner.style.webkitBackfaceVisibility = "hidden";

        const iframe = document.createElement("iframe");
        iframe.src = IFRAME_URL;
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "0";
        iframe.style.background = "black";
        iframe.style.pointerEvents = "auto";

        inner.appendChild(iframe);
        wrapper.appendChild(inner);

        const iframeObj = new CSS3DObject(wrapper);
        iframeObj.position.set(0, 10.5, -0.109);
        iframeObj.rotation.set(Math.PI, 0, 0);
        const sx = screenSize[0] / wPx;
        const sy = screenSize[1] / hPx;
        iframeObj.scale.set(sx, sy, 1);
        lidGroup.add(iframeObj);
        ifrObjRef.current = iframeObj;

        const floatingTl = gsap.timeline({ repeat: -1 })
          .to([lidGroup.position, bottomGroup.position], { duration: 1.5, y: "+=1", ease: "power1.inOut" }, 0)
          .to([lidGroup.position, bottomGroup.position], { duration: 1.5, y: "-=1", ease: "power1.inOut" })
          .timeScale(0);

        const screenOnTl = gsap.timeline({ paused: true })
          .to(screenMaterial, { duration: 0.12, opacity: 0.96 }, 0)
          .to(screenLight,   { duration: 0.12, intensity: 1.5 }, 0);

        const laptopOpeningTl = gsap.timeline({
          paused: true,
          onUpdate: () => {
            const closedEnough = lidGroup.rotation.x > 0.35 * Math.PI;
            if (ifrObjRef.current?.element) {
              ifrObjRef.current.element.style.opacity = closedEnough ? "0" : "1";
              ifrObjRef.current.element.style.pointerEvents = closedEnough ? "none" : "auto";
            }
          }
        })
          .from(lidGroup.position, { duration: 0.75, z: "+=.5" }, 0)
          .fromTo(lidGroup.rotation, { duration: 1, x: 0.5 * Math.PI }, { x: -0.2 * Math.PI }, 0);

        const cameraOnTl = gsap.timeline({ paused: true, reversed: true })
          .to(cameraMaterial.color, { duration: 0.01, r: 0, g: 255, b: 0 }, 0);

        const laptopAppearTl = gsap.timeline({ paused: true })
          .fromTo(macGroup.rotation, { x: 0.5 * Math.PI, y: 0.2 * Math.PI }, { duration: 2, x: 0.05 * Math.PI, y: -0.1 * Math.PI }, 0)
          .fromTo(macGroup.position, { y: -50 }, { duration: 1, y: -8 }, 0);

        const mainTl = gsap.timeline({ defaults: { ease: "none" } })
          .to(laptopAppearTl,   { duration: 1.5, progress: 1 }, 0)
          .to(laptopOpeningTl,  { duration: 1.0, progress: 0.34 }, 0.5)
          .to(floatingTl,       { duration: 1.0, timeScale: 1 }, 1);

        threeRefs.current = {
          scene, camera, renderer, cssRenderer, orbit,
          darkPlasticMaterial, cameraMaterial, baseMetalMaterial, logoMaterial,
          screenMaterial, keyboardMaterial, macGroup, lidGroup, bottomGroup,
          lightHolder, screenLight, pmrem
        };
        timelines.current = { mainTl, laptopAppearTl, laptopOpeningTl, screenOnTl, cameraOnTl, floatingTl };

        const tmpQ = new THREE.Quaternion();
        const tmpP = new THREE.Vector3();
        const screenNormalLocal = new THREE.Vector3(0, 0, -1);

        const renderLoop = () => {
          orbit.update();
          lightHolder.quaternion.copy(camera.quaternion);

          if (ifrObjRef.current && screenMeshRef.current) {
            screenMeshRef.current.getWorldQuaternion(tmpQ);
            const worldNormal = screenNormalLocal.clone().applyQuaternion(tmpQ);
            const screenPos = screenMeshRef.current.getWorldPosition(tmpP);
            const toCam = camera.position.clone().sub(screenPos).normalize();
            const facing = worldNormal.dot(toCam) > 0;
            const showPage = facing && !camOnRef.current;
            ifrObjRef.current.element.style.visibility = showPage ? "visible" : "hidden";
          }

          renderer.render(scene, camera);
          cssRenderer.render(scene, camera);
          requestAnimationFrame(renderLoop);
        };
        renderLoop();

        const updateSceneSize = () => {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
          cssRenderer.setSize(window.innerWidth, window.innerHeight);
        };
        updateSceneSize();
        window.addEventListener("resize", updateSceneSize);

        const toScreen = (v, out) => {
          out.copy(v).project(camera);
          return {
            x: (out.x + 1) * 0.5 * window.innerWidth,
            y: (1 - out.y) * 0.5 * window.innerHeight
          };
        };
        const vTemp = new THREE.Vector3();
        const getScreenQuad2D = () => {
          if (!screenMeshRef.current) return [];
          const hw = screenSize[0] / 2, hh = screenSize[1] / 2;
          const corners = [
            new THREE.Vector3(-hw, -hh, 0),
            new THREE.Vector3( hw, -hh, 0),
            new THREE.Vector3( hw,  hh, 0),
            new THREE.Vector3(-hw,  hh, 0),
          ].map(p => screenMeshRef.current.localToWorld(p.clone()));
          return corners.map(p => toScreen(p, vTemp));
        };
        const pointInPoly = (pt, poly) => {
          if (poly.length < 3) return false;
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
              (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-9) + xi);
            if (intersect) inside = !inside;
          }
          return inside;
        };
        const onMove = (e) => {
          if (camOnRef.current) {
            cssRenderer.domElement.style.pointerEvents = "none";
            return;
          }
          const poly = getScreenQuad2D();
          const inside = pointInPoly({ x: e.clientX, y: e.clientY }, poly);
          cssRenderer.domElement.style.pointerEvents = inside ? "auto" : "none";
        };
        window.addEventListener("mousemove", onMove);

        const waitForPlaying = () =>
          new Promise((resolve) => {
            if (videoEl.readyState >= 2 && !videoEl.paused) return resolve();
            const onPlay = () => { cleanup(); resolve(); };
            const cleanup = () => videoEl.removeEventListener("playing", onPlay);
            videoEl.addEventListener("playing", onPlay, { once: true });
          });

        api.current.setCamera = async (v) => {
          camOnRef.current = v;
          if (ifrObjRef.current?.element) {
            ifrObjRef.current.element.style.visibility = v ? "hidden" : "visible";
            ifrObjRef.current.element.style.pointerEvents = v ? "none" : "auto";
          }
          cssRenderer.domElement.style.pointerEvents = "none";

          if (v) {
            try {
              threeRefs.current.screenMaterial.map = null;
              threeRefs.current.screenMaterial.needsUpdate = true;
              gsap.to(threeRefs.current.screenLight, { duration: 0.1, intensity: 0 });

              if (!videoEl.srcObject && navigator.mediaDevices?.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({
                  video: { width: 1280, height: 720, facingMode: "user" },
                  audio: false
                });
                videoEl.srcObject = stream;
              }
              try { await videoEl.play(); } catch {}
              await waitForPlaying();

              const camTex = new THREE.VideoTexture(videoEl);
              camTex.flipY = false;
              threeRefs.current.screenMaterial.map = camTex;
              threeRefs.current.screenMaterial.needsUpdate = true;

              gsap.to(timelines.current.screenOnTl, { duration: 0.2, progress: 1 });
              timelines.current.cameraOnTl.play();
            } catch (err) {
              console.error("Webcam error", err);
            }
          } else {
            timelines.current.cameraOnTl.reverse();
            gsap.to(threeRefs.current.screenLight, { duration: 0.12, intensity: 0 });
            gsap.to(threeRefs.current.screenMaterial, { duration: 0.12, opacity: 0 });

            const stream = videoEl.srcObject;
            if (stream && stream.getTracks) stream.getTracks().forEach(t => t.stop());
            videoEl.srcObject = null;
            threeRefs.current.screenMaterial.map = null;
            threeRefs.current.screenMaterial.needsUpdate = true;
          }
        };

        const cleanup = () => {
          window.removeEventListener("resize", updateSceneSize);
          window.removeEventListener("mousemove", onMove);
          if (videoEl?.srcObject) {
            const tracks = videoEl.srcObject.getTracks?.() || [];
            tracks.forEach(t => t.stop());
          }
          pmrem.dispose();
          renderer.dispose();
          cssRenderer.domElement?.remove();
        };
        (wrapRef.current || window).cleanupLaptop = cleanup;
      },
      undefined,
      (err) => console.error("GLTF load error:", err)
    );

    // =========================
    // CARD: animations + tilt + particles (CARD ONLY)
    // =========================
    const card = cardRef.current;
    const wrap = cardWrapRef.current;
    const cardParticles = cardParticlesRef.current;

    // Word-by-word continuous animation
    const targets = wrap?.querySelectorAll(".policy-animate");
    if (targets && targets.length) {
      targets.forEach((node, idx) => {
        const split = new SplitType(node, { types: "words, lines" });
        animatedNodes.current.push(split);

        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
        tl.fromTo(
          split.words,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.45, ease: "power3.out", stagger: 0.06, delay: 0.15 + idx * 0.1 }
        )
        .to(split.words, {
          opacity: 0.4, duration: 0.6, ease: "power2.out",
          stagger: { each: 0.03, from: "end" }
        }, "+=1.1");
        animateTimelines.current.push(tl);
      });
    }

    // Card hover tilt
    const MAX_RX = 6, MAX_RY = 10;
    const onMoveTilt = (e) => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      const rotY = gsap.utils.clamp(-1, 1, dx) * MAX_RY;
      const rotX = gsap.utils.clamp(-1, 1, -dy) * MAX_RX;
      gsap.to(card, {
        rotationX: rotX,
        rotationY: rotY,
        transformPerspective: 900,
        transformOrigin: "center",
        scale: 1.02,
        duration: 0.25,
        ease: "power2.out",
      });
    };
    const onLeaveTilt = () => {
      gsap.to(card, { rotationX: 0, rotationY: 0, scale: 1, duration: 0.35, ease: "power2.out" });
    };
    card.addEventListener("mousemove", onMoveTilt);
    card.addEventListener("mouseleave", onLeaveTilt);

    // Particles (only within the card)
    const rand = (min, max) => Math.random() * (max - min) + min;
    const getRandomTransitionValue = () => `${rand(-200, 200)}px`;
    let rafPending = false;

    const addSpark = (host, x, y) => {
      if (!host) return;
      const dot = document.createElement("i");
      dot.className = "spark";
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      dot.style.transform = `scale(${rand(1, 3)})`;
      dot.style.setProperty("--x", getRandomTransitionValue());
      dot.style.setProperty("--y", getRandomTransitionValue());

      // pick a token color (from card CSS vars)
      const styles = getComputedStyle(card);
      const palette = [
        styles.getPropertyValue("--token1").trim() || "#5B8CFF",
        styles.getPropertyValue("--token2").trim() || "#22D3EE",
        styles.getPropertyValue("--token3").trim() || "#A78BFA",
      ];
      const chosen = palette[Math.floor(Math.random() * palette.length)];
      dot.style.setProperty("--spark-color", chosen);

      host.appendChild(dot);
      setTimeout(() => { host.contains(dot) && host.removeChild(dot); }, 2000);
    };

    const cardSparkHandler = (e) => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const rect = cardParticles.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        addSpark(cardParticles, x, y);
      });
    };
    card.addEventListener("mousemove", cardSparkHandler);

    return () => {
      (wrapRef.current?.cleanupLaptop || (() => {}))();

      animateTimelines.current.forEach(t => t.kill());
      animateTimelines.current = [];
      animatedNodes.current.forEach(s => s.revert());
      animatedNodes.current = [];

      if (card) {
        card.removeEventListener("mousemove", onMoveTilt);
        card.removeEventListener("mouseleave", onLeaveTilt);
        card.removeEventListener("mousemove", cardSparkHandler);
      }
    };
  }, []); // run once

  // Camera toggle
  const toggleCamera = async () => {
    const next = !camOn;
    setCamOn(next);
    await api.current.setCamera(next);
  };

  return (
    <section ref={wrapRef} className="dsah-3d-wrap" aria-label="3D Laptop Section">
      <canvas id="laptop" ref={canvasRef} />

      {/* Card wrapper anchors INSIDE the component (scrolls with the section) */}
      <div ref={cardWrapRef} className="dsah-card-wrap">
        <div ref={cardRef} className="dsah-card" role="region" aria-label="Camera controls and policy">
          <div className="dsah-particles" ref={cardParticlesRef} aria-hidden="true" />
          <div className="dsah-card-top">
            <h3 className="dsah-ctrl-title">Our Policy</h3>
            <button
              className={`dsah-cam-switch ${camOn ? "is-on" : ""}`}
              onClick={toggleCamera}
              aria-pressed={camOn}
              title={`Camera ${camOn ? "On" : "Off"}`}
              type="button"
            >
              <input className="dsah-cam-check" type="checkbox" readOnly checked={camOn} />
              <label className="dsah-cam-label"><span /></label>
            </button>
          </div>

          <div className="dsah-policy">
            <ul className="policy-list policy-animate">
              <li><strong>Continuous improvement:</strong> we iterate frequently to enhance accuracy, safety, and responsiveness.</li>
              <li><strong>User feedback first:</strong> patient and clinician input directly informs features and prioritization.</li>
              <li><strong>Responsible training:</strong> Continuously training our medical staff to ensure that they are well acquainted with the latest AI tools.</li>
              <li><strong>Operational excellence:</strong> we monitor reliability, accuracy, and latency to keep care teams moving.</li>
            </ul>
            <p className="policy-para policy-animate">
              We are continuously improving and enhancing our AI-powered solutions to deliver excellent services to patients and doctors alike.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}


