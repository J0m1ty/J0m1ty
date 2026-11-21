// Generates assets/top-langs.svg from the GitHub GraphQL API.
// Usage: GITHUB_TOKEN=... USERNAME=J0m1ty LANGS_COUNT=8 node .github/scripts/top-langs.mjs
import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const login = process.env.USERNAME || "J0m1ty";
const count = Number(process.env.LANGS_COUNT || 8);
const out = process.env.OUTPUT || "assets/top-langs.svg";
if (!token) throw new Error("GITHUB_TOKEN is required");

const query = `
query($login: String!, $after: String) {
  user(login: $login) {
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      pageInfo { hasNextPage endCursor }
      nodes {
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

async function gql(variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

const totals = new Map();
let after = null;
do {
  const { user } = await gql({ login, after });
  for (const repo of user.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) {
      const cur = totals.get(node.name) ?? { name: node.name, color: node.color || "#858585", size: 0 };
      cur.size += size;
      totals.set(node.name, cur);
    }
  }
  after = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
} while (after);

const langs = [...totals.values()].sort((a, b) => b.size - a.size).slice(0, count);
const sum = langs.reduce((s, l) => s + l.size, 0) || 1;
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Layout (compact): title, stacked bar, two-column legend.
const width = 300, pad = 25, barW = width - pad * 2;
const rows = Math.ceil(langs.length / 2);
const height = 90 + rows * 25;

let x = 0;
const bar = langs.map((l) => {
  const w = (l.size / sum) * barW;
  const rect = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="8" fill="${l.color}"/>`;
  x += w;
  return rect;
}).join("");

const legend = langs.map((l, i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const pct = ((l.size / sum) * 100).toFixed(2);
  return `<g transform="translate(${col * 150}, ${row * 25})">
      <circle cx="5" cy="6" r="5" fill="${l.color}"/>
      <text x="15" y="10" class="lang">${esc(l.name)} ${pct}%</text>
    </g>`;
}).join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">
  <title id="title">Most Used Languages</title>
  <style>
    .card { fill: #fffefe; stroke: #e4e2e2; }
    .title { font: 600 18px 'Segoe UI', Ubuntu, sans-serif; fill: #2f80ed; }
    .lang { font: 400 11px 'Segoe UI', Ubuntu, sans-serif; fill: #434d58; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #0d1117; stroke: #30363d; }
      .title { fill: #58a6ff; }
      .lang { fill: #c9d1d9; }
    }
  </style>
  <rect class="card" x="0.5" y="0.5" rx="4.5" width="${width - 1}" height="${height - 1}"/>
  <text x="${pad}" y="35" class="title">Most Used Languages</text>
  <mask id="bar-mask"><rect x="${pad}" y="55" width="${barW}" height="8" rx="5" fill="white"/></mask>
  <g mask="url(#bar-mask)"><g transform="translate(${pad}, 55)">${bar}</g></g>
  <g transform="translate(${pad}, 80)">
    ${legend}
  </g>
</svg>
`;

await mkdir(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(out, svg);
console.log(`Wrote ${out}: ${langs.map((l) => l.name).join(", ")}`);
