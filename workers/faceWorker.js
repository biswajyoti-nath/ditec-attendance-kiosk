import * as faceapi from 'face-api.js';

// face-api checks all three DOM constructors with `instanceof`, even when the
// input is an OffscreenCanvas. Dedicated workers do not expose Image or Video,
// so provide inert constructors rather than passing undefined/null.
const WorkerImage = typeof Image === 'function' ? Image : class WorkerImage {};
const WorkerVideo = typeof Video === 'function' ? Video : class WorkerVideo {};
const WorkerImageData = typeof ImageData === 'function' ? ImageData : class WorkerImageData {};

// A webpack worker bundle can define `window`, so do not use it to detect the
// worker context. face-api.js does not auto-detect Web Workers and otherwise
// starts without an environment (`getEnv - environment is not defined`).
// This file is only loaded by `new Worker(...)`, so configure it unconditionally.
{
  faceapi.env.setEnv({
    Canvas: OffscreenCanvas,
    CanvasRenderingContext2D: typeof OffscreenCanvasRenderingContext2D !== 'undefined' ? OffscreenCanvasRenderingContext2D : undefined,
    Image: WorkerImage,
    ImageData: WorkerImageData,
    Video: WorkerVideo,
    createCanvasElement: () => new OffscreenCanvas(1, 1),
    createImageElement: () => new WorkerImage(),
    fetch: typeof fetch !== 'undefined' ? fetch : undefined,
    readFile: () => { throw new Error('readFile not supported'); },
  });

  faceapi.env.monkeyPatch({
    Canvas: OffscreenCanvas,
    createCanvasElement: () => new OffscreenCanvas(1, 1),
    Image: WorkerImage,
    ImageData: WorkerImageData,
  });
}

let modelsLoaded = false;
let scanCanvas = null;
let scanContext = null;

const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  // 224 is substantially cheaper than the 416px default while still retaining
  // enough detail for a close, front-facing kiosk scan.
  inputSize: 224,
  scoreThreshold: 0.5,
});

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'LOAD_MODELS') {
    try {
      const MODEL_URL = payload.modelUrl; 
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
      self.postMessage({ type: 'MODELS_LOADED' });
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: 'Failed to load models: ' + err.message });
    }
  }

  if (type === 'DETECT_FACE') {
    if (!modelsLoaded) {
      payload?.frame?.close();
      return;
    }
    
    try {
      const { frame, imageData } = payload;
      if (!frame && !imageData) throw new Error('Missing face-recognition frame');

      // The main thread transfers ownership of this already-resized bitmap.
      // Reuse the canvas and its context across requests to avoid allocations.
      const width = frame?.width ?? imageData.width;
      const height = frame?.height ?? imageData.height;
      if (!scanCanvas || scanCanvas.width !== width || scanCanvas.height !== height) {
        scanCanvas = new OffscreenCanvas(width, height);
        scanContext = scanCanvas.getContext('2d');
      }
      if (frame) {
        scanContext.drawImage(frame, 0, 0);
        frame.close();
      } else {
        scanContext.putImageData(imageData, 0, 0);
      }

      const detection = await faceapi
        .detectSingleFace(scanCanvas, DETECTOR_OPTIONS)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        // Serialize descriptor since we cannot pass complex class instances over postMessage
        self.postMessage({ 
          type: 'FACE_DETECTED', 
          descriptor: Array.from(detection.descriptor) 
        });
      } else {
        self.postMessage({ type: 'NO_FACE' });
      }
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: 'Detection failed: ' + err.message });
    }
  }
};
