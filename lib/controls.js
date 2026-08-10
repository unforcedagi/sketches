'use strict';
/*
 * SketchControls — shared harness for the sketches in this repo.
 *
 * Usage (classic scripts; load lib/gifenc.js before this file):
 *
 *   SketchControls.attach({
 *     canvas,               // visible canvas element
 *     step,                 // () => void — advance the simulation one tick
 *     draw,                 // (alpha) => void — render; alpha in [0,1] is the
 *                           //   fraction of the next tick elapsed, for optional
 *                           //   interpolation (ignore it if not interpolating)
 *     ticksPerSecond: 60,   // base tick rate at speed 1×
 *   });
 *
 * Adds to the element with id "controls": a speed slider (0.1×–4×) and a
 * "rec gif" button that records 5 s of the canvas at 20 fps, encodes it with
 * gifenc at half resolution, and downloads it.
 */
const SketchControls = (() => {

  function attach(opts) {
    const canvas = opts.canvas;
    const step = opts.step;
    const draw = opts.draw;
    const base = opts.ticksPerSecond || 60;

    let speed = 1;

    const controls = document.getElementById('controls');

    // --- speed slider ---
    const label = document.createElement('label');
    label.innerHTML = 'speed <input type="range" min="-2" max="2" step="0.05" value="0"><span>1.0×</span>';
    const slider = label.querySelector('input');
    const readout = label.querySelector('span');
    slider.oninput = () => {
      speed = Math.pow(2, +slider.value); // 0.25×–4× on a log scale
      readout.textContent = speed.toFixed(2).replace(/0$/, '') + '×';
    };
    controls.appendChild(label);

    // --- gif recorder ---
    const btn = document.createElement('button');
    btn.textContent = 'rec gif';
    controls.appendChild(btn);

    const REC_SECONDS = 5, REC_FPS = 20, REC_SCALE = 0.5;
    let recFrames = null, recTimer = 0, recCanvas = null, recCtx = null;

    btn.onclick = () => {
      if (recFrames) return; // already recording
      recCanvas = document.createElement('canvas');
      recCanvas.width = Math.round(canvas.width * REC_SCALE);
      recCanvas.height = Math.round(canvas.height * REC_SCALE);
      recCtx = recCanvas.getContext('2d', { willReadFrequently: true });
      recFrames = [];
      recTimer = 0;
      btn.disabled = true;
    };

    function captureFrame() {
      recCtx.drawImage(canvas, 0, 0, recCanvas.width, recCanvas.height);
      recFrames.push(recCtx.getImageData(0, 0, recCanvas.width, recCanvas.height));
      btn.textContent = `rec ${(recFrames.length / REC_FPS).toFixed(1)}s`;
      if (recFrames.length >= REC_SECONDS * REC_FPS) {
        const frames = recFrames;
        recFrames = null;
        btn.textContent = 'encoding…';
        // let the button repaint before the encode loop blocks
        setTimeout(() => encode(frames), 20);
      }
    }

    function encode(frames) {
      const gif = GIFEncoder();
      const w = recCanvas.width, h = recCanvas.height;
      let i = 0;
      function encodeOne() {
        const chunkEnd = Math.min(i + 10, frames.length);
        for (; i < chunkEnd; i++) {
          const data = frames[i].data;
          const palette = quantize(data, 256);
          const index = applyPalette(data, palette);
          gif.writeFrame(index, w, h, { palette, delay: Math.round(1000 / REC_FPS) });
        }
        btn.textContent = `encoding ${Math.round(100 * i / frames.length)}%`;
        if (i < frames.length) { setTimeout(encodeOne, 0); return; }
        gif.finish();
        const blob = new Blob([gif.bytes()], { type: 'image/gif' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (document.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'sketch') + '.gif';
        a.click();
        URL.revokeObjectURL(a.href);
        btn.textContent = 'rec gif';
        btn.disabled = false;
      }
      encodeOne();
    }

    // --- main loop: fixed-tick accumulator, render every display frame ---
    const MAX_TICKS_PER_FRAME = 8;
    let acc = 0, last = performance.now();

    function frame(now) {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1; // tab-switch clamp
      acc += dt * speed;
      const tickDur = 1 / base;
      let ticks = 0;
      while (acc >= tickDur && ticks < MAX_TICKS_PER_FRAME) {
        step();
        acc -= tickDur;
        ticks++;
      }
      if (ticks === MAX_TICKS_PER_FRAME) acc = 0; // shed backlog, don't spiral
      draw(Math.min(1, acc / tickDur));

      if (recFrames) {
        recTimer += dt; // wall-clock cadence so the gif matches what you saw
        if (recTimer >= 1 / REC_FPS) {
          recTimer -= 1 / REC_FPS;
          captureFrame();
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  return { attach };
})();
