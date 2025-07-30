/* eslint-disable react-hooks/exhaustive-deps */
// ParticleThankYou.jsx
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap } from "gsap";

const ParticleThankYou = ({ message, onComplete }) => {
  const canvasRef = useRef(null);
  const particleRef = useRef(null);
  const count = 12000;

  useEffect(() => {
    let scene, camera, renderer, particles;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1.5, 0.1, 1000);
    camera.position.z = 25;
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(300, 300);
    renderer.setClearColor(0x000000, 0);
    canvasRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.BufferGeometry();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 20 + 10;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;

      const color = new THREE.Color();
      color.setHSL(0.6, 0.7, 0.7);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });

    particles = new THREE.Points(geometry, material);
    particleRef.current = particles;
    scene.add(particles);

    const animate = () => {
      requestAnimationFrame(animate);
      particles.rotation.y += 0.002;
      renderer.render(scene, camera);
    };
    animate();

    morphToText(message);

    function morphToText(text) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const fontSize = 100;
      const padding = 20;
      ctx.font = `bold ${fontSize}px Inter`;
      const textMetrics = ctx.measureText(text);
      canvas.width = textMetrics.width + padding * 2;
      canvas.height = fontSize + padding * 2;
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${fontSize}px Inter`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const points = [];

      for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i] > 128) {
          const x = (i / 4) % canvas.width;
          const y = Math.floor(i / 4 / canvas.width);
          if (Math.random() < 0.4) {
            points.push({
              x: (x - canvas.width / 2) / 10,
              y: -(y - canvas.height / 2) / 10,
            });
          }
        }
      }

      const newPositions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        if (i < points.length) {
          newPositions[i * 3] = points[i].x;
          newPositions[i * 3 + 1] = points[i].y;
          newPositions[i * 3 + 2] = 0;
        } else {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * 20 + 10;
          newPositions[i * 3] = Math.cos(angle) * radius;
          newPositions[i * 3 + 1] = Math.sin(angle) * radius;
          newPositions[i * 3 + 2] = (Math.random() - 0.5) * 10;
        }
      }

      for (let i = 0; i < positions.length; i += 3) {
        gsap.to(geometry.attributes.position.array, {
          [i]: newPositions[i],
          [i + 1]: newPositions[i + 1],
          [i + 2]: newPositions[i + 2],
          duration: 2,
          ease: "power2.inOut",
          onUpdate: () => {
            geometry.attributes.position.needsUpdate = true;
          },
        });
      }

      setTimeout(() => {
        if (onComplete) onComplete();
      }, 4000);
    }

    return () => {
      renderer.dispose();
      canvasRef.current.innerHTML = "";
    };
  }, [message]);

  return <div className="thankyou-canvas" ref={canvasRef}></div>;
};

export default ParticleThankYou;
