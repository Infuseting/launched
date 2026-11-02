import React from 'react';
import { Box, Check, Plus, Trash2 } from 'lucide-react';
import type { AuthResponse } from '../../types';

interface AccountSwitcherProps {
  accounts: AuthResponse[];
  activeUuid?: string | null;
  onSwap: (uuid: string) => Promise<void>;
  onRemove: (uuid: string) => Promise<void>;
  onAdd: () => Promise<void>;
}

export const AccountSwitcher: React.FC<AccountSwitcherProps> = ({ accounts, activeUuid, onSwap, onRemove, onAdd }) => (
  <section aria-labelledby="minecraft-accounts-title" className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
    <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
      <h3 id="minecraft-accounts-title" className="flex items-center gap-2.5 text-sm font-semibold text-white">
        <Box aria-hidden="true" className="h-4.5 w-4.5 text-emerald-300" />
        Minecraft
        <span className="ml-1 text-xs font-normal text-white/45">{accounts.length}</span>
      </h3>
      <button
        type="button"
        onClick={() => void onAdd()}
        aria-label="Ajouter un compte Minecraft avec Microsoft"
        className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/80 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/10 hover:text-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
      >
        <Plus aria-hidden="true" className="h-3.5 w-3.5" />Ajouter
      </button>
    </header>

    {accounts.length === 0 ? <p className="px-5 py-7 text-sm text-white/55">Aucun compte Minecraft ajouté.</p> : (
      <ul className="divide-y divide-white/[0.06]">
        {accounts.map(account => {
          const isActive = activeUuid === account.uuid;
          return (
            <li key={account.uuid} className={'flex items-center justify-between gap-3 px-4 py-4 sm:px-5 ' + (isActive ? 'bg-emerald-400/[0.035]' : '')}>
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-neutral-800">
                  <Box aria-hidden="true" className="h-5 w-5 text-white/35" />
                  <img src={'https://mc-heads.net/avatar/' + account.uuid + '/64'} alt="" className="absolute inset-0 h-full w-full object-cover rendering-pixelated" onError={event => { event.currentTarget.style.display = 'none'; }} />
                </div>
                <div className="min-w-0">
                  <p title={account.name} className="truncate text-sm font-semibold text-white">{account.name}</p>
                  <p className={'mt-1 flex items-center gap-1 text-xs ' + (isActive ? 'text-emerald-300' : 'text-white/50')}>
                    {isActive && <Check aria-hidden="true" className="h-3 w-3" />}{isActive ? 'Actif' : 'Microsoft'}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {!isActive && <button type="button" onClick={() => void onSwap(account.uuid)} aria-label={'Utiliser le compte ' + account.name} className="min-h-10 rounded-lg px-3 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300">Utiliser</button>}
                <button type="button" onClick={() => void onRemove(account.uuid)} title="Retirer ce compte" aria-label={'Retirer le compte Minecraft ' + account.name} className="flex h-10 w-10 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-red-400/10 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300">
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </section>
);

export default AccountSwitcher;
