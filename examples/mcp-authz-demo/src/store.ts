export interface Doc {
  id: string;
  title: string;
  body: string;
  status: "draft" | "published";
  updatedAt: string;
}

const now = () => new Date().toISOString();

const seed: Omit<Doc, "updatedAt">[] = [
  {
    id: "handbook",
    title: "Engineering Handbook",
    status: "published",
    body: "How we work at Acme: small pull requests, same-day reviews, and a blameless culture. Deploys happen on weekdays before 4pm.",
  },
  {
    id: "incident-runbook",
    title: "Incident Response Runbook",
    status: "published",
    body: "1. Declare the incident in #incidents. 2. Assign an incident commander. 3. Mitigate first, investigate later. 4. Write the postmortem within 3 days.",
  },
  {
    id: "security-policy",
    title: "Security Policy",
    status: "published",
    body: "Use the company password manager and a hardware key. Report suspected phishing to security@acme.example. Customer data never leaves production.",
  },
  {
    id: "onboarding",
    title: "New Hire Onboarding",
    status: "published",
    body: "Week 1: laptop, accounts, and a buddy. Week 2: ship a small fix to production. Week 4: your first on-call shadow shift.",
  },
  {
    id: "roadmap-q4",
    title: "Q4 Roadmap",
    status: "draft",
    body: "Draft: launch the docs search revamp, retire the legacy wiki, and pilot AI-assisted runbooks with the SRE team.",
  },
];

const docs = new Map<string, Doc>(
  seed.map((d) => [d.id, { ...d, updatedAt: now() }]),
);

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";

export const store = {
  search(query: string): Doc[] {
    const q = query.toLowerCase();
    return [...docs.values()].filter(
      (d) => d.title.toLowerCase().includes(q) || d.body.toLowerCase().includes(q),
    );
  },

  get(id: string): Doc | undefined {
    return docs.get(id);
  },

  create(title: string, body: string): Doc {
    let id = slug(title);
    for (let n = 2; docs.has(id); n++) id = `${slug(title)}-${n}`;
    const doc: Doc = { id, title, body, status: "draft", updatedAt: now() };
    docs.set(id, doc);
    return doc;
  },

  update(id: string, patch: { title?: string; body?: string }): Doc | undefined {
    const doc = docs.get(id);
    if (!doc) return undefined;
    Object.assign(doc, patch, { updatedAt: now() });
    return doc;
  },

  remove(id: string): boolean {
    return docs.delete(id);
  },

  publish(id: string): Doc | undefined {
    const doc = docs.get(id);
    if (!doc) return undefined;
    Object.assign(doc, { status: "published", updatedAt: now() });
    return doc;
  },
};
