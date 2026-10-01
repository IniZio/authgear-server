export type TeamKey = "ENG" | "OPS" | "FIN";

export interface Team {
  key: TeamKey;
  name: string;
}

export interface Issue {
  id: string;
  team: TeamKey;
  title: string;
  /** Ids of related issues; may cross teams. */
  relations: string[];
}

export interface Comment {
  id: string;
  issueId: string;
  body: string;
}

/** Teams the static API key's user (alice) belongs to. All others are invisible. */
export const memberTeams: readonly TeamKey[] = ["ENG", "OPS"];

export const teams: Team[] = [
  { key: "ENG", name: "Engineering" },
  { key: "OPS", name: "Operations" },
  { key: "FIN", name: "Finance" },
];

export const issues: Issue[] = [
  { id: "ENG-1", team: "ENG", title: "Fix login outage on mobile", relations: [] },
  { id: "ENG-2", team: "ENG", title: "Add retry to webhook sender", relations: ["OPS-1"] },
  { id: "ENG-3", team: "ENG", title: "Upgrade Node runtime", relations: [] },
  { id: "OPS-1", team: "OPS", title: "Investigate database outage", relations: [] },
  { id: "OPS-2", team: "OPS", title: "Rotate on-call schedule", relations: [] },
  { id: "FIN-1", team: "FIN", title: "Reconcile Q3 invoices", relations: [] },
];

export const comments: Comment[] = [
  { id: "C-1", issueId: "ENG-1", body: "Reproduced on iOS 17." },
  { id: "C-2", issueId: "ENG-2", body: "Blocked on OPS-1." },
  { id: "C-3", issueId: "OPS-1", body: "Failover completed." },
  { id: "C-4", issueId: "OPS-2", body: "New rota starts Monday." },
];
