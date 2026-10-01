export type Tool =
  | "list_teams"
  | "list_issues"
  | "search_issues"
  | "get_issue"
  | "save_issue"
  | "list_comments"
  | "save_comment"
  | "delete_comment";

export interface AuthzenRequest {
  action: string;
  resource: { type: string; id?: string; properties: { team: string } };
}

export interface Resolved {
  team?: string;
  oldTeam?: string;
}

export interface ResolverNeed {
  kind: "issue" | "comment";
  id: string;
}

export interface EmptyResult {
  empty: true;
}

export type Args = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** Action for tools/list filtering. save_* uses the write-most action (create/update differ per call). */
export function toolAction(tool: string): string | undefined {
  switch (tool) {
    case "list_teams":
      return "team:read";
    case "list_issues":
    case "search_issues":
    case "get_issue":
      return "issue:read";
    case "save_issue":
      return "issue:write";
    case "list_comments":
      return "comment:read";
    case "save_comment":
      return "comment:create";
    case "delete_comment":
      return "comment:delete";
    default:
      return undefined;
  }
}

/** Which upstream id the gateway must resolve to a team before evaluating. */
export function needsResolver(tool: string, args: Args): ResolverNeed | undefined {
  switch (tool) {
    case "get_issue": {
      const id = str(args.id);
      return id ? { kind: "issue", id } : undefined;
    }
    case "save_issue": {
      const id = str(args.id);
      return id ? { kind: "issue", id } : undefined;
    }
    case "list_comments":
    case "save_comment": {
      const id = str(args.issueId);
      return id ? { kind: "issue", id } : undefined;
    }
    case "delete_comment": {
      const id = str(args.id);
      return id ? { kind: "comment", id } : undefined;
    }
    default:
      return undefined;
  }
}

const issueReq = (action: string, id: string | undefined, team: string): AuthzenRequest => ({
  action,
  resource: { type: "linear:issue", ...(id ? { id } : {}), properties: { team } },
});

/**
 * Requests to evaluate for a tool call; all must allow.
 * List/search tools are not evaluated per call (args rewritten, response filtered).
 * Returns [] when a required team is unresolved; the caller treats that as not-found.
 */
export function toAuthzenRequests(tool: string, args: Args, resolved: Resolved): AuthzenRequest[] {
  switch (tool) {
    case "get_issue":
      return resolved.team ? [issueReq("issue:read", str(args.id), resolved.team)] : [];
    case "save_issue": {
      const id = str(args.id);
      const newTeam = str(args.team);
      if (!id) return newTeam ? [issueReq("issue:write", undefined, newTeam)] : [];
      const old = resolved.oldTeam ?? resolved.team;
      if (!old) return [];
      const reqs = [issueReq("issue:write", id, old)];
      if (newTeam && newTeam !== old) reqs.push(issueReq("issue:write", id, newTeam));
      return reqs;
    }
    case "list_comments":
      return resolved.team
        ? [{ action: "comment:read", resource: { type: "linear:comment", properties: { team: resolved.team } } }]
        : [];
    case "save_comment":
      return resolved.team
        ? [
            {
              action: str(args.id) ? "comment:update" : "comment:create",
              resource: {
                type: "linear:comment",
                ...(str(args.id) ? { id: str(args.id) } : {}),
                properties: { team: resolved.team },
              },
            },
          ]
        : [];
    case "delete_comment":
      return resolved.team
        ? [
            {
              action: "comment:delete",
              resource: { type: "linear:comment", id: str(args.id), properties: { team: resolved.team } },
            },
          ]
        : [];
    default:
      return [];
  }
}

/** Constrain list args to the grant's teams; out-of-grant team yields an empty-result marker. */
export function rewriteListArgs(args: Args, allowedTeams: string[]): { args: Args } | EmptyResult {
  const team = str(args.team);
  if (team !== undefined) {
    return allowedTeams.includes(team) ? { args } : { empty: true };
  }
  if (allowedTeams.length === 0) return { empty: true };
  return { args: { ...args, team: allowedTeams } };
}

export function notFoundText(kind: "issue" | "comment", id: string): string {
  return `${kind === "issue" ? "Issue" : "Comment"} ${id} not found`;
}
