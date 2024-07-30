# 2FA Grace Period

- [Abstract](#abstract)
- [Configuration and the global grace period](#configuration-and-the-global-grace-period)
- [Per-user Grace Period](#per-user-grace-period)
  - [Changes on the Admin GraphQL API](#changes-on-the-admin-graphql-api)
    - [Error Response](#error-response)
  - [Changes on database schema](#changes-on-database-schema)
- [Changes on the configuration of authentication flow](#changes-on-the-configuration-of-authentication-flow)

## Abstract

In order to enforce 2FA, we will provide a grace period for users to enroll in 2FA after they have signed up.

After the grace period, the user will be required to enroll in 2FA before they can sign in.

## Configuration and the global grace period

Global grace period can be enabled for forcing users to enroll in 2FA upon login instead of blocking them.

```yaml
authentication:
  secondary_authentication_mode: "required"
  secondary_authentication_grace_period:
    enabled: true
    end_at: "2021-01-01T00:00:00Z"
```

By default, no grace period is provided. User without 2FA must contact admin to login after [2FA mode](./user-model.md#secondary-authenticator) is set to `required`.

## Per-user Grace Period

Regardless of global grace period, specific users can be granted grace period through Admin Portal / GraphQL API.

### Changes on the Admin GraphQL API

```gql
type User {
  id: ID!
  # ...

  mfaGracePeriodEndAt: DateTime
}

type SetMFAGracePeriodInput {
  userID: ID!
  endAt: DateTime!
}

type SetMFAGracePeriodPayload {
  user: User!
}

type RemoveMFAGracePeriodInput {
  userID: ID!
}

type RemoveMFAGracePeriodPayload {
  user: User!
}

type Mutation {
  setMFAGracePeriod(
    input: SetMFAGracePeriodInput!
  ): SetMFAGracePeriodPayload!
  removeMFAGracePeriod(
    input: RemoveMFAGracePeriodInput!
  ): RemoveMFAGracePeriodPayload!
}
```

Both `setMFAGracePeriod` and `removeMFAGracePeriod` mutations are indempotent, users can have grace period granted/revoked multiple times even with same value.

#### Error Response

|Description|Name|Reason|Info|
|---|---|---|---|
|Invalid Grace Period e.g. in the past|`Invalid`|`GracePeriodInvalid`|`endAt` must be in the future.|

### Changes on database schema

Per-user grace period granted through Admin API is stored in the user model as `mfa_grace_period_end_at`.

```sql
ALTER TABLE _authgear_user ADD COLUMN mfa_grace_period_end_at TIMESTAMP WITHOUT TIME ZONE;
```

## Changes on the configuration of authentication flow

`enrollment_allowed: true` is added to `authenticate` step to allow enrolling any of the authenticators before proceeding.

```yaml
authentication_flow:
  login_flows:
    - name: internal_user
      steps:
        - type: identify
          one_of:
            - identification: phone
            - identification: email
        - type: authenticate
          one_of:
            - authentication: primary_password
        - type: authenticate
          # Requires user to satisfy one of the following authentication.
          optional: false # or null
          # If the end-user has no applicable authentication method,
          # then enrollment will be required before proceeding.
          # enrollment_allowed by default is false, meaning user with no applicable method beforehand will be blocked from proceeding.
          enrollment_allowed: true
          one_of:
            - authentication: secondary_totp
            - authentication: recovery_code
```

Following table describes the behavior of `enrollment_allowed` with `optional`:

| `optional` | `enrollment_allowed` | Behavior                                                         |
| ---------- | -------------------- | ---------------------------------------------------------------- |
| `true`     | `true`               | Skip the step if user has no applicable authenticator.           |
| `true`     | `false`              | Skip the step if user has no applicable authenticator.           |
| `false`    | `true`               | User must enroll at least one authenticator before proceeding.   |
| `false`    | `false`              | User will not be able to proceed if no applicable authenticator. |
