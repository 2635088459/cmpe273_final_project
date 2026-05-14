import { useNavigate } from "react-router-dom";
import { DataDiscoveryScanResult, SystemScanResult } from "../services/api";

const CX = 260, CY = 190, ORBIT = 140, NODE_R = 38, CENTER_R = 46;
const ANGLES = [-90, -18, 54, 126, 198].map((d) => (d * Math.PI) / 180);

function nodePos(i: number) {
  return { x: CX + ORBIT * Math.cos(ANGLES[i]), y: CY + ORBIT * Math.sin(ANGLES[i]) };
}

function PulseRing({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <circle cx={x} cy={y} r={NODE_R + 6} fill="none" stroke={color} strokeWidth={1.4} opacity={0.2}>
      <animate attributeName="r" values={`${NODE_R + 4};${NODE_R + 16};${NODE_R + 4}`} dur="2.4s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.3;0;0.3" dur="2.4s" repeatCount="indefinite" />
    </circle>
  );
}

function DataNode({ system, pos, delay }: { system: SystemScanResult; pos: { x: number; y: number }; delay: number }) {
  const { x, y } = pos;
  const { color, found, name, count } = system;
  const icon = ({ postgres: "PG", redis: "RD", search: "ES", analytics: "AN", backup: "S3" } as any)[system.key] ?? "??";

  return (
    <g style={{ opacity: 0, animation: `fadeInNode 0.45s ease ${delay}s forwards` }}>
      {found && <PulseRing x={x} y={y} color={color} />}
      <circle cx={x} cy={y} r={NODE_R} fill={found ? `${color}1A` : "#1E293B"} stroke={found ? color : "#334155"} strokeWidth={found ? 2 : 1.4} />
      <text x={x} y={y - 5} textAnchor="middle" dominantBaseline="middle" fill={found ? color : "#475569"} fontSize={12} fontWeight={700} fontFamily="monospace">{icon}</text>
      {found && (
        <g>
          <circle cx={x + NODE_R - 7} cy={y - NODE_R + 7} r={12} fill={color} />
          <text x={x + NODE_R - 7} y={y - NODE_R + 7} textAnchor="middle" dominantBaseline="middle" fill="#0F172A" fontSize={9} fontWeight={800}>{count}</text>
        </g>
      )}
      <text x={x} y={y + NODE_R + 14} textAnchor="middle" fill={found ? "#F1F5F9" : "#475569"} fontSize={10} fontWeight={600}>{name}</text>
      <text x={x} y={y + NODE_R + 26} textAnchor="middle" fill={found ? color : "#334155"} fontSize={8.5}>
        {found ? `${count} record${count !== 1 ? "s" : ""}` : "not found"}
      </text>
    </g>
  );
}

export function DiscoveryGraph({ result, compact = false }: { result: DataDiscoveryScanResult; compact?: boolean }) {
  const navigate = useNavigate();
  const vw = compact ? 520 : 650;
  const vh = compact ? 380 : 420;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 12 : 20 }}>
      <div style={{
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
        border: "1px solid #334155", borderRadius: 16,
        padding: compact ? "16px 20px" : "20px 28px",
        width: "100%",
        boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
      }}>
        <style>{`
          @keyframes fadeInNode { from { opacity:0; transform:scale(0.7); } to { opacity:1; transform:scale(1); } }
          @keyframes fadeInC    { from { opacity:0; } to { opacity:1; } }
        `}</style>
        <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" style={{ overflow: "visible" }}>
          {/* Orbit ring */}
          <circle cx={CX} cy={CY} r={ORBIT} fill="none" stroke="#1E293B" strokeWidth={1} strokeDasharray="4 6" />

          {/* Lines */}
          {result.systems.map((s, i) => {
            const pos = nodePos(i);
            const angle = Math.atan2(pos.y - CY, pos.x - CX);
            const x1 = CX + CENTER_R * Math.cos(angle), y1 = CY + CENTER_R * Math.sin(angle);
            const x2 = pos.x - NODE_R * Math.cos(angle), y2 = pos.y - NODE_R * Math.sin(angle);
            return (
              <line key={s.key} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={s.found ? s.color : "#334155"}
                strokeWidth={s.found ? 1.8 : 1}
                strokeDasharray={s.found ? "none" : "5 4"}
                opacity={s.found ? 0.7 : 0.3} />
            );
          })}

          {/* Nodes */}
          {result.systems.map((s, i) => (
            <DataNode key={s.key} system={s} pos={nodePos(i)} delay={0.1 + i * 0.1} />
          ))}

          {/* Centre */}
          <g style={{ animation: "fadeInC 0.3s ease forwards" }}>
            <circle cx={CX} cy={CY} r={CENTER_R} fill="#1E293B" stroke="#60A5FA" strokeWidth={2.2} />
            <text x={CX} y={CY - 9} textAnchor="middle" fill="#60A5FA" fontSize={9.5} fontWeight={700} letterSpacing={1}>SUBJECT</text>
            <text x={CX} y={CY + 7} textAnchor="middle" fill="#F1F5F9" fontSize={12} fontWeight={800}>
              {result.subject_id.length > 10 ? result.subject_id.slice(0, 10) + "…" : result.subject_id}
            </text>
            <text x={CX} y={CY + 22} textAnchor="middle" fill="#64748B" fontSize={8.5}>{result.total_records} records</text>
          </g>

          {/* Legend */}
          <g transform={`translate(16, ${vh - 22})`}>
            <circle cx={5} cy={5} r={4} fill="none" stroke="#60A5FA" strokeWidth={1.2} />
            <text x={13} y={9} fill="#64748B" fontSize={8}>found</text>
            <line x1={50} y1={5} x2={66} y2={5} stroke="#334155" strokeWidth={1} strokeDasharray="4 3" />
            <text x={70} y={9} fill="#64748B" fontSize={8}>not found</text>
          </g>
        </svg>
      </div>

      {/* CTA */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => navigate(`/submit?subject_id=${encodeURIComponent(result.subject_id)}`)}
          style={{
            background: "linear-gradient(135deg,#DC2626,#EA580C)", color: "#fff",
            border: "none", borderRadius: 8, padding: "10px 22px",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(220,38,38,0.3)",
          }}>
          Proceed to Deletion →
        </button>
        {compact && (
          <button onClick={() => navigate(`/discover?subject_id=${encodeURIComponent(result.subject_id)}`)}
            style={{ background: "transparent", color: "#60A5FA", border: "1px solid #334155", borderRadius: 8, padding: "10px 18px", fontSize: 13, cursor: "pointer" }}>
            Full View
          </button>
        )}
      </div>
    </div>
  );
}
