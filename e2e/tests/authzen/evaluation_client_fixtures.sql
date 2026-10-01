-- Resources: 1 is associated with e2em2mclient, 2 is not.
INSERT INTO _auth_resource ("id", "app_id", "created_at", "updated_at", "uri", "name", "metadata") VALUES
  ('{{ .AppID }}-eval-resource-01', '{{ .AppID }}', NOW(), NOW(), 'https://evalresource/1', 'Eval Resource 1', '{}'),
  ('{{ .AppID }}-eval-resource-02', '{{ .AppID }}', NOW(), NOW(), 'https://evalresource/2', 'Eval Resource 2', '{}');

INSERT INTO _auth_resource_scope ("id", "app_id", "created_at", "updated_at", "resource_id", "scope", "description", "metadata") VALUES
  ('{{ .AppID }}-eval-scope-read', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-eval-resource-01', 'posts:read', 'Read', '{}'),
  ('{{ .AppID }}-eval-scope-write', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-eval-resource-01', 'posts:write', 'Write', '{}'),
  ('{{ .AppID }}-eval-scope-admin', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-eval-resource-01', 'posts:admin', 'Admin, granted to nobody', '{}'),
  ('{{ .AppID }}-eval-scope-other', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-eval-resource-02', 'other:read', 'Other', '{}');

-- Associate resource 1 only with the m2m client.
INSERT INTO _auth_client_resource ("id", "app_id", "created_at", "updated_at", "client_id", "resource_id") VALUES
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), 'e2em2mclient', '{{ .AppID }}-eval-resource-01');

-- Users
INSERT INTO _auth_user ("id", "app_id", "created_at", "updated_at", "is_disabled", "standard_attributes") VALUES
  ('{{ .AppID }}-user-direct', '{{ .AppID }}', NOW(), NOW(), FALSE, '{}'),
  ('{{ .AppID }}-user-group', '{{ .AppID }}', NOW(), NOW(), FALSE, '{}'),
  ('{{ .AppID }}-user-none', '{{ .AppID }}', NOW(), NOW(), FALSE, '{}'),
  ('{{ .AppID }}-user-disabled', '{{ .AppID }}', NOW(), NOW(), TRUE, '{}');

-- Roles and group
INSERT INTO _auth_role ("id", "app_id", "created_at", "updated_at", "key", "name", "description") VALUES
  ('{{ .AppID }}-role-reader', '{{ .AppID }}', NOW(), NOW(), 'reader', 'Reader', NULL),
  ('{{ .AppID }}-role-writer', '{{ .AppID }}', NOW(), NOW(), 'writer', 'Writer', NULL);

INSERT INTO _auth_group ("id", "app_id", "created_at", "updated_at", "key", "name", "description") VALUES
  ('{{ .AppID }}-group-writers', '{{ .AppID }}', NOW(), NOW(), 'writers', 'Writers', NULL);

INSERT INTO _auth_group_role ("id", "app_id", "created_at", "updated_at", "group_id", "role_id") VALUES
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-group-writers', '{{ .AppID }}-role-writer');

-- user-direct and user-disabled hold the reader role; user-group is in the writers group.
INSERT INTO _auth_user_role ("id", "app_id", "created_at", "updated_at", "user_id", "role_id") VALUES
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-user-direct', '{{ .AppID }}-role-reader'),
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-user-disabled', '{{ .AppID }}-role-reader');

INSERT INTO _auth_user_group ("id", "app_id", "created_at", "updated_at", "user_id", "group_id") VALUES
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-user-group', '{{ .AppID }}-group-writers');

-- Grants
INSERT INTO _auth_role_resource_scope ("id", "app_id", "created_at", "updated_at", "role_id", "scope_id") VALUES
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-role-reader', '{{ .AppID }}-eval-scope-read'),
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-role-writer', '{{ .AppID }}-eval-scope-write');
