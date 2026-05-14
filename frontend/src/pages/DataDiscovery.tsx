import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  scanSubject,
  DataDiscoveryScanResult,
  SystemScanResult,
} from "../services/api";

// ── Layout constants ──────────────────────────────────────────────────────────
const CX = 370;
const CY = 230;
const ORBIT = 160;
const NODE_R = 42;
const CENTER_R = 52;

// Pentagon layout: 5 nodes, starting from the top
const ANGLES = [-90, -18, 54, 126, 198].map((d) => (d * Math.PI) / 180);

function nodePos(i: number) {
  return {
    x: CX + ORBIT * Math.cos(ANGLES[i]),
    y: CY + ORBIT * Math.sin(ANGLES[i]),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PulseRing({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <>
      <circle cx={x} cy={y} r={NODE_R + 8} fill="none" stroke={color} strokeWidth={1.5} opacity={0.25}>
        <animate attributeName="r" values={`${NODE_R + 4};${NODE_R + 18};${NODE_R + 4}`} dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;0;0.35" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </>
  );
}

function ConnectionLine({
  x1, y1, x2, y2, color, found, delay,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; found: boolean; delay: number;
}) {
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={found ? color : "#334155"}
      strokeWidth={found ? 2 : 1.2}
      strokeDasharray={found ? "none" : "5 4"}
      opacity={found ? 0.75 : 0.35}
      strokeLinecap="round"
    >
      {found && (
        <animate
          attributeName="stroke-dashoffset"
          from={len} to={0}
          dur="0.8s"
          begin={`${delay}s`}
          fill="freeze"
        />
      )}
    </line>
  );
}

function DataNode({
  system, pos, animDelay,
}: {
  system: SystemScanResult;
  pos: { x: number; y: number };
  animDelay: number;
}) {
  const { x, y } = pos;
  const { color, found, name, count } = system;
  const fill = found ? `${color}22` : "#1E293B";
  const stroke = found ? color : "#334155";

  const icon = {
    postgres:  "PG",
    redis:     "RD",
    search:    "ES",
    analytics: "AN",
    backup:    "S3",
  }[system.key] ?? "??";

  return (
    <g style={{ opacity: 0, animation: `fadeInNode 0.5s ease ${animDelay}s forwards` }}>
      {found && <PulseRing x={x} y={y} color={color} />}

      {/* Node circle */}
      <circle cx={x} cy={y} r={NODE_R} fill={fill} stroke={stroke} strokeWidth={found ? 2.2 : 1.5} />

      {/* Icon */}
      <text x={x} y={y - 6} textAnchor="middle" dominantBaseline="middle"
        fill={found ? color : "#475569"} fontSize={13} fontWeight={700} fontFamily="monospace">
        {icon}
      </text>

      {/* Count badge */}
      {found && (
        <g>
          <circle cx={x + NODE_R - 8} cy={y - NODE_R + 8} r={13} fill={color} />
          <text x={x + NODE_R - 8} y={y - NODE_R + 8} textAnchor="middle"
            dominantBaseline="middle" fill="#0F172A" fontSize={10} fontWeight={800}>
            {count}
          </text>
        </g>
      )}

      {/* Name label below */}
      <text x={x} y={y + NODE_R + 16} textAnchor="middle"
        fill={found ? "#F1F5F9" : "#475569"} fontSize={11} fontWeight={600}>
        {name}
      </text>
      <text x={x} y={y + NODE_R + 30} textAnchor="middle"
        fill={found ? color : "#334155"} fontSize={9.5} fontWeight={500}>
        {found ? `${count} record${count !== 1 ? "s" : ""}` : "not found"}
      </text>
    </g>
  );
}

// ── Main graph ────────────────────────────────────────────────────────────────

function DiscoveryGraph({ result }: { result: DataDiscoveryScanResult }) {
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
      {/* SVG graph */}
      <div style={{
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
        border: "1px solid #334155",
        borderRadius: 20,
        padding: "24px 32px",
        boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
        width: "100%",
        maxWidth: 760,
      }}>
        <style>{`
          @keyframes fadeInNode {
            from { opacity: 0; transform: scale(0.7); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes fadeInCenter {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        `}</style>

        <svg viewBox="0 0 740 460" width="100%" style={{ overflow: "visible" }}>
          <defs>
            {result.systems.map((s) => (
              <radialGradient key={s.key} id={`grad-${s.key}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </radialGradient>
            ))}
            <radialGradient id="grad-center" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#60A5FA" stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* Orbit ring */}
          <circle cx={CX} cy={CY} r={ORBIT} fill="none"
            stroke="#1E293B" strokeWidth={1} strokeDasharray="4 6" />

          {/* Connection lines */}
          {result.systems.map((s, i) => {
            const pos = nodePos(i);
            const angle = Math.atan2(pos.y - CY, pos.x - CX);
            return (
              <ConnectionLine key={s.key}
                x1={CX + CENTER_R * Math.cos(angle)}
                y1={CY + CENTER_R * Math.sin(angle)}
                x2={pos.x - NODE_R * Math.cos(angle)}
                y2={pos.y - NODE_R * Math.sin(angle)}
                color={s.color} found={s.found} delay={0.2 + i * 0.1}
              />
            );
          })}

          {/* System nodes */}
          {result.systems.map((s, i) => (
            <DataNode key={s.key} system={s} pos={nodePos(i)} animDelay={0.15 + i * 0.12} />
          ))}

          {/* Centre: subject */}
          <g style={{ animation: "fadeInCenter 0.4s ease forwards" }}>
            <circle cx={CX} cy={CY} r={CENTER_R + 16} fill="url(#grad-center)" />
            <circle cx={CX} cy={CY} r={CENTER_R} fill="#1E293B"
              stroke="#60A5FA" strokeWidth={2.5} />
            <text x={CX} y={CY - 10} textAnchor="middle"
              fill="#60A5FA" fontSize={11} fontWeight={700} letterSpacing={1}>
              SUBJECT
            </text>
            <text x={CX} y={CY + 7} textAnchor="middle"
              fill="#F1F5F9" fontSize={13} fontWeight={800}>
              {result.subject_id.length > 10
                ? result.subject_id.substring(0, 10) + "…"
                : result.subject_id}
            </text>
            <text x={CX} y={CY + 24} textAnchor="middle"
              fill="#64748B" fontSize={9.5}>
              {result.total_records} total records
            </text>
          </g>

          {/* Legend */}
          <g transform="translate(24, 420)">
            <circle cx={6} cy={6} r={5} fill="none" stroke="#60A5FA" strokeWidth={1.5} />
            <text x={16} y={10} fill="#64748B" fontSize={9.5}>found</text>
            <line x1={60} y1={6} x2={80} y2={6} stroke="#334155" strokeWidth={1.2} strokeDasharray="4 3" />
            <text x={86} y={10} fill="#64748B" fontSize={9.5}>not found</text>
          </g>
        </svg>
      </div>

      {/* Record detail cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, width: "100%", maxWidth: 760 }}>
        {result.systems.filter((s) => s.found).map((s) => (
          <div key={s.key} style={{
            background: "#1E293B",
            border: `1px solid ${s.color}44`,
            borderLeft: `3px solid ${s.color}`,
            borderRadius: 12,
            padding: "14px 16px",
          }}>
            <div style={{ color: s.color, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              {s.name}
            </div>
            {s.records.slice(0, 3).map((r, i) => (
              <div key={i} style={{ color: "#94A3B8", fontSize: 11, marginBottom: 4,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                ▸ {r}
              </div>
            ))}
            {s.records.length > 3 && (
              <div style={{ color: "#475569", fontSize: 10, marginTop: 4 }}>
                +{s.records.length - 3} more
              </div>
            )}
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button
          onClick={() => navigate(`/submit?subject_id=${encodeURIComponent(result.subject_id)}`)}
          style={{
            background: "linear-gradient(135deg, #DC2626, #EA580C)",
            color: "#fff", border: "none", borderRadius: 10,
            padding: "12px 28px", fontSize: 14, fontWeight: 700,
            cursor: "pointer", letterSpacing: 0.3,
            boxShadow: "0 4px 20px rgba(220,38,38,0.35)",
          }}>
          Proceed to Deletion →
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "transparent", color: "#64748B",
            border: "1px solid #334155", borderRadius: 10,
            padding: "12px 20px", fontSize: 14, cursor: "pointer",
          }}>
          Scan Again
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DataDiscovery() {
  const [subjectId, setSubjectId] = useState("");
  const [result, setResult] = useState<DataDiscoveryScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const id = subjectId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await scanSubject(id);
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Scan failed — check the subject ID and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto", fontFamily: "Calibri, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: "#F1F5F9", fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
          Data Discovery
        </h1>
        <p style={{ color: "#64748B", marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
          Scan all data stores to find where a subject's data lives before initiating deletion.
          In real systems, user data is spread across many systems — this graph shows exactly where.
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleScan} style={{ display: "flex", gap: 12, marginBottom: 36 }}>
        <input
          ref={inputRef}
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          placeholder="Enter subject ID (e.g. alice, bob, charlie…)"
          style={{
            flex: 1, background: "#1E293B", border: "1px solid #334155",
            borderRadius: 10, padding: "13px 18px", color: "#F1F5F9",
            fontSize: 15, outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={loading || !subjectId.trim()}
          style={{
            background: loading ? "#1E293B" : "linear-gradient(135deg, #2563EB, #7C3AED)",
            color: "#fff", border: "none", borderRadius: 10,
            padding: "13px 28px", fontSize: 15, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: !subjectId.trim() ? 0.5 : 1,
            minWidth: 120,
            transition: "all 0.2s",
          }}>
          {loading ? "Scanning…" : "Scan →"}
        </button>
      </form>

      {/* Demo user chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 32 }}>
        <span style={{ color: "#475569", fontSize: 12, alignSelf: "center" }}>Try:</span>
        {["alice", "bob", "charlie", "diana", "eve", "frank"].map((u) => (
          <button key={u} onClick={() => setSubjectId(u)}
            style={{
              background: "#1E293B", border: "1px solid #334155",
              borderRadius: 6, padding: "4px 12px", color: "#94A3B8",
              fontSize: 12, cursor: "pointer",
            }}>
            {u}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "60px 0" }}>
          <svg width={80} height={80} viewBox="0 0 80 80">
            <circle cx={40} cy={40} r={32} fill="none" stroke="#1E293B" strokeWidth={6} />
            <circle cx={40} cy={40} r={32} fill="none" stroke="#2563EB" strokeWidth={6}
              strokeDasharray={201} strokeDashoffset={150} strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate"
                from="0 40 40" to="360 40 40" dur="1s" repeatCount="indefinite" />
            </circle>
          </svg>
          <p style={{ color: "#64748B", fontSize: 14 }}>
            Scanning PostgreSQL · Redis · Search Index · Analytics · Backup…
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: "#1E293B", border: "1px solid #DC2626", borderRadius: 12,
          padding: "16px 20px", color: "#F87171", fontSize: 14,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Result graph */}
      {result && !loading && <DiscoveryGraph result={result} />}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div style={{
          textAlign: "center", padding: "60px 0",
          color: "#334155", fontSize: 14,
        }}>
          <svg width={64} height={64} viewBox="0 0 64 64" style={{ marginBottom: 16, opacity: 0.4 }}>
            <circle cx={32} cy={32} r={28} fill="none" stroke="#334155" strokeWidth={2} strokeDasharray="6 4" />
            <circle cx={32} cy={32} r={6} fill="#334155" />
            {[0, 72, 144, 216, 288].map((deg, i) => {
              const rad = (deg - 90) * Math.PI / 180;
              return <circle key={i} cx={32 + 18 * Math.cos(rad)} cy={32 + 18 * Math.sin(rad)} r={4} fill="#1E293B" stroke="#334155" strokeWidth={1.5} />;
            })}
          </svg>
          <p>Enter a subject ID above to discover where their data lives</p>
        </div>
      )}
    </div>
  );
}
