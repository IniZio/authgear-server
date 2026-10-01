-- +migrate Up

CREATE TABLE _auth_role_resource_scope (
  id text PRIMARY KEY,
  app_id text NOT NULL,
  created_at timestamp without time zone NOT NULL,
  updated_at timestamp without time zone NOT NULL,
  role_id text NOT NULL REFERENCES _auth_role(id),
  scope_id text NOT NULL REFERENCES _auth_resource_scope(id)
);
CREATE UNIQUE INDEX _auth_role_resource_scope_unique ON _auth_role_resource_scope USING btree (app_id, role_id, scope_id);
CREATE INDEX _auth_role_resource_scope_scope ON _auth_role_resource_scope USING btree (app_id, scope_id);

-- +migrate Down

DROP INDEX IF EXISTS _auth_role_resource_scope_scope;
DROP INDEX IF EXISTS _auth_role_resource_scope_unique;
DROP TABLE IF EXISTS _auth_role_resource_scope;
