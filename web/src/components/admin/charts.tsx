// Graphiques SVG maison pour le dashboard admin — cohérent avec le reste de
// l'app (aucune icône/lib externe). Palette validée CVD-safe (skill dataviz)
// contre le fond réel #0F172A : node scripts/validate_palette.js
// "#16A34A,#3987e5,#c98500,#9085e9,#e66767" --mode dark --surface "#0F172A"
// → ALL CHECKS PASS. Vert Worimo en slot 1 (identité de marque), 4 teintes de
// complément pour les répartitions catégorielles (rôle, statut, type de bien).

export const CATEGORICAL_PALETTE = ["#16A34A", "#3987e5", "#c98500", "#9085e9", "#e66767"];
export const BRAND_HUE = "#16A34A"; // séries uniques (courbes, classements) : une seule teinte, pas de légende.

/**
 * Barres horizontales. `color` unique = série unique (classements, magnitude
 * ordonnée) ; `colored=true` = une couleur catégorielle par barre (répartition
 * par identité, ≤5 catégories, légende + labels directs).
 */
export function HBarChart({
  data,
  colored = false,
  formatValue = (v) => String(v),
}: {
  data: { label: string; value: number }[];
  colored?: boolean;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {colored && (
        <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1">
          {data.map((d, i) => (
            <span key={d.label} className="flex items-center gap-1.5 text-xs text-white/60">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length] }}
              />
              {d.label}
            </span>
          ))}
        </div>
      )}
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3">
          {!colored && <span className="w-24 shrink-0 truncate text-xs text-white/60">{d.label}</span>}
          <div className="h-5 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(3, (d.value / max) * 100)}%`,
                background: colored ? CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length] : BRAND_HUE,
              }}
              title={`${d.label} : ${formatValue(d.value)}`}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs font-medium text-white/80">
            {formatValue(d.value)}
          </span>
        </div>
      ))}
      {data.length === 0 && <p className="text-sm text-white/40">Aucune donnée.</p>}
    </div>
  );
}

/** Courbe simple (série unique — brand hue), pour les tendances sur N jours. */
export function LineChart({ data }: { data: { day: string; count: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-white/40">Aucune donnée.</p>;
  const width = 600;
  const height = 120;
  const padding = 8;
  const max = Math.max(1, ...data.map((d) => d.count));
  const stepX = (width - padding * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = padding + i * stepX;
    const y = height - padding - (d.count / max) * (height - padding * 2);
    return { x, y, d };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${path} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${points[0].x.toFixed(1)} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" role="img">
      <line
        x1={padding} y1={height - padding} x2={width - padding} y2={height - padding}
        stroke="rgba(255,255,255,0.12)" strokeWidth={1}
      />
      <path d={areaPath} fill={BRAND_HUE} opacity={0.12} />
      <path d={path} fill="none" stroke={BRAND_HUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={BRAND_HUE}>
          <title>{`${p.d.day} : ${p.d.count}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Petite carte-statistique (chiffre + libellé), la brique de base des sections. */
export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "good" | "warning" | "critical";
}) {
  const accentClass = {
    good: "text-primary",
    warning: "text-[#fab219]",
    critical: "text-[#e66767]",
  }[accent ?? "good"];
  return (
    <div className="rounded-xl bg-white/5 p-4">
      <p className="text-xs text-white/50">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? accentClass : "text-white"}`}>{value}</p>
    </div>
  );
}
