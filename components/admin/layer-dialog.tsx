"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  AiLayerTarget,
  AiResponseLayerRow,
  ModelOption,
} from "@/components/admin/prompt-center-panel";

interface LayerForm {
  name: string;
  description: string;
  instructions: string;
  target: AiLayerTarget;
  model: string;
  temperature: number;
  isEnabled: boolean;
}

interface LayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingLayer: AiResponseLayerRow | null;
  layerForm: LayerForm;
  setLayerForm: (updater: (prev: LayerForm) => LayerForm) => void;
  availableModels: ModelOption[];
  isSaving: boolean;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

export function LayerDialog({
  open,
  onOpenChange,
  editingLayer,
  layerForm,
  setLayerForm,
  availableModels,
  isSaving,
  onSave,
  onCancel,
}: LayerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl space-y-4">
        <DialogHeader>
          <DialogTitle>
            {editingLayer ? "AI-laag bewerken" : "Nieuwe AI-laag"}
          </DialogTitle>
          <DialogDescription>
            Ontwerp een extra controlemoment voordat antwoorden zichtbaar
            worden. Elke laag voert een extra modelaanroep uit.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSave} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Naam
              <input
                type="text"
                value={layerForm.name}
                onChange={(event) =>
                  setLayerForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Doelgroep
              <select
                value={layerForm.target}
                onChange={(event) =>
                  setLayerForm((prev) => ({
                    ...prev,
                    target: event.target.value as AiLayerTarget,
                  }))
                }
                className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
              >
                <option value="COACH">Coachkanaal</option>
                <option value="OVERSEER">Overzichtscoach</option>
                <option value="ALL">Beide agenten</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Doel van de laag
            <textarea
              value={layerForm.description}
              onChange={(event) =>
                setLayerForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              className="min-h-[80px] rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
              placeholder="Bijv. controleer schrijfstijl of voeg waarschuwingen toe bij onzekerheden."
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Instructies voor het model
            <textarea
              value={layerForm.instructions}
              onChange={(event) =>
                setLayerForm((prev) => ({
                  ...prev,
                  instructions: event.target.value,
                }))
              }
              className="min-h-[160px] rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
              placeholder="Beschrijf precies hoe deze laag het conceptantwoord moet controleren of herschrijven."
              required
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Model
              <select
                value={layerForm.model}
                onChange={(event) =>
                  setLayerForm((prev) => ({
                    ...prev,
                    model: event.target.value,
                  }))
                }
                className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                required
              >
                <option value="" disabled>
                  Kies een model
                </option>
                {availableModels.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Temperatuur
              <input
                type="number"
                min={0}
                max={1.2}
                step={0.1}
                value={layerForm.temperature}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setLayerForm((prev) => ({
                    ...prev,
                    temperature: Number.isNaN(next) ? prev.temperature : next,
                  }));
                }}
                className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={layerForm.isEnabled}
              onChange={(event) =>
                setLayerForm((prev) => ({
                  ...prev,
                  isEnabled: event.target.checked,
                }))
              }
              className="size-4"
            />
            Laag is actief
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            Elke extra laag voegt een extra modelaanroep toe en kan het antwoord
            iets vertragen. Gebruik korte instructies voor soepele prestaties.
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSaving
                ? "Opslaan..."
                : editingLayer
                ? "Wijzigingen opslaan"
                : "Laag toevoegen"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
