import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import jsQR from 'jsqr';
import { useRouter } from 'next/router';

/**
 * Main Kiosk Interface Component.
 * Handles the state machine for the attendance flow: LOADING -> QR SCAN -> FACE SCAN -> SUCCESS.
 * Offloads heavy face recognition tasks to a Web Worker to maintain UI responsiveness (60fps).
 *
 * @returns {JSX.Element} The rendered kiosk interface.
 */
export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState('LOADING_MODELS'); // 'LOADING_MODELS', 'SCANNING_QR', 'SCANNING_FACE', 'PROCESSING', 'SUCCESS', 'ERROR'
  const [user, setUser] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [attendanceType, setAttendanceType] = useState('IN');
  const [faceStatus, setFaceStatus] = useState('');
  const [scanNotice, setScanNotice] = useState('');
  const [isTestMode, setIsTestMode] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const workerRef = useRef(null);
  
  // State refs for the animation loop and worker callbacks
  const stepRef = useRef(step);
  const userRef = useRef(user);
  const attendanceTypeRef = useRef(attendanceType);
  const faceAttemptsRef = useRef(0);
  const isWorkerBusyRef = useRef(false);
  const scanNoticeTimeoutRef = useRef(null);
  const blockedQrIdRef = useRef(null);

  // Keep recognition work small enough for responsive kiosk scanning. This is
  // independent of the original camera stream and of uploaded face baselines.
  const FACE_SCAN_MAX_DIMENSION = 320;

  // Keep refs in sync
  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { attendanceTypeRef.current = attendanceType; }, [attendanceType]);

  // 1. Initialize Worker & Load Models
  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/faceWorker.js', import.meta.url));
    
    workerRef.current.onmessage = (e) => {
      const { type, descriptor, error } = e.data;
      
      if (type === 'MODELS_LOADED') {
        setStep('SCANNING_QR');
        startCamera();
      } else if (type === 'FACE_DETECTED') {
        isWorkerBusyRef.current = false;
        handleFaceMatch(descriptor);
      } else if (type === 'NO_FACE') {
        isWorkerBusyRef.current = false;
        if (stepRef.current === 'SCANNING_FACE') {
          setFaceStatus('No face detected. Please hold still...');
        }
      } else if (type === 'ERROR') {
        isWorkerBusyRef.current = false;
        console.error(error);
        setErrorMsg(error || 'The face-recognition worker failed to start.');
        setStep('ERROR');
      }
    };

    workerRef.current.onerror = (event) => {
      console.error('Face-recognition worker crashed:', event.message);
      isWorkerBusyRef.current = false;
      setErrorMsg('The face-recognition worker could not start. Please reload the page.');
      setStep('ERROR');
    };

    workerRef.current.postMessage({ 
      type: 'LOAD_MODELS', 
      payload: { modelUrl: window.location.origin + '/models' } 
    });

    return () => {
      stopCamera();
      if (scanNoticeTimeoutRef.current) clearTimeout(scanNoticeTimeoutRef.current);
      workerRef.current?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Start Unified Camera
  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Camera access requires localhost or HTTPS.');
      setStep('ERROR');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onplay = () => {
          requestRef.current = requestAnimationFrame(processFrame);
        };
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Error accessing webcam.');
      setStep('ERROR');
    }
  };

  const stopCamera = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  const sendFaceImageDataFallback = (video, canvas) => {
    if (stepRef.current !== 'SCANNING_FACE' || !workerRef.current) {
      isWorkerBusyRef.current = false;
      return;
    }

    const scale = Math.min(1, FACE_SCAN_MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    workerRef.current.postMessage({ type: 'DETECT_FACE', payload: { imageData } });
  };

  // 3. Process Video Frames (Main Thread loops at 60fps)
  const processFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      requestRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const currentStep = stepRef.current;

    if (currentStep === 'SCANNING_QR') {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
      if (code && code.data) {
        // After a policy rejection, require the operator to remove that QR
        // before it can be scanned again. Otherwise a QR held in front of the
        // camera immediately re-enters face mode and blocks the face itself.
        if (blockedQrIdRef.current !== code.data) {
          handleQRFound(code.data);
          return; // Stop pulling frames momentarily
        }
      } else {
        blockedQrIdRef.current = null;
      }
    } else if (currentStep === 'SCANNING_FACE' && !isWorkerBusyRef.current) {
      // Transfer a downscaled bitmap instead of copying full-resolution pixels
      // through ImageData and then cloning them into the worker.
      isWorkerBusyRef.current = true;
      const scale = Math.min(1, FACE_SCAN_MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
      const resizeWidth = Math.max(1, Math.round(video.videoWidth * scale));
      const resizeHeight = Math.max(1, Math.round(video.videoHeight * scale));

      if (typeof createImageBitmap !== 'function') {
        sendFaceImageDataFallback(video, canvas);
      } else {
        createImageBitmap(video, { resizeWidth, resizeHeight, resizeQuality: 'low' })
        .then((frame) => {
          if (stepRef.current !== 'SCANNING_FACE' || !workerRef.current) {
            frame.close();
            isWorkerBusyRef.current = false;
            return;
          }
          workerRef.current.postMessage({ type: 'DETECT_FACE', payload: { frame } }, [frame]);
        })
        .catch((error) => {
          // Some mobile browsers cannot make a transferable bitmap directly
          // from a video element. Keep scanning with the compatible path.
          console.warn('Falling back to ImageData face frames:', error);
          sendFaceImageDataFallback(video, canvas);
        });
      }
    }

    if (stepRef.current === currentStep) {
      requestRef.current = requestAnimationFrame(processFrame);
    }
  };

  const handleQRFound = async (scannedId) => {
    setStep('PROCESSING');
    try {
      const res = await fetch(`/api/users/${scannedId}`);
      if (!res.ok) throw new Error('Invalid QR Code or User Not Found');
      const data = await res.json();
      
      setUser(data);
      setFaceStatus('QR valid! Please look at the camera...');
      faceAttemptsRef.current = 0;
      isWorkerBusyRef.current = false;
      
      setTimeout(() => {
        setStep('SCANNING_FACE');
        requestRef.current = requestAnimationFrame(processFrame);
      }, 1500);

    } catch (err) {
      setErrorMsg(err.message);
      setStep('ERROR');
      resetAfterDelay();
    }
  };

  // Helper to calculate distance without importing face-api.js on the main thread
  const euclideanDistance = (arr1, arr2) => {
    return Math.sqrt(arr1.reduce((sum, val, i) => sum + Math.pow(val - arr2[i], 2), 0));
  };

  const handleFaceMatch = async (detectedDescriptor) => {
    const currentUser = userRef.current;
    if (stepRef.current !== 'SCANNING_FACE' || !currentUser || !currentUser.descriptors) return;

    const storedDescriptors = currentUser.descriptors.map(d => new Float32Array(Object.values(d)));
    let bestMatchDistance = 1.0;
    
    for (const descriptor of storedDescriptors) {
      const distance = euclideanDistance(detectedDescriptor, descriptor);
      if (distance < bestMatchDistance) {
        bestMatchDistance = distance;
      }
    }

    if (bestMatchDistance <= 0.55) {
      setFaceStatus('Face Match Successful!');
      setStep('PROCESSING'); // Hides the green scanning overlay
      stepRef.current = 'PROCESSING'; // Lock immediately to stop camera pulling more frames
      await markAttendance(currentUser.id);
    } else {
      faceAttemptsRef.current += 1;
      if (faceAttemptsRef.current >= 4) {
        setErrorMsg('Face Verification Failed after multiple attempts.');
        setStep('ERROR');
        resetAfterDelay();
      } else {
        setFaceStatus(`Face mismatch (dist: ${bestMatchDistance.toFixed(2)}). Attempt ${faceAttemptsRef.current}/4`);
      }
    }
  };

  const isSubmittingRef = useRef(false);

  const markAttendance = async (userId) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: attendanceTypeRef.current, isTest: isTestMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400 || res.status === 409) {
          returnToQrScanning(data.error || 'Attendance cannot be marked right now.', userId);
          return;
        }
        throw new Error(data.error || 'Failed to mark attendance');
      }
      
      router.push(`/success?name=${encodeURIComponent(userRef.current.name)}&type=${attendanceTypeRef.current}`);
    } catch (err) {
      setErrorMsg(err.message);
      setStep('ERROR');
      resetAfterDelay();
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const resetAfterDelay = () => {
    setTimeout(() => {
      returnToQrScanning();
    }, 4000);
  };

  const returnToQrScanning = (notice = '', blockedQrId = null) => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    // Keep the ref in sync immediately; waiting for React's effect can leave
    // one animation-frame callback observing the previous processing state.
    stepRef.current = 'SCANNING_QR';
    isWorkerBusyRef.current = false;
    setStep('SCANNING_QR');
    setUser(null);
    setErrorMsg('');
    setSuccessMsg('');
    setFaceStatus('');
    setScanNotice(notice);
    blockedQrIdRef.current = blockedQrId;

    if (scanNoticeTimeoutRef.current) clearTimeout(scanNoticeTimeoutRef.current);
    if (notice) {
      scanNoticeTimeoutRef.current = setTimeout(() => setScanNotice(''), 5000);
    }
    requestRef.current = requestAnimationFrame(processFrame);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans text-slate-100">
      <Head>
        <title>Kiosk - Attendance System</title>
      </Head>

      <main className="w-full max-w-lg bg-slate-800 rounded-3xl shadow-2xl p-8 border border-slate-700/50 relative overflow-hidden backdrop-blur-xl">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-slate-100 mb-2 tracking-tight">Access Terminal</h1>
          <p className="text-slate-400">Scan your secure ID</p>
        </div>

        {/* Action Toggle (In/Out) */}
        {(step === 'SCANNING_QR' || step === 'LOADING_MODELS') && (
          <div className="flex justify-center space-x-4 mb-6 bg-slate-900/50 p-2 rounded-2xl">
            <button
              onClick={() => setAttendanceType('IN')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                attendanceType === 'IN' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Punch IN (11 AM)
            </button>
            <button
              onClick={() => setAttendanceType('OUT')}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                attendanceType === 'OUT' ? 'bg-slate-600 text-white shadow-lg shadow-slate-600/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Punch OUT (5 PM)
            </button>
          </div>
        )}

        {/* Demo Mode Toggle */}
        <div className="flex justify-end mb-4">
          <label className="flex items-center space-x-2 cursor-pointer bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <span className="text-xs font-semibold text-slate-400">Demo Mode (No Time Limits):</span>
            <input 
              type="checkbox" 
              checked={isTestMode} 
              onChange={(e) => setIsTestMode(e.target.checked)}
              className="form-checkbox h-4 w-4 text-sky-500 rounded bg-slate-700 border-slate-600 focus:ring-sky-500 transition-all"
            />
          </label>
        </div>

        {/* Video Container */}
        <div className={`relative rounded-2xl overflow-hidden shadow-lg border-4 transition-all duration-300 ${
            step === 'LOADING_MODELS' ? 'hidden' :
            step === 'SCANNING_FACE' ? 'border-sky-500 bg-black' : 
            step === 'SCANNING_QR' ? 'border-emerald-500 bg-black' : 'border-slate-700 bg-black opacity-50 grayscale'
          }`}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full max-w-md h-auto object-cover transform -scale-x-100"
          />
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Overlays */}
          {step === 'SCANNING_QR' && (
            <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/50 m-6 rounded-xl border-dashed animate-pulse flex items-center justify-center">
               <span className="bg-slate-900/80 text-emerald-400 px-4 py-1 rounded-full text-sm font-medium">Scanning for QR</span>
            </div>
          )}
          {step === 'SCANNING_FACE' && (
            <div className="absolute inset-0 pointer-events-none border-2 border-sky-500/50 m-4 rounded-xl flex items-end justify-center pb-4">
               <span className="bg-slate-900/80 text-sky-400 px-4 py-1 rounded-full text-sm font-medium">{faceStatus || 'Analyzing face...'}</span>
            </div>
          )}
        </div>

        {/* Status UI */}
        <div className="mt-6 flex flex-col items-center justify-center min-h-[100px]">
          {step === 'SCANNING_QR' && scanNotice && (
            <div role="alert" className="w-full bg-rose-900/40 border-2 border-rose-500 rounded-2xl p-5 text-center animation-fade-in">
              <p className="text-rose-200 font-semibold">Attendance action unavailable</p>
              <p className="mt-1 text-rose-100">{scanNotice}</p>
            </div>
          )}

          {step === 'LOADING_MODELS' && (
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 border-4 border-slate-500 border-t-sky-500 rounded-full animate-spin"></div>
              <p className="mt-4 text-slate-400">Initializing AI Background Worker...</p>
            </div>
          )}

          {step === 'PROCESSING' && (
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 border-4 border-slate-500 border-t-sky-500 rounded-full animate-spin"></div>
              <p className="mt-4 text-slate-400">{faceStatus || 'Processing...'}</p>
            </div>
          )}

          {step === 'SUCCESS' && (
            <div className="text-center animation-fade-in w-full bg-emerald-900/30 p-6 rounded-2xl border border-emerald-500/30">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-emerald-500">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Success</h2>
              <p className="text-emerald-300 font-medium">{successMsg}</p>
            </div>
          )}

          {step === 'ERROR' && (
            <div className="text-center animation-fade-in w-full bg-rose-900/30 p-6 rounded-2xl border border-rose-500/30">
              <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-rose-500">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
              <p className="text-rose-300 font-medium">{errorMsg}</p>
            </div>
          )}
        </div>
      </main>
      
      <style jsx global>{`
        .animation-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
