import { useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react';
import { loginWithCredentials } from '../lib/auth';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const result = await loginWithCredentials(username, password);
      if (result.success) {
        onLoginSuccess();
      } else {
        setErrorMessage(result.message || 'Username atau kata sandi tidak sesuai.');
      }
    } catch {
      setErrorMessage('Tidak dapat terhubung ke server. Periksa koneksi dan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-3 py-6 dark:from-slate-950 dark:to-slate-900 sm:px-4 sm:py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="mb-6 text-center">
          <img
            src="/logo.png"
            alt="Logo Klinik Pratama Lapas Kelas IIB Dompu"
            className="mx-auto mb-2 h-14 w-auto object-contain sm:h-16"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sistem Informasi Rekam Medis &amp; Pelayanan Kesehatan WBP
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Username Petugas
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                disabled={isLoading}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Masukkan username"
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-teal-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                disabled={isLoading}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Masukkan kata sandi"
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-11 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-teal-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-600 dark:hover:text-slate-200"
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 dark:focus:ring-offset-slate-900"
          >
            {isLoading ? 'Memverifikasi…' : 'Masuk Layanan'}
          </button>
        </form>

        <div className="mt-8 border-t border-slate-200 pt-6 text-center dark:border-slate-800">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Lembaga Pemasyarakatan Kelas IIB Dompu · Hak Akses Petugas Medis
          </p>
        </div>
      </section>
    </main>
  );
}
