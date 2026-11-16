import { useState, type FormEvent } from 'react';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';

interface PasswordChangeViewProps {
  onPasswordChanged: () => void;
}

export default function PasswordChangeView({ onPasswordChanged }: PasswordChangeViewProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 12) {
      setError('Kata sandi baru harus terdiri dari minimal 12 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi belum cocok.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/account/password/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Kata sandi tidak dapat diperbarui.');
        return;
      }
      onPasswordChanged();
    } catch {
      setError('Tidak dapat terhubung ke server. Periksa koneksi dan coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-3 py-6 dark:from-slate-950 dark:to-slate-900 sm:px-4 sm:py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="mb-6 text-center">
          <img
            src="/logo.png"
            alt="Logo Klinik Pratama Lapas Kelas IIB Dompu"
            className="mx-auto mb-3 h-14 w-auto object-contain sm:h-16"
          />
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Perbarui kata sandi awal</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Demi keamanan, buat kata sandi pribadi minimal 12 karakter sebelum melanjutkan.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="current-password" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Kata sandi saat ini
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-base text-slate-900 outline-none transition-colors focus:border-transparent focus:ring-2 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Kata sandi baru
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-base text-slate-900 outline-none transition-colors focus:border-transparent focus:ring-2 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Ulangi kata sandi baru
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-base text-slate-900 outline-none transition-colors focus:border-transparent focus:ring-2 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white sm:text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 dark:focus:ring-offset-slate-900"
          >
            {isSaving ? 'Menyimpan…' : 'Simpan kata sandi baru'}
          </button>
        </form>
      </section>
    </main>
  );
}
