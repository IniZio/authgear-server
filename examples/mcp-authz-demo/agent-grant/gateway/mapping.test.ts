import assert from "node:assert/strict";
import { test } from "node:test";
import { needsResolver, notFoundText, rewriteListArgs, toAuthzenRequests, toolAction } from "./mapping.ts";

test("AC1 save_issue update with team change evaluates old and new team", () => {
  const reqs = toAuthzenRequests("save_issue", { id: "ENG-2", team: "OPS", title: "t" }, { oldTeam: "ENG" });
  assert.deepEqual(reqs, [
    { action: "issue:write", resource: { type: "linear:issue", id: "ENG-2", properties: { team: "ENG" } } },
    { action: "issue:write", resource: { type: "linear:issue", id: "ENG-2", properties: { team: "OPS" } } },
  ]);
});

test("save_issue update without team change is one request; create uses args.team", () => {
  assert.equal(toAuthzenRequests("save_issue", { id: "ENG-2", team: "ENG" }, { oldTeam: "ENG" }).length, 1);
  assert.deepEqual(toAuthzenRequests("save_issue", { team: "ENG", title: "t" }, {}), [
    { action: "issue:write", resource: { type: "linear:issue", properties: { team: "ENG" } } },
  ]);
});

test("AC2 rewriteListArgs", () => {
  assert.deepEqual(rewriteListArgs({ team: "OPS" }, ["ENG"]), { empty: true });
  assert.deepEqual(rewriteListArgs({ team: "ENG" }, ["ENG"]), { args: { team: "ENG" } });
  assert.deepEqual(rewriteListArgs({}, ["ENG"]), { args: { team: ["ENG"] } });
  assert.deepEqual(rewriteListArgs({}, []), { empty: true });
});

test("AC4 delete_comment maps to comment:delete", () => {
  assert.deepEqual(toAuthzenRequests("delete_comment", { id: "c1" }, { team: "ENG" }), [
    { action: "comment:delete", resource: { type: "linear:comment", id: "c1", properties: { team: "ENG" } } },
  ]);
  assert.deepEqual(needsResolver("delete_comment", { id: "c1" }), { kind: "comment", id: "c1" });
  assert.equal(toolAction("delete_comment"), "comment:delete");
});

test("save_comment create vs update; unresolved team yields no requests", () => {
  assert.equal(toAuthzenRequests("save_comment", { issueId: "ENG-1", body: "x" }, { team: "ENG" })[0]?.action, "comment:create");
  assert.equal(toAuthzenRequests("save_comment", { issueId: "ENG-1", id: "c", body: "x" }, { team: "ENG" })[0]?.action, "comment:update");
  assert.deepEqual(toAuthzenRequests("get_issue", { id: "X-1" }, {}), []);
});

test("resolver needs and not-found text", () => {
  assert.deepEqual(needsResolver("get_issue", { id: "ENG-1" }), { kind: "issue", id: "ENG-1" });
  assert.equal(needsResolver("list_issues", {}), undefined);
  assert.equal(notFoundText("issue", "FIN-1"), "Issue FIN-1 not found");
  assert.equal(notFoundText("comment", "c1"), "Comment c1 not found");
});
