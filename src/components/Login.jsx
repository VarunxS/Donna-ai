import { useState } from 'react';

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Login failed. Please try again.');
      } else {
        onLogin({ email: email.trim().toLowerCase(), password, user: data.user, isNew: data.isNew });
      }
    } catch {
      setError('Cannot reach the server. Make sure DONNA is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0705] flex items-center justify-center p-6 relative overflow-hidden">

      {/* Ambient warm glows — same as app splash */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full bg-orange-900/10 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-8%]  w-[400px] h-[400px] rounded-full bg-orange-950/15 blur-3xl" />
        <div className="absolute top-[40%] left-[35%]      w-[250px] h-[250px] rounded-full bg-stone-800/20  blur-2xl" />
      </div>

      {/* Subtle dot-grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #f97316 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          {/* Logo mark — focus sun icon */}
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-md shadow-black/40 mb-4">
            <svg width="30" height="30" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="3" fill="black"/>
              <path d="M10 2 L10 5" stroke="black" strokeWidth="2" strokeLinecap="round"/>
              <path d="M10 15 L10 18" stroke="black" strokeWidth="2" strokeLinecap="round"/>
              <path d="M2 10 L5 10" stroke="black" strokeWidth="2" strokeLinecap="round"/>
              <path d="M15 10 L18 10" stroke="black" strokeWidth="2" strokeLinecap="round"/>
              <path d="M4.22 4.22 L6.34 6.34" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M13.66 13.66 L15.78 15.78" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M15.78 4.22 L13.66 6.34" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M6.34 13.66 L4.22 15.78" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black text-[#fffdfa] tracking-tight">DONNA</h1>
          <p className="text-[11px] text-[#827b75] mt-1.5 tracking-wide font-medium">
            Sign in to restore your focus workspace
          </p>
        </div>

        {/* Form card — matches app card style */}
        <div
          className="rounded-2xl p-6 shadow-2xl"
          style={{
            background: '#161210',
            border: '1px solid rgba(249,115,22,0.10)',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-[9px] font-black text-[#827b75] uppercase tracking-widest mb-1.5">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl text-sm text-[#fffdfa] placeholder:text-[#4a4540] focus:outline-none transition-all"
                style={{
                  background: '#0a0705',
                  border: '1px solid rgba(249,115,22,0.10)',
                }}
                onFocus={e  => (e.target.style.borderColor = 'rgba(249,115,22,0.35)')}
                onBlur={e   => (e.target.style.borderColor = 'rgba(249,115,22,0.10)')}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[9px] font-black text-[#827b75] uppercase tracking-widest mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 rounded-xl text-sm text-[#fffdfa] placeholder:text-[#4a4540] focus:outline-none transition-all"
                  style={{
                    background: '#0a0705',
                    border: '1px solid rgba(249,115,22,0.10)',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(249,115,22,0.35)')}
                  onBlur={e  => (e.target.style.borderColor = 'rgba(249,115,22,0.10)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a4540] hover:text-[#c5c0bb] transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showPass
                    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                  }
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 rounded-xl" style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.18)' }}>
                <p className="text-xs text-[#ff453a] font-medium">{error}</p>
              </div>
            )}

            {/* CTA — pure white like app's primary buttons */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-1 bg-white hover:bg-[#f0ede8] text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
            >
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    Verifying…
                  </span>
                : 'Sign In / Create Account'
              }
            </button>
          </form>

          {/* Helper note */}
          <p className="text-center text-[10px] text-[#4a4540] mt-5 leading-relaxed">
            New here? Signing in creates your account automatically.<br />
            Your data is stored on the server you control.
          </p>
        </div>

        {/* Privacy note */}
        <div className="flex items-center justify-center gap-1.5 mt-5">
          <svg className="w-3 h-3 text-[#4a4540]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <span className="text-[10px] text-[#4a4540] font-medium">Passwords are SHA-256 hashed · No third-party auth</span>
        </div>

      </div>
    </div>
  );
}
