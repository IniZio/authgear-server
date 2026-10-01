INSERT INTO _auth_resource ("id", "app_id", "created_at", "updated_at", "uri", "name", "metadata") VALUES
  ('{{ .AppID }}-self-resource-01', '{{ .AppID }}', NOW(), NOW(), 'https://selfresource/1', 'Self Resource 1', '{}');

INSERT INTO _auth_resource_scope ("id", "app_id", "created_at", "updated_at", "resource_id", "scope", "description", "metadata") VALUES
  ('{{ .AppID }}-self-scope-read', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-self-resource-01', 'posts:read', 'Read', '{}');

INSERT INTO _auth_role ("id", "app_id", "created_at", "updated_at", "key", "name", "description") VALUES
  ('{{ .AppID }}-self-role-reader', '{{ .AppID }}', NOW(), NOW(), 'reader', 'Reader', NULL);

INSERT INTO _auth_role_resource_scope ("id", "app_id", "created_at", "updated_at", "role_id", "scope_id") VALUES
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), '{{ .AppID }}-self-role-reader', '{{ .AppID }}-self-scope-read');

-- The user is created by the user_import hook, which runs before this file.
INSERT INTO _auth_user_role ("id", "app_id", "created_at", "updated_at", "user_id", "role_id")
SELECT '{{ uuidv4 }}', u.app_id, NOW(), NOW(), u.id, '{{ .AppID }}-self-role-reader'
FROM _auth_user u
WHERE u.app_id = '{{ .AppID }}';
