import React from 'react';
import { RefreshCw, CloudDownload, Wifi } from 'lucide-react';

export default function SyncBanner({ syncing, onSync, total, lastSync, syncInterval }) {
  return (
    <div className="flex items-center gap-1 md:gap-2">
      {total === 0 && !syncing && (
        <span className="text-xs text-red-200 animate-pulse hidden sm:inline">Sin productos</span>
      )}
      {total > 0 && syncInterval && (
        <span className="text-[10px] md:text-xs opacity-60 items-center gap-1 hidden sm:flex">
          <Wifi className="w-3 h-3" />
          Auto cada {syncInterval}min
        </span>
      )}
      <button
        onClick={onSync}
        disabled={syncing}
        className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 transition-colors text-xs font-medium disabled:opacity-50"
        data-testid="sync-btn"
      >
        {syncing ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span className="hidden sm:inline">Sincronizando...</span>
          </>
        ) : (
          <>
            <CloudDownload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sincronizar</span>
          </>
        )}
      </button>
    </div>
  );
}
