import assert from "node:assert/strict";
import { test } from "node:test";
import { filterResponse } from "./filter.ts";

const lookup = { "ENG-1": "ENG", "ENG-2": "ENG", "OPS-1": "OPS" };

test("AC3 drops OPS items and ENG-2 relation to OPS-1", () => {
  const body = [
    { id: "ENG-2", team: "ENG", title: "a", relations: ["ENG-1", "OPS-1"], parent: "OPS-1" },
    { id: "OPS-1", team: "OPS", title: "b" },
  ];
  assert.deepEqual(filterResponse("list_issues", body, ["ENG"], lookup), [
    { id: "ENG-2", team: "ENG", title: "a", relations: ["ENG-1"] },
  ]);
});

test("single out-of-grant issue becomes null; list_teams and comments filtered", () => {
  assert.equal(filterResponse("get_issue", { id: "OPS-1", team: "OPS", title: "b" }, ["ENG"], lookup), null);
  assert.deepEqual(filterResponse("list_teams", [{ key: "ENG" }, { key: "OPS" }], ["ENG"]), [{ key: "ENG" }]);
  assert.deepEqual(
    filterResponse("list_comments", [{ id: "c1", issueId: "ENG-1" }, { id: "c2", issueId: "OPS-1" }], ["ENG"], lookup),
    [{ id: "c1", issueId: "ENG-1" }],
  );
});
