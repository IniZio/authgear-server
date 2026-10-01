interface Issue {
  id: string;
  team: string;
  relations?: string[];
  parent?: string;
  [k: string]: unknown;
}

interface Comment {
  id: string;
  issueId: string;
  [k: string]: unknown;
}

interface Team {
  id?: string;
  key?: string;
  [k: string]: unknown;
}

/** issueId -> team, for ids that appear only as references (relations, parent, comment.issueId). */
export type TeamLookup = Record<string, string>;

/**
 * Drop out-of-grant items and out-of-grant nested references. Unknown reference teams are dropped.
 * A single out-of-grant item (get_issue/save_issue) becomes null.
 */
export function filterResponse(tool: string, body: unknown, allowedTeams: string[], lookup: TeamLookup = {}): unknown {
  const ok = (team: string | undefined) => team !== undefined && allowedTeams.includes(team);

  const issue = (i: Issue): Issue | null => {
    if (!ok(i.team)) return null;
    const out: Issue = { ...i };
    if (i.relations) out.relations = i.relations.filter((r) => ok(lookup[r]));
    if (i.parent !== undefined && !ok(lookup[i.parent])) delete out.parent;
    return out;
  };
  const notNull = <T>(v: T | null): v is T => v !== null;

  switch (tool) {
    case "list_teams":
      return (body as Team[]).filter((t) => ok(t.key) || ok(t.id));
    case "list_issues":
    case "search_issues":
      return (body as Issue[]).map(issue).filter(notNull);
    case "get_issue":
    case "save_issue":
      return issue(body as Issue);
    case "list_comments":
      return (body as Comment[]).filter((c) => ok(lookup[c.issueId]));
    default:
      return body;
  }
}
