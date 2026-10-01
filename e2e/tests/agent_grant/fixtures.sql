-- The gateway (e2em2mclient) and the orchestrator (e2econfidential) are both associated with the resource that is the audience of the Grant.
INSERT INTO _auth_resource ("id", "app_id", "created_at", "updated_at", "uri", "name", "metadata", "access_policy") VALUES
  ('{{ .AppID }}-agent-resource-01', '{{ .AppID }}', NOW(), NOW(), 'https://linear-gateway/mcp', 'Linear Gateway', '{}', '{"allow_static_first_party_client_access": true}');

INSERT INTO _auth_client_resource ("id", "app_id", "created_at", "updated_at", "client_id", "resource_id") VALUES
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), 'e2em2mclient', '{{ .AppID }}-agent-resource-01'),
  ('{{ uuidv4 }}', '{{ .AppID }}', NOW(), NOW(), 'e2econfidential', '{{ .AppID }}-agent-resource-01');
