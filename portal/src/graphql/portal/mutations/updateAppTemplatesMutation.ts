import { useCallback } from "react";
import { gql } from "@apollo/client";
import { useGraphqlMutation } from "../../../hook/graphql";
import { client } from "../apollo";
import { AppResourceUpdate } from "../__generated__/globalTypes";
import {
  UpdateAppTemplatesMutation,
  UpdateAppTemplatesMutationVariables,
} from "./__generated__/UpdateAppTemplatesMutation";
import { PortalAPIApp } from "../../../types";
import {
  ResourceUpdate,
  binary,
  encodeForText,
  expandSpecifier,
} from "../../../util/resource";

const updateAppTemplatesMutation = gql`
  mutation UpdateAppTemplatesMutation(
    $appID: ID!
    $updates: [AppResourceUpdate!]!
    $paths: [String!]!
  ) {
    updateApp(input: { appID: $appID, updates: $updates }) {
      app {
        id
        resources(paths: $paths) {
          path
          languageTag
          data
          effectiveData
        }
        resourceLocales: resources {
          path
          languageTag
        }
      }
    }
  }
`;

export type AppTemplatesUpdater = (
  updates: ResourceUpdate[]
) => Promise<PortalAPIApp | null>;

export function useUpdateAppTemplatesMutation(appID: string): {
  updateAppTemplates: AppTemplatesUpdater;
  loading: boolean;
  error: unknown;
  resetError: () => void;
} {
  const [mutationFunction, { error, loading }, resetError] = useGraphqlMutation<
    UpdateAppTemplatesMutation,
    UpdateAppTemplatesMutationVariables
  >(updateAppTemplatesMutation, {
    client,
  });
  const updateAppTemplates = useCallback(
    async (updates: ResourceUpdate[]) => {
      const paths = [];
      for (const specifier of updates.map((u) => u.specifier)) {
        paths.push(expandSpecifier(specifier));
      }

      const updatePayload: AppResourceUpdate[] = updates.map((update) => {
        let transform: (a: string) => string;
        switch (update.specifier.def.type) {
          case "text":
            transform = encodeForText;
            break;
          case "binary":
            transform = binary;
            break;
          default:
            throw new Error(
              "unexpected resource type: " + String(update.specifier.def.type)
            );
        }
        return {
          path: update.path,
          data: update.value == null ? null : transform(update.value),
        };
      });

      const result = await mutationFunction({
        variables: {
          appID,
          paths,
          updates: updatePayload,
        },
      });
      return result.data?.updateApp.app ?? null;
    },
    [appID, mutationFunction]
  );
  return { updateAppTemplates, error, loading, resetError };
}
