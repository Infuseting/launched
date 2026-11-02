import { LoaderCircle, LogOut } from 'lucide-react';
import type { AppHandlers, LauncherStateModel } from '../../types';
import DiscordIcon from '../DiscordIcon';
import AccountSwitcher from './AccountSwitcher';

interface AccountsTabProps {
  state: Pick<LauncherStateModel, 'allAccounts' | 'authCache' | 'discordUser' | 'discordBusy' | 'discordError' | 'isSyncing'>;
  handlers: Pick<AppHandlers, 'handleAccountSwap' | 'handleAccountRemove' | 'handleLoginAdd' | 'handleDiscordLogout'>;
}

export default function AccountsTab({ state, handlers }: AccountsTabProps) {
  const user = state.discordUser;

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <h2 className="text-2xl font-bold tracking-tight">Comptes</h2>

      <AccountSwitcher
        accounts={state.allAccounts}
        activeUuid={state.authCache?.uuid}
        onSwap={handlers.handleAccountSwap}
        onRemove={handlers.handleAccountRemove}
        onAdd={handlers.handleLoginAdd}
      />

      <section aria-labelledby="discord-account-title" className="space-y-3">
        <h3 id="discord-account-title" className="flex items-center gap-2.5 px-1 text-sm font-semibold text-white/75">
          <DiscordIcon className="h-4 w-5 text-indigo-300" />
          Discord
        </h3>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-400/15 text-sm font-semibold text-indigo-200">
              <span aria-hidden="true">{user?.username.slice(0, 2).toUpperCase()}</span>
              {user?.avatar && <img src={user.avatar} alt="" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.style.display = 'none'; }} />}
            </div>
            <div className="min-w-0">
              <p title={user?.username} className="truncate text-sm font-semibold text-white">{user?.username}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-white/55"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Connecté</p>
            </div>
          </div>
          <button
            type="button"
            disabled={state.discordBusy || state.isSyncing}
            onClick={() => void handlers.handleDiscordLogout()}
            className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium text-white/60 transition-colors hover:bg-red-400/10 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.discordBusy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : <LogOut aria-hidden="true" className="h-4 w-4" />}
            {state.discordBusy ? 'Déconnexion…' : 'Déconnecter'}
          </button>
        </div>
        {state.discordError && <p role="alert" className="px-1 text-sm text-red-300">{state.discordError}</p>}
      </section>
    </div>
  );
}
