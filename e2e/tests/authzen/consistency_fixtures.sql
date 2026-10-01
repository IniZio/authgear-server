INSERT INTO _auth_user
  ("id", "app_id", "created_at", "updated_at", "last_login_at", "login_at", "is_disabled", "disable_reason", "standard_attributes", "custom_attributes", "is_deactivated", "delete_at", "is_anonymized", "anonymize_at", "anonymized_at", "last_indexed_at", "require_reindex_after")
VALUES
  ('{{ .AppID }}-consistency-user', '{{ .AppID }}', NOW(), NOW(), NULL, NULL, 'f', NULL, '{}', '{}', 'f', NULL, 'f', NULL, NULL, NOW(), NOW());

INSERT INTO _auth_role (id, app_id, created_at, updated_at, key, name, description)
VALUES ('{{ .AppID }}-consistency-role', '{{ .AppID }}', NOW(), NOW(), 'consistency_role', 'consistency role', NULL);

INSERT INTO _auth_user_role (id, app_id, created_at, updated_at, user_id, role_id)
VALUES ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-consistency-user', '{{ .AppID }}-consistency-role');

INSERT INTO _auth_resource (id, app_id, created_at, updated_at, uri, name, metadata)
VALUES ('{{ .AppID }}-consistency-resource', '{{ .AppID }}', NOW(), NOW(), 'https://consistency.example.com/api', 'consistency resource', '{}');

INSERT INTO _auth_resource_scope (id, app_id, created_at, updated_at, resource_id, scope, description, metadata)
VALUES
  ('{{ .AppID }}-consistency-scope-read', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-consistency-resource', 'read', 'Read', '{}'),
  ('{{ .AppID }}-consistency-scope-write', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-consistency-resource', 'write', 'Write', '{}'),
  ('{{ .AppID }}-consistency-scope-delete', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-consistency-resource', 'delete', 'Delete', '{}');

-- delete is deliberately not granted.
INSERT INTO _auth_role_resource_scope (id, app_id, created_at, updated_at, role_id, scope_id)
VALUES
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-consistency-role', '{{ .AppID }}-consistency-scope-read'),
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-consistency-role', '{{ .AppID }}-consistency-scope-write');

INSERT INTO _auth_client_resource (id, app_id, created_at, updated_at, client_id, resource_id)
VALUES ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), 'e2em2mclient', '{{ .AppID }}-consistency-resource');
