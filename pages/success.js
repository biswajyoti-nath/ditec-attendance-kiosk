import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Success() {
  const router = useRouter();
  const { name, type } = router.query;
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    // If someone visits this page directly without params, bounce them
    if (!name && router.isReady) {
      router.replace('/');
      return;
    }

    if (!router.isReady) return;

    const interval = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    const timeout = setTimeout(() => {
      router.push('/');
    }, 4000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [name, router, router.isReady]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans text-slate-100">
      <Head>
        <title>Success - Attendance</title>
      </Head>

      <main className="w-full max-w-lg bg-emerald-900/20 rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.15)] p-12 border border-emerald-500/30 text-center animation-fade-in backdrop-blur-xl relative overflow-hidden">
        {/* Confetti / Glow effect in background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full"></div>
        
        <div className="relative z-10">
          <div className="w-24 h-24 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          
          <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">Access Granted</h1>
          
          <p className="text-2xl text-emerald-300 font-medium mb-8">
            Welcome, <span className="text-white">{name}</span>!
          </p>

          <div className="bg-slate-900/50 rounded-2xl p-4 inline-block mb-8 border border-slate-700">
            <p className="text-slate-300">
              Successfully punched <span className="font-bold text-white bg-slate-800 px-3 py-1 rounded-md ml-1">{type}</span>
            </p>
          </div>

          <p className="text-slate-500 font-medium text-sm animate-pulse">
            Returning to scanner in {countdown}s...
          </p>
        </div>
      </main>

      <style jsx global>{`
        .animation-fade-in {
          animation: scaleUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
