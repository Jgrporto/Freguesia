import React from 'react';
import { AlertCircle, FileText, LoaderCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

function resolveStatus(transcription = {}) {
  return String(transcription?.status || '').trim().toLowerCase();
}

export default function AudioTranscriptionPanel({ transcription, isTranscribing = false, onTranscribe, isAgent = false }) {
  const status = resolveStatus(transcription);
  const text = String(transcription?.text || '').trim();
  const error = String(transcription?.error || '').trim();
  const isProcessing = isTranscribing;

  if (status === 'done' && text) {
    return (
      <div
        data-chat-selection-surface="true"
        className={cn(
          'mt-2 rounded-xl border px-3 py-2 text-xs leading-relaxed shadow-sm select-text',
          isAgent
            ? 'border-primary-foreground/15 bg-primary-foreground/10 text-primary-foreground'
            : 'border-border bg-muted/60 text-foreground'
        )}
      >
        <div className="mb-1 flex items-center gap-1.5 font-semibold">
          <FileText className="h-3.5 w-3.5" />
          <span>Transcrição</span>
        </div>
        <p className="whitespace-pre-wrap break-words opacity-90">{text}</p>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div
        className={cn(
          'mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium',
          isAgent ? 'bg-primary-foreground/10 text-primary-foreground/100' : 'bg-muted text-muted-foreground'
        )}
      >
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        Transcrevendo áudio...
      </div>
    );
  }

  if (status === 'processing' || status === 'pending') {
    return (
      <div
        className={cn(
          'mt-2 rounded-xl border px-3 py-2 text-xs',
          isAgent
            ? 'border-primary-foreground/15 bg-primary-foreground/10 text-primary-foreground'
            : 'border-amber-500/20 bg-amber-500/10 text-amber-700'
        )}
      >
        <div className="flex items-center gap-1.5 font-semibold">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Transcricao nao finalizada.</span>
        </div>
        <button
          type="button"
          onClick={() => onTranscribe?.({ force: true })}
          className={cn(
            'mt-2 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
            isAgent
              ? 'border-primary-foreground/20 hover:bg-primary-foreground/10'
              : 'border-amber-500/25 hover:bg-amber-500/10'
          )}
        >
          Transcrever audio
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className={cn(
          'mt-2 rounded-xl border px-3 py-2 text-xs',
          isAgent
            ? 'border-primary-foreground/15 bg-primary-foreground/10 text-primary-foreground'
            : 'border-destructive/20 bg-destructive/10 text-destructive'
        )}
      >
        <div className="flex items-center gap-1.5 font-semibold">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Não foi possível transcrever este áudio.</span>
        </div>
        {error ? <p className="mt-1 line-clamp-2 opacity-80">{error}</p> : null}
        <button
          type="button"
          onClick={() => onTranscribe?.({ force: true })}
          className={cn(
            'mt-2 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
            isAgent
              ? 'border-primary-foreground/20 hover:bg-primary-foreground/10'
              : 'border-destructive/25 hover:bg-destructive/10'
          )}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onTranscribe?.({ force: false })}
      className={cn(
        'mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
        isAgent
          ? 'border-primary-foreground/18 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/10'
          : 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/10'
      )}
    >
      <FileText className="h-3.5 w-3.5" />
      Transcrever áudio
    </button>
  );
}
