import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import * as faceapi from 'face-api.js';

export default function Admin() {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [descriptors, setDescriptors] = useState([]);
  const [registeredUser, setRegisteredUser] = useState(null);
  
  const [email, setEmail] = useState('');

  const fileInputRef = useRef(null);
  const qrCanvasRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        setStatus('Face models loaded. Ready for photo upload.');
      } catch (error) {
        console.error(error);
        setStatus('Failed to load face models.');
      }
    };
    loadModels();
  }, []);

  const handleManualUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Processing uploaded image...');
    const imgUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = imgUrl;
    img.onload = async () => {
      try {
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && detection.detection.score > 0.5) {
          setDescriptors(prev => {
            const newDesc = [...prev, detection.descriptor];
            setStatus(`Image processed successfully! (${newDesc.length} valid photos uploaded)`);
            return newDesc;
          });
        } else {
          setStatus('No face detected in the uploaded image. Please try a clearer photo.');
        }
      } catch (err) {
        console.error(err);
        setStatus('Error processing uploaded image.');
      }
    };
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const registerUser = async () => {
    if (!name || descriptors.length === 0) {
      setStatus('Name and at least one uploaded photo with a face are required.');
      return;
    }

    setStatus('Registering user...');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          descriptors: descriptors.map(d => Array.from(d))
        }),
      });

      if (!res.ok) throw new Error('Failed to register user');
      const data = await res.json();
      
      setRegisteredUser(data);
      setStatus(`Success! User ${data.name} registered.`);
    } catch (err) {
      setStatus('Error: ' + err.message);
    }
  };

  const downloadQR = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !registeredUser) return;

    // PNG renders consistently in mobile galleries and scanner apps. The
    // off-screen canvas is 1024px with a four-module quiet zone for scanning.
    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus('Unable to prepare the QR image. Please try again.');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${registeredUser.name.replace(/\s+/g, '_')}_QR.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent("Your Attendance System QR Code");
    const body = encodeURIComponent(`Hello ${registeredUser.name},\n\nHere is your secure access ID for the Attendance System:\n\nID: ${registeredUser.id}\n\nPlease find your QR code attached to this email. (Admin: Don't forget to attach the downloaded PNG!)`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-800">
      <Head>
        <title>Admin - Register User</title>
      </Head>

      <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Registration Form */}
        <div className="bg-white rounded-3xl shadow-lg shadow-slate-200/50 p-8 border border-slate-200">
          <h1 className="text-3xl font-bold mb-6 text-slate-900">Register New User</h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">Full Name</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
                placeholder="e.g. John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">Email Address (Optional)</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
                placeholder="john.doe@example.com"
              />
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
              <p className="font-semibold text-slate-800 mb-1">Face Data Upload</p>
              <p className="text-sm text-slate-500 mb-6">Upload 1-3 clear photos of the user's face to serve as their verification baseline.</p>
              
              {/* Manual Upload */}
              <div className="relative mb-6">
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef}
                  onChange={handleManualUpload}
                  disabled={!modelsLoaded}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  title="Upload a photo"
                />
                <div className="w-full py-6 border-2 border-dashed border-slate-300 bg-white text-slate-600 font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-colors flex flex-col items-center justify-center">
                  <svg className="w-10 h-10 mb-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Click to Browse or Drag Photo Here
                </div>
              </div>

              {/* Status Tags */}
              {descriptors.length > 0 && (
                <div className="flex flex-wrap gap-2 min-h-[30px] p-3 bg-white rounded-xl border border-slate-200">
                  {descriptors.map((_, i) => (
                    <span key={i} className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold tracking-wide uppercase">
                      Photo {i + 1} Captured ✓
                    </span>
                  ))}
                  <button 
                    onClick={() => setDescriptors([])}
                    className="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold tracking-wide uppercase hover:bg-rose-100 ml-auto"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200">
              <button 
                onClick={registerUser}
                disabled={!name || descriptors.length === 0}
                className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-900/20"
              >
                Create User
              </button>
            </div>

            {status && (
              <p className={`text-sm font-medium p-4 rounded-xl ${status.includes('Error') || status.includes('Failed') ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}`}>
                {status}
              </p>
            )}
          </div>
        </div>

        {/* QR Code Output */}
        <div className="bg-slate-900 rounded-3xl shadow-2xl p-8 border border-slate-800 flex flex-col items-center justify-center text-center relative overflow-hidden">
          {registeredUser ? (
            <div className="space-y-6 relative z-10 w-full flex flex-col items-center">
              <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-full font-medium inline-block mb-2">
                Registration Complete
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-xl inline-block">
                <QRCodeSVG id="user-qr-code" value={registeredUser.id} size={256} level="H" marginSize={4} />
                <QRCodeCanvas
                  ref={qrCanvasRef}
                  value={registeredUser.id}
                  size={1024}
                  level="H"
                  marginSize={4}
                  className="hidden"
                />
              </div>
              
              <div>
                <h3 className="text-2xl font-bold text-white mb-1">{registeredUser.name}</h3>
                <p className="text-sm text-slate-400 break-all font-mono bg-slate-800/50 px-3 py-1 rounded-lg inline-block">{registeredUser.id}</p>
              </div>

              <div className="flex flex-col w-full max-w-xs space-y-3 mt-4">
                <div className="flex space-x-3 w-full">
                  <button 
                    onClick={downloadQR}
                    className="flex-1 py-3 bg-white text-slate-900 font-bold rounded-xl transition-colors shadow-lg hover:bg-slate-100 flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Save QR
                  </button>
                  <button 
                    onClick={handleEmailShare}
                    className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Email
                  </button>
                </div>
                <button 
                  onClick={() => {
                    setRegisteredUser(null);
                    setName('');
                    setEmail('');
                    setDescriptors([]);
                    setStatus('Ready for next registration.');
                  }}
                  className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition-colors shadow-lg shadow-sky-500/25"
                >
                  Register Another
                </button>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 max-w-xs mx-auto relative z-10">
              <div className="w-28 h-28 border-4 border-dashed border-slate-700 rounded-2xl mx-auto mb-6 flex items-center justify-center bg-slate-800/50">
                <svg className="w-10 h-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="font-semibold text-slate-300 text-lg">ID Generation Pending</p>
              <p className="text-sm mt-3 text-slate-400 leading-relaxed">Upload user photos and register them to generate a secure access QR.</p>
            </div>
          )}
          
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        </div>
      </main>
    </div>
  );
}
