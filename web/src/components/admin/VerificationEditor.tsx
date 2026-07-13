"use client";

// Éditeur du rapport de vérification foncière — le cœur de la promesse Worimo.
// Upsert sur verifications (RLS : admin uniquement). Passer le statut à
// "verified" horodate le rapport et le rend public sur la page de l'annonce.

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import type { Verification, VerificationDocument, VerificationStatus } from "@/lib/types";

const LEVELS = [
  { value: "titre_foncier", label: "Titre foncier" },
  { value: "bail", label: "Bail" },
  { value: "nicad", label: "NICAD" },
  { value: "deliberation", label: "Délibération" },
];

const STATUSES = [
  { value: "pending", label: "En attente" },
  { value: "in_review", label: "Vérification en cours" },
  { value: "verified", label: "Vérifié ✓" },
  { value: "rejected", label: "Refusé" },
];

const DEFAULT_DOCUMENTS: VerificationDocument[] = [
  { doc_type: "titre_foncier", label: "Document foncier vérifié auprès de la Conservation foncière", checked: false },
  { doc_type: "nicad", label: "NICAD concordant avec le cadastre", checked: false },
  { doc_type: "visite_terrain", label: "Visite terrain et bornage contradictoire", checked: false },
  { doc_type: "identite_vendeur", label: "Identité du vendeur confirmée (CNI / procuration)", checked: false },
];

export default function VerificationEditor({
  propertyId,
  adminId,
  existing,
  onSaved,
}: {
  propertyId: string;
  adminId: string;
  existing: Verification | null;
  onSaved: () => void;
}) {
  const [level, setLevel] = useState(existing?.level ?? "titre_foncier");
  const [status, setStatus] = useState(existing?.status ?? "pending");
  const [reportNumber, setReportNumber] = useState(
    existing?.report_number ?? suggestReportNumber(),
  );
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [documents, setDocuments] = useState<VerificationDocument[]>(
    existing?.documents?.length ? existing.documents : DEFAULT_DOCUMENTS,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggleDocument(index: number) {
    setDocuments((docs) =>
      docs.map((doc, i) => (i === index ? { ...doc, checked: !doc.checked } : doc)),
    );
  }

  function updateLabel(index: number, label: string) {
    setDocuments((docs) => docs.map((doc, i) => (i === index ? { ...doc, label } : doc)));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const supabase = getBrowserSupabase();
    const { error } = await supabase.from("verifications").upsert(
      {
        property_id: propertyId,
        level,
        status,
        report_number: reportNumber.trim() || null,
        summary: summary.trim() || null,
        documents,
        verified_by: status === "verified" ? adminId : null,
        verified_at: status === "verified" ? new Date().toISOString() : null,
      },
      { onConflict: "property_id" },
    );
    setSaving(false);
    if (error) {
      setMessage(`Erreur : ${error.message}`);
    } else {
      setMessage("Rapport enregistré ✓");
      onSaved();
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <h3 className="font-semibold">Vérification foncière</h3>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-white/70">Niveau</span>
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-white/70">Statut</span>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as VerificationStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm text-white/70">Numéro de rapport</span>
        <input
          className="input font-mono"
          value={reportNumber}
          onChange={(e) => setReportNumber(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm text-white/70">
          Synthèse (visible publiquement une fois vérifié)
        </span>
        <textarea
          className="input min-h-20"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Ex : Titre foncier authentifié auprès de la Conservation foncière de… Visite terrain effectuée le…"
        />
      </label>

      <div>
        <span className="mb-2 block text-sm text-white/70">Contrôles effectués</span>
        <ul className="space-y-2">
          {documents.map((doc, index) => (
            <li key={doc.doc_type} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={doc.checked}
                onChange={() => toggleDocument(index)}
                className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
              />
              <input
                className="input py-2 text-sm"
                value={doc.label}
                onChange={(e) => updateLabel(index, e.target.value)}
              />
            </li>
          ))}
        </ul>
      </div>

      {message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.startsWith("Erreur")
              ? "bg-red-500/15 text-red-300"
              : "bg-primary/15 text-primary"
          }`}
        >
          {message}
        </p>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-full bg-primary py-2.5 font-semibold transition hover:bg-primary-dark disabled:opacity-50"
      >
        {saving ? "Enregistrement…" : "Enregistrer le rapport"}
      </button>
    </div>
  );
}

function suggestReportNumber(): string {
  const year = new Date().getFullYear();
  const serial = String(Math.floor(Math.random() * 90000) + 10000);
  return `WRM-${year}-${serial}`;
}
