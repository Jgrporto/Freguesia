import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Pencil, Plus, Search, Trash2, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import LabelBadge from '@/components/labels/LabelBadge';
import PageHeader from '@/components/layout/PageHeader';
import PageSectionCard from '@/components/layout/PageSectionCard';
import PageShell from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  buildFlowEditorPath,
  createChatbotFlow,
  deleteChatbotFlow,
  downloadTextFile,
  exportChatbotFlowJson,
  getChatbotFlow,
  importChatbotFlow,
  listChatbotFlows,
  updateChatbotFlow,
} from '@/lib/chatbot-flows-api';
import {
  getLabelGreetingConfig,
  saveLabelGreeting,
  SYSTEM_LABELS,
  useLabelCatalog,
} from '@/lib/labels';

const formatDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
};

const buildDraftKey = (labelId) => `greeting:${labelId}`;

export default function Chatbot() {
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [greetingDrafts, setGreetingDrafts] = useState({});
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { customLabels, greetings } = useLabelCatalog();

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['chatbot-flows'],
    queryFn: listChatbotFlows,
  });

  const labelCatalog = useMemo(
    () => [...SYSTEM_LABELS, ...customLabels].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'system' ? -1 : 1;
      return String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR', { sensitivity: 'base' });
    }),
    [customLabels],
  );

  useEffect(() => {
    const nextDrafts = {};
    labelCatalog.forEach((label) => {
      const config = getLabelGreetingConfig(label.id, greetings);
      nextDrafts[buildDraftKey(label.id)] = {
        enabled: config.enabled,
        message: config.message,
        repeatMode: config.repeatMode,
      };
    });
    setGreetingDrafts(nextDrafts);
  }, [greetings, labelCatalog]);

  const filteredFlows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return flows;

    return flows.filter((flow) =>
      [flow.name, flow.code, flow.id].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)),
    );
  }, [flows, search]);

  const createMutation = useMutation({
    mutationFn: () => createChatbotFlow({ name: `Flow ${flows.length + 1}` }),
    onSuccess: (flow) => {
      queryClient.setQueryData(['chatbot-flows'], (current = []) => {
        const items = Array.isArray(current) ? current : [];
        return items.some((item) => item.id === flow.id)
          ? items
          : [...items, flow].sort((left, right) => Number(left.code || 0) - Number(right.code || 0));
      });
      queryClient.setQueryData(['chatbot-flow', `flow${flow.code}`], flow);
      setAddOpen(false);
      navigate(buildFlowEditorPath(flow));
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] });
    },
    onError: (error) => toast.error(error?.message || 'Nao foi possivel criar o flow.'),
  });

  const importMutation = useMutation({
    mutationFn: importChatbotFlow,
    onSuccess: (flow) => {
      queryClient.setQueryData(['chatbot-flows'], (current = []) => {
        const items = Array.isArray(current) ? current : [];
        return items.some((item) => item.id === flow.id)
          ? items
          : [...items, flow].sort((left, right) => Number(left.code || 0) - Number(right.code || 0));
      });
      queryClient.setQueryData(['chatbot-flow', `flow${flow.code}`], flow);
      setAddOpen(false);
      navigate(buildFlowEditorPath(flow));
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] });
    },
    onError: (error) => toast.error(error?.message || 'Nao foi possivel importar o JSON.'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ flow, nextActive }) => updateChatbotFlow(flow.id, { active: nextActive, name: flow.name }, { summary: true }),
    onMutate: async ({ flow, nextActive }) => {
      await queryClient.cancelQueries({ queryKey: ['chatbot-flows'] });
      const previousFlows = queryClient.getQueryData(['chatbot-flows']);
      const previousFlow = queryClient.getQueryData(['chatbot-flow', `flow${flow.code}`]);
      const optimisticFlow = {
        ...flow,
        active: nextActive,
        updated_date: new Date().toISOString(),
      };

      queryClient.setQueryData(['chatbot-flows'], (current = []) =>
        Array.isArray(current) ? current.map((item) => (item.id === flow.id ? optimisticFlow : item)) : current,
      );
      queryClient.setQueryData(['chatbot-flow', `flow${flow.code}`], (current) =>
        current ? { ...current, active: nextActive, updated_date: optimisticFlow.updated_date } : current,
      );

      return { previousFlow, previousFlows };
    },
    onSuccess: (updatedFlow) => {
      queryClient.setQueryData(['chatbot-flows'], (current = []) =>
        Array.isArray(current) ? current.map((item) => (item.id === updatedFlow.id ? updatedFlow : item)) : current,
      );
      queryClient.setQueryData(['chatbot-flow', `flow${updatedFlow.code}`], (current) =>
        current ? { ...current, active: updatedFlow.active, updated_date: updatedFlow.updated_date } : current,
      );
      toast.success(updatedFlow.active ? 'Flow ativado.' : 'Flow inativado.');
    },
    onError: (error, _variables, context) => {
      if (context?.previousFlows) {
        queryClient.setQueryData(['chatbot-flows'], context.previousFlows);
      }
      if (context?.previousFlow) {
        queryClient.setQueryData(['chatbot-flow', `flow${context.previousFlow.code}`], context.previousFlow);
      }
      toast.error(error?.message || 'Nao foi possivel alterar o status do flow.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] });
      queryClient.invalidateQueries({ queryKey: ['chatbot-runtime-state'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatbotFlow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] });
      toast.success('Flow excluido com sucesso.');
    },
    onError: (error) => toast.error(error?.message || 'Nao foi possivel excluir o flow.'),
  });

  const greetingMutation = useMutation({
    mutationFn: ({ labelId, config }) => saveLabelGreeting(labelId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', 'catalog'] });
      toast.success('Saudacao atualizada.');
    },
    onError: (error) => toast.error(error?.message || 'Nao foi possivel salvar a saudacao.'),
  });

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      importMutation.mutate(parsed);
    } catch {
      toast.error('Arquivo JSON invalido.');
    }
  };

  const handleDownload = async (flow) => {
    try {
      const fullFlow = await queryClient.fetchQuery({
        queryKey: ['chatbot-flow', `flow${flow.code}`],
        queryFn: () => getChatbotFlow(flow.id),
        staleTime: 30000,
      });
      downloadTextFile(`chatbot-flow-${fullFlow.code}.json`, exportChatbotFlowJson(fullFlow));
    } catch (error) {
      toast.error(error?.message || 'Nao foi possivel baixar o JSON do flow.');
    }
  };

  const updateGreetingDraft = (labelId, patch) => {
    const key = buildDraftKey(labelId);
    setGreetingDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] || getLabelGreetingConfig(labelId, greetings)),
        ...patch,
      },
    }));
  };

  const saveGreetingDraft = (labelId) => {
    const draft = greetingDrafts[buildDraftKey(labelId)] || getLabelGreetingConfig(labelId, greetings);
    greetingMutation.mutate({
      labelId,
      config: {
        enabled: Boolean(draft.enabled),
        message: String(draft.message || '').trim(),
        repeatMode: draft.repeatMode || 'once_per_open_conversation',
      },
    });
  };

  return (
    <PageShell>
      <PageHeader
        title="Chatbot"
        description="Gerencie flows com gatilho e saudações automáticas por etiqueta quando nenhum gatilho for acionado."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Adicionar flow
          </Button>
        }
      />

      <PageSectionCard className="hidden p-5">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em] text-foreground">Saudações automáticas por etiqueta</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Este fallback só é enviado quando o cliente entra na fila e nenhuma mensagem ativa um flow. A saudação é enviada uma vez por conversa aberta.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full bg-primary/10 px-3 py-1 text-primary">
            Fallback do chatbot
          </Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {labelCatalog.map((label) => {
            const draft = greetingDrafts[buildDraftKey(label.id)] || getLabelGreetingConfig(label.id, greetings);
            const isSaving = greetingMutation.isPending && greetingMutation.variables?.labelId === label.id;
            return (
              <div key={label.id} className="rounded-2xl border border-border bg-background/70 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <LabelBadge label={label} className="h-7 px-3 text-[11px]" />
                    <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                      {label.kind === 'system' ? 'Etiqueta padrão automática do sistema.' : label.description || 'Etiqueta personalizada.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Ativa</span>
                    <Switch
                      checked={Boolean(draft.enabled)}
                      onCheckedChange={(checked) => updateGreetingDraft(label.id, { enabled: checked })}
                      disabled={isSaving}
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Mensagem de saudação
                  </label>
                  <Textarea
                    value={draft.message || ''}
                    onChange={(event) => updateGreetingDraft(label.id, { message: event.target.value })}
                    className="min-h-[96px] resize-y"
                    placeholder="Escreva a saudação para esta etiqueta."
                    maxLength={600}
                    disabled={isSaving}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Envio: uma vez por conversa aberta</span>
                  <Button
                    size="sm"
                    onClick={() => saveGreetingDraft(label.id)}
                    disabled={isSaving || !String(draft.message || '').trim()}
                  >
                    {isSaving ? 'Salvando...' : 'Salvar saudação'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </PageSectionCard>

      <PageSectionCard className="p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por codigo ou nome do flow"
              className="pl-9"
            />
          </div>
          <div className="text-sm text-muted-foreground">{filteredFlows.length} flow(s)</div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/60">
                <TableHead className="w-[180px] text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Acoes</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Cod</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Flow</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Ativo</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Data Cadastro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    Carregando flows...
                  </TableCell>
                </TableRow>
              ) : filteredFlows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Workflow className="h-10 w-10 text-primary/50" />
                      <p className="text-sm">Nenhum flow encontrado.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredFlows.map((flow) => (
                  <TableRow key={flow.id} className="hover:bg-secondary/20">
                    <TableCell className="py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Excluir"
                          onClick={() => {
                            if (window.confirm(`Deseja excluir o flow ${flow.name}?`)) {
                              deleteMutation.mutate(flow.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Visualizar" onClick={() => navigate(buildFlowEditorPath(flow))}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Editar" onClick={() => navigate(buildFlowEditorPath(flow))}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Baixar JSON" onClick={() => handleDownload(flow)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-sm font-semibold text-foreground">{flow.code}</TableCell>
                    <TableCell className="py-3 text-sm font-medium text-foreground">{flow.name}</TableCell>
                    <TableCell className="py-3">
                      <Switch
                        checked={flow.active}
                        disabled={toggleMutation.isPending && toggleMutation.variables?.flow?.id === flow.id}
                        onCheckedChange={(checked) => toggleMutation.mutate({ flow, nextActive: checked })}
                      />
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">{formatDate(flow.created_date)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageSectionCard>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar flow</DialogTitle>
            <DialogDescription>Escolha como deseja iniciar o fluxograma do chatbot.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Criando flow...' : 'Criar flow em branco'}
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}>
              {importMutation.isPending ? 'Importando...' : 'Importar JSON'}
            </Button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
