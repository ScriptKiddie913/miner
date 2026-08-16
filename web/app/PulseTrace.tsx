// Deterministic waveform generated FROM the node's real tip hash and mempool
// size, so the trace actually changes as the chain advances instead of being
// decorative fake motion. Small xorshift-style PRNG seeded from the hash.

function seededPoints(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  }
  let state = h || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1000) / 1000;
  };
  const points: number[] = [];
  for (let i = 0; i < count; i++) points.push(next());
  return points;
}

function pathFromPoints(points: number[], width: number, height: number, amplitude: number): string {
  const step = width / (points.length - 1);
  const mid = height / 2;
  let d = `M 0 ${mid}`;
  points.forEach((p, i) => {
    const x = i * step;
    const y = mid + (p - 0.5) * amplitude;
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return d;
}

export default function PulseTrace({
  seed,
  anomalous = false,
}: {
  seed: string;
  anomalous?: boolean;
}) {
  const width = 600;
  const height = 44;
  const base = seededPoints(seed, 48);
  const basePath = pathFromPoints(base, width, height, height * 0.6);

  return (
    <svg className="pulse-trace" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={basePath} />
      {anomalous && (
        <path
          className="anomaly-path"
          d={pathFromPoints(seededPoints(seed + ":anomaly", 48), width, height, height * 0.35)}
        />
      )}
    </svg>
  );
}
