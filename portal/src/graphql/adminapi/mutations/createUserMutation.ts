import { useCallback } from "react";
import { useMutation } from "@apollo/client";
import {
  CreateUserMutationMutation,
  CreateUserMutationDocument,
} from "./createUserMutation.generated";

interface LoginIDIdentity {
  key: "username" | "email" | "phone";
  value: string;
}

export function useCreateUserMutation(): {
  createUser: (
    identity: LoginIDIdentity,
    password?: string
  ) => Promise<string | null>;
  loading: boolean;
  error: unknown;
} {
  const [mutationFunction, { error, loading }] =
    useMutation<CreateUserMutationMutation>(CreateUserMutationDocument);
  const createUser = useCallback(
    async (identity: LoginIDIdentity, password?: string) => {
      const result = await mutationFunction({
        variables: {
          identityDefinition: identity,
          password,
        },
      });
      const userID = result.data?.createUser.user.id ?? null;
      return userID;
    },
    [mutationFunction]
  );

  return { createUser, error, loading };
}
