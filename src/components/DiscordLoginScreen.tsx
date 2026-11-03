import { LoaderCircle } from 'lucide-react';
import type { AppHandlers, LauncherStateModel } from '../types';
import DiscordIcon from './DiscordIcon';

export default function DiscordLoginScreen({ state, handlers }: { state: LauncherStateModel; handlers: AppHandlers }) {
  const busy = state.discordChecking || state.discordBusy;

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-hidden bg-neutral-950 px-6 py-4 text-white">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-300/10 bg-indigo-400/10 text-indigo-300 [@media(max-height:480px)]:mb-4">
          <DiscordIcon className="h-7 w-9" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Bienvenue sur Launched</h1>
        <p className="mt-2 text-sm text-white/55">Connectez-vous avec Discord.</p>

        {(state.discordError || busy) && (
          <div className="mt-5" role={state.discordError ? 'alert' : 'status'} aria-live={state.discordError ? 'assertive' : 'polite'}>
            {state.discordError ? (
              <p title={state.discordError} className="line-clamp-3 break-words rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{state.discordError}</p>
            ) : (
              <p className="flex items-center justify-center gap-2 text-sm text-indigo-200">
                <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 motion-safe:animate-spin" />
                {state.discordChecking ? 'Vérification…' : 'Connexion en cours…'}
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handlers.handleDiscordLogin()}
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-300 disabled:cursor-wait disabled:opacity-60"
        >
          <DiscordIcon className="h-4 w-5" />
          Continuer avec Discord
        </button>

        <div className="mt-2 flex h-10 items-center justify-center">
          {state.discordBusy ? (
            <button type="button" onClick={() => void handlers.handleDiscordCancel()} className="min-h-10 rounded-lg px-4 text-xs text-white/65 hover:text-white focus-visible:outline-2 focus-visible:outline-indigo-300">Annuler</button>
          ) : (
            <button type="button" onClick={() => void handlers.handleContinueWithoutDiscord()} className="min-h-10 rounded-lg px-4 text-xs text-white/65 hover:text-white focus-visible:outline-2 focus-visible:outline-indigo-300">Continuer sans se connecter</button>
          )}
        </div>
      </div>
    </div>
  );
}
