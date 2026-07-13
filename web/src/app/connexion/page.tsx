"use client";

// Connexion / inscription par email + mot de passe.
// L'OTP téléphone (Flutter en priorité) sera branché quand un fournisseur SMS
// sera configuré — le backend Supabase le supporte déjà.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"buyer" | "seller" | "agency">("buyer");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getBrowserSupabase();

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, role } },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6">
      <Link href="/" className="mb-8 text-3xl font-bold">
        <span className="text-primary">Wori</span>mo
      </Link>

      <div className="w-full max-w-sm rounded-2xl bg-white/5 p-6">
        {/* Onglets */}
        <div className="mb-6 flex rounded-full bg-white/10 p-1">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
                mode === m ? "bg-primary text-white" : "text-white/70"
              }`}
            >
              {m === "login" ? "Connexion" : "Inscription"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <Field label="Nom complet">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input"
                  placeholder="Fatou Ndiaye"
                />
              </Field>
              <Field label="Je suis">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="input"
                >
                  <option value="buyer">Acheteur / visiteur</option>
                  <option value="seller">Vendeur particulier</option>
                  <option value="agency">Agence immobilière</option>
                </select>
              </Field>
            </>
          )}

          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="vous@exemple.sn"
            />
          </Field>
          <Field label="Mot de passe">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-primary py-3 font-semibold transition hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>
      </div>

      <p className="mt-6 max-w-sm text-center text-xs text-white/50">
        Compte de démo local : demo@worimo.com / password123 (agence)
      </p>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-white/70">{label}</span>
      {children}
    </label>
  );
}
