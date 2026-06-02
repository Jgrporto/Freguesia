import React, { useState } from 'react';
import { LifeBuoy, Lock, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { resolvePostLoginRedirect } from '@/lib/local-auth';

export default function Login() {
  const { isAuthenticated, isLoadingAuth, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = resolvePostLoginRedirect('/');

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      toast.error('Preencha usuário e senha para continuar.');
      return;
    }

    try {
      setSubmitting(true);
      await login({
        username,
        password,
        remember,
      });
      window.location.assign(redirectTo);
    } catch (error) {
      toast.error(error?.message || 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    toast.info('Solicite a redefinição de senha ao suporte Freguesia.');
  };

  const handleSupport = () => {
    toast.info('Contate o suporte Freguesia para ajuda com acesso.');
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(177,13,20,0.13),_transparent_32%),linear-gradient(180deg,#faf8f8_0%,#f4f1f1_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="w-full max-w-md rounded-[32px] border border-white/80 bg-white/92 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-[28px] bg-[#B10D14] shadow-[0_18px_40px_rgba(177,13,20,0.28)]">
              <img src="/freguesia_crest.png" alt="Freguesia Barbearia" className="h-16 w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.20)]" />
            </div>
            <div className="barber-brand-text mb-4 text-center text-[#B10D14]">
              <div className="text-[34px] font-bold uppercase leading-none tracking-[0.055em]">Freguesia</div>
              <div className="mt-1 text-[12px] font-bold uppercase leading-none tracking-[0.38em]">Barbearia</div>
            </div>
            <div className="mb-4 flex items-center gap-10 text-[#dbc4c5]">
              <span className="text-xl leading-none">···</span>
              <span className="text-xl leading-none">···</span>
            </div>
            <h1 className="text-3xl font-bold tracking-[-0.03em] text-slate-900">Bem-vindo de volta</h1>
            <p className="mt-3 text-base text-slate-500">Acesse o sistema Freguesia Atendimento</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="sr-only">Usuário</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition focus-within:border-[#B10D14] focus-within:bg-white">
                <UserRound className="h-4 w-4 text-slate-400" />
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Usuário"
                  autoComplete="username"
                  className="h-auto border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:ring-0"
                />
              </div>
            </label>

            <label className="block">
              <span className="sr-only">Senha</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition focus-within:border-[#B10D14] focus-within:bg-white">
                <Lock className="h-4 w-4 text-slate-400" />
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Senha"
                  autoComplete="current-password"
                  className="h-auto border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:ring-0"
                />
              </div>
            </label>

            <div className="flex items-center justify-between gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-500">
                <Checkbox checked={remember} onCheckedChange={(checked) => setRemember(Boolean(checked))} />
                <span>Manter-me conectado</span>
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm font-medium text-slate-500 transition hover:text-[#B10D14]"
              >
                Esqueceu a senha?
              </button>
            </div>

            <Button
              type="submit"
              disabled={submitting || isLoadingAuth}
              className="mt-2 h-12 w-full rounded-2xl bg-[#B10D14] text-base font-semibold text-white shadow-[0_12px_24px_rgba(177,13,20,0.28)] hover:bg-[#940A10]"
            >
              {submitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-8 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
            <span>Precisa de ajuda? </span>
            <button type="button" onClick={handleSupport} className="font-semibold text-[#B10D14] transition hover:text-[#940A10]">
              Contate o suporte Freguesia
            </button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
            <LifeBuoy className="h-3.5 w-3.5" />
            <span>A sessão é protegida e persistida por cookie HttpOnly.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
