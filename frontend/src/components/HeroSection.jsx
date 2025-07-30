import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import "../styles/HeroSection.css"; // make sure styles are added here

const HeroSection = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const particleCount = 500;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 100;
      positions[i + 1] = (Math.random() - 0.5) * 100;
      positions[i + 2] = (Math.random() - 0.5) * 100;
      colors[i] = Math.random();
      colors[i + 1] = Math.random();
      colors[i + 2] = 1.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    const pointLight = new THREE.PointLight(0x00ccff, 1, 100);
    pointLight.position.set(10, 10, 10);
    scene.add(ambientLight);
    scene.add(pointLight);

    camera.position.z = 30;

    let mouseX = 0,
      mouseY = 0;
    document.addEventListener("mousemove", (event) => {
      mouseX = (event.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    });

    function animate() {
      requestAnimationFrame(animate);

      particles.rotation.y += 0.002;
      particles.rotation.x += 0.001;

      const pos = geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] += Math.sin(Date.now() * 0.001 + pos[i]) * 0.01;
        pos[i] += Math.cos(Date.now() * 0.001 + pos[i + 1]) * 0.01;
      }
      geometry.attributes.position.needsUpdate = true;

      camera.position.x += (mouseX * 10 - camera.position.x) * 0.05;
      camera.position.y += (mouseY * 10 - camera.position.y) * 0.05;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }, []);

  return (
    <section className="hero-section">
      <canvas ref={canvasRef} className="hero-canvas" />
      <div className="overlay" />
      <div className="hero-content">
        <h1>Revolutionizing Healthcare with AI</h1>
        <p>
          Discover AI-powered tools that assist doctors, enhance reports, automate data, and guide patients—all in one seamless platform.
        </p>
        <a href="#explore" className="cta-button">Explore Now</a>
      </div>
    </section>
  );
};

export default HeroSection;

