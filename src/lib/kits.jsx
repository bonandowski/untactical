import React from 'react';

// Club kits as SVG patterns, drawn in objectBoundingBox units so they fit any circle.
export const kitId = (slug, away) => `kit-${slug}${away ? '-away' : ''}`;

function KitPattern({ id, kit }) {
  const [a, b = '#ffffff', c = '#000000', d = '#000000'] = kit.c;
  let body;
  if (kit.p === 'stripes') {
    body = [0, 1, 2, 3, 4].map((i) => <rect key={i} x={i * 0.2} y={0} width={0.2} height={1} fill={i % 2 ? b : a} />);
  } else if (kit.p === 'halves') {
    body = [<rect key="l" x={0} y={0} width={0.5} height={1} fill={a} />, <rect key="r" x={0.5} y={0} width={0.5} height={1} fill={b} />];
  } else if (kit.p === 'band') {
    body = [
      <rect key="base" width={1} height={1} fill={a} />,
      <rect key="w1" y={0.36} width={1} height={0.06} fill={b} />,
      <rect key="r" y={0.42} width={1} height={0.08} fill={c} />,
      <rect key="k" y={0.5} width={1} height={0.08} fill={d} />,
      <rect key="w2" y={0.58} width={1} height={0.06} fill={b} />,
    ];
  } else if (kit.p === 'diagonal') {
    body = [<rect key="base" width={1} height={1} fill={b} />, <polygon key="d" points="0,0 1,0 0,1" fill={a} />];
  } else {
    body = <rect width={1} height={1} fill={a} />;
  }
  return (
    <pattern id={id} patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width={1} height={1}>
      {body}
    </pattern>
  );
}

// One hidden SVG with every kit pattern, referenced by url(#id) from any chart on the page.
export function KitDefs({ teams }) {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {teams.flatMap((t) => [
          <KitPattern key={kitId(t.slug)} id={kitId(t.slug)} kit={t.kit} />,
          <KitPattern key={kitId(t.slug, true)} id={kitId(t.slug, true)} kit={t.away_kit} />,
        ])}
      </defs>
    </svg>
  );
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const dist = (h1, h2) => {
  const [a, b] = [rgb(h1), rgb(h2)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};
const CLASH = 140;

// Kits for a match: the away side switches to its second kit when the colours clash.
export function matchKits(home, away) {
  const clash = dist(home.kit.c[0], away.kit.c[0]) < CLASH;
  const awayKit = clash ? away.away_kit : away.kit;
  return {
    [home.slug]: { kit: home.kit, fill: home.kit.p === 'solid' ? home.kit.c[0] : `url(#${kitId(home.slug)})` },
    [away.slug]: { kit: awayKit, fill: awayKit.p === 'solid' ? awayKit.c[0] : `url(#${kitId(away.slug, clash)})` },
  };
}

export function teamKit(team) {
  return { kit: team.kit, fill: team.kit.p === 'solid' ? team.kit.c[0] : `url(#${kitId(team.slug)})` };
}
