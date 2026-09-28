import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

/**
 * Animated background canvas featuring:
 * 1. Large Fisheye Lens styled curved blueprint grid
 * 2. Subtle optical center tracking with mouse parallax
 * 3. Deep space twinkling constellation starfield
 */
export const StarField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrame: number;
    let stars: Star[] = [];
    let lastDrawTime = 0;
    const fpsInterval = 1000 / 30; // Cap at 30 FPS for massive CPU/GPU savings
    
    // Optical & mouse tracking
    let targetFocalX = window.innerWidth / 2;
    let targetFocalY = window.innerHeight / 2;
    let focalX = targetFocalX;
    let focalY = targetFocalY;
    let mouseX = targetFocalX;
    let mouseY = targetFocalY;
    let time = 0;

    const initStars = () => {
      const density = 14000;
      const count = Math.floor((canvas.width * canvas.height) / density);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.1 + 0.2,
        baseOpacity: Math.random() * 0.5 + 0.15,
        twinkleSpeed: Math.random() * 0.004 + 0.001,
        twinkleOffset: Math.random() * Math.PI * 2,
      }));
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars();
    };

    // Fisheye Lens Projection
    const projectFisheye = (x: number, y: number, fx: number, fy: number, maxRadius: number) => {
      const dx = x - fx;
      const dy = y - fy;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) return { x, y };

      const norm = dist / maxRadius;
      // Barrel fisheye expansion: curves lines radially outwards from the optical center
      const factor = 1 + 0.34 * Math.pow(norm, 2);
      return {
        x: fx + dx * factor,
        y: fy + dy * factor,
      };
    };

    // Offscreen canvas for caching curved fisheye grid
    let gridCanvas: HTMLCanvasElement | null = document.createElement('canvas');
    let gridCtx: CanvasRenderingContext2D | null = gridCanvas.getContext('2d');
    let cachedFocalX = -9999;
    let cachedFocalY = -9999;

    const renderGridToCache = (fx: number, fy: number) => {
      if (!gridCanvas || !gridCtx) return;
      const w = canvas.width;
      const h = canvas.height;
      if (gridCanvas.width !== w || gridCanvas.height !== h) {
        gridCanvas.width = w;
        gridCanvas.height = h;
      }
      gridCtx.clearRect(0, 0, w, h);

      const maxRadius = Math.hypot(w, h) * 0.65;
      const gridSize = 120;
      const step = 40;

      const gridGradient = gridCtx.createRadialGradient(fx, fy, 40, fx, fy, maxRadius);
      gridGradient.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
      gridGradient.addColorStop(0.4, 'rgba(148, 163, 184, 0.16)');
      gridGradient.addColorStop(0.85, 'rgba(148, 163, 184, 0.08)');
      gridGradient.addColorStop(1, 'rgba(148, 163, 184, 0.02)');

      gridCtx.save();
      gridCtx.strokeStyle = gridGradient;
      gridCtx.lineWidth = 1.1;

      // Vertical lines
      const startX = Math.floor((fx % gridSize) - gridSize * 3);
      const endX = w + gridSize * 3;
      for (let gx = startX; gx <= endX; gx += gridSize) {
        gridCtx.beginPath();
        let first = true;
        for (let gy = -gridSize * 2; gy <= h + gridSize * 2; gy += step) {
          const pt = projectFisheye(gx, gy, fx, fy, maxRadius);
          if (first) {
            gridCtx.moveTo(pt.x, pt.y);
            first = false;
          } else {
            gridCtx.lineTo(pt.x, pt.y);
          }
        }
        gridCtx.stroke();
      }

      // Horizontal lines
      const startY = Math.floor((fy % gridSize) - gridSize * 3);
      const endY = h + gridSize * 3;
      for (let gy = startY; gy <= endY; gy += gridSize) {
        gridCtx.beginPath();
        let first = true;
        for (let gx = -gridSize * 2; gx <= w + gridSize * 2; gx += step) {
          const pt = projectFisheye(gx, gy, fx, fy, maxRadius);
          if (first) {
            gridCtx.moveTo(pt.x, pt.y);
            first = false;
          } else {
            gridCtx.lineTo(pt.x, pt.y);
          }
        }
        gridCtx.stroke();
      }

      // Nodes
      gridCtx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      for (let gx = startX; gx <= endX; gx += gridSize) {
        for (let gy = startY; gy <= endY; gy += gridSize) {
          const pt = projectFisheye(gx, gy, fx, fy, maxRadius);
          if (pt.x >= -10 && pt.x <= w + 10 && pt.y >= -10 && pt.y <= h + 10) {
            gridCtx.beginPath();
            gridCtx.arc(pt.x, pt.y, 1.6, 0, Math.PI * 2);
            gridCtx.fill();
          }
        }
      }
      gridCtx.restore();
    };

    let isAnimating = false;
    let lastInteractionTime = performance.now();

    const startAnimation = () => {
      lastInteractionTime = performance.now();
      if (!isAnimating && !document.hidden) {
        isAnimating = true;
        lastDrawTime = performance.now();
        animFrame = requestAnimationFrame(draw);
      }
    };

    const draw = (now: number) => {
      if (document.hidden) {
        isAnimating = false;
        return;
      }

      const elapsed = now - lastDrawTime;
      if (elapsed < fpsInterval) {
        animFrame = requestAnimationFrame(draw);
        return;
      }
      lastDrawTime = now - (elapsed % fpsInterval);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 1;

      // Smooth dampening for the fisheye optical focal center
      const diffX = targetFocalX - focalX;
      const diffY = targetFocalY - focalY;
      focalX += diffX * 0.04;
      focalY += diffY * 0.04;

      // Re-render cached grid only when focal center shifts noticeably
      if (Math.hypot(focalX - cachedFocalX, focalY - cachedFocalY) > 0.8) {
        renderGridToCache(focalX, focalY);
        cachedFocalX = focalX;
        cachedFocalY = focalY;
      }

      // Fast single-pass blit of cached curved grid
      if (gridCanvas) {
        ctx.drawImage(gridCanvas, 0, 0);
      }

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const dx = (mouseX - cx) / cx;
      const dy = (mouseY - cy) / cy;

      for (const star of stars) {
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
        const opacity = Math.max(0.06, Math.min(1, star.baseOpacity + twinkle * 0.15));

        // Parallax effect
        const parallaxScale = star.size * 1.8;
        const px = star.x + dx * parallaxScale;
        const py = star.y + dy * parallaxScale;

        // Edge wrapping
        const wx = ((px % w) + w) % w;
        const wy = ((py % h) + h) % h;

        ctx.beginPath();
        ctx.arc(wx, wy, star.size, 0, Math.PI * 2);

        // Dynamic star coloring
        const hue = star.size > 0.9 ? 210 : 220;
        ctx.fillStyle = `hsla(${hue}, 80%, 92%, ${opacity})`;
        ctx.fill();

        // Star glow effect for brighter stars
        if (star.size > 0.85) {
          ctx.beginPath();
          ctx.arc(wx, wy, star.size * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 80%, 80%, ${opacity * 0.12})`;
          ctx.fill();
        }
      }

      // If idle for > 1.5s and focal center has settled, sleep the RAF loop to save 100% CPU
      const isIdle = now - lastInteractionTime > 1500;
      const isSettled = Math.hypot(diffX, diffY) < 0.2;
      if (isIdle && isSettled) {
        isAnimating = false;
        return;
      }

      animFrame = requestAnimationFrame(draw);
    };

    let mouseMoveTicking = false;
    const handleMouseMove = (e: MouseEvent) => {
      startAnimation();
      if (!mouseMoveTicking) {
        requestAnimationFrame(() => {
          mouseX = e.clientX;
          mouseY = e.clientY;
          targetFocalX = canvas.width / 2 + (mouseX - canvas.width / 2) * 0.25;
          targetFocalY = canvas.height / 2 + (mouseY - canvas.height / 2) * 0.25;
          mouseMoveTicking = false;
        });
        mouseMoveTicking = true;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animFrame);
        isAnimating = false;
      } else {
        startAnimation();
      }
    };

    resize();
    startAnimation();

    window.addEventListener('resize', () => {
      resize();
      startAnimation();
    });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      gridCanvas = null;
      gridCtx = null;
    };
  }, []);


  return <canvas ref={canvasRef} className="starfield-canvas" aria-hidden="true" />;
};
