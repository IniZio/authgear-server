import * as Types from '../globalTypes.generated';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type RemoveScopesFromRoleMutationMutationVariables = Types.Exact<{
  roleKey: Types.Scalars['String']['input'];
  resourceURI: Types.Scalars['String']['input'];
  scopes: Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input'];
}>;


export type RemoveScopesFromRoleMutationMutation = { __typename?: 'Mutation', removeScopesFromRole: { __typename?: 'RemoveScopesFromRolePayload', role: { __typename?: 'Role', id: string, key: string, name?: string | null, description?: string | null, createdAt: any, updatedAt: any } } };


export const RemoveScopesFromRoleMutationDocument = gql`
    mutation removeScopesFromRoleMutation($roleKey: String!, $resourceURI: String!, $scopes: [String!]!) {
  removeScopesFromRole(
    input: {roleKey: $roleKey, resourceURI: $resourceURI, scopes: $scopes}
  ) {
    role {
      id
      key
      name
      description
      createdAt
      updatedAt
    }
  }
}
    `;
export type RemoveScopesFromRoleMutationMutationFn = Apollo.MutationFunction<RemoveScopesFromRoleMutationMutation, RemoveScopesFromRoleMutationMutationVariables>;

/**
 * __useRemoveScopesFromRoleMutationMutation__
 *
 * To run a mutation, you first call `useRemoveScopesFromRoleMutationMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRemoveScopesFromRoleMutationMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [removeScopesFromRoleMutationMutation, { data, loading, error }] = useRemoveScopesFromRoleMutationMutation({
 *   variables: {
 *      roleKey: // value for 'roleKey'
 *      resourceURI: // value for 'resourceURI'
 *      scopes: // value for 'scopes'
 *   },
 * });
 */
export function useRemoveScopesFromRoleMutationMutation(baseOptions?: Apollo.MutationHookOptions<RemoveScopesFromRoleMutationMutation, RemoveScopesFromRoleMutationMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RemoveScopesFromRoleMutationMutation, RemoveScopesFromRoleMutationMutationVariables>(RemoveScopesFromRoleMutationDocument, options);
      }
export type RemoveScopesFromRoleMutationMutationHookResult = ReturnType<typeof useRemoveScopesFromRoleMutationMutation>;
export type RemoveScopesFromRoleMutationMutationResult = Apollo.MutationResult<RemoveScopesFromRoleMutationMutation>;
export type RemoveScopesFromRoleMutationMutationOptions = Apollo.BaseMutationOptions<RemoveScopesFromRoleMutationMutation, RemoveScopesFromRoleMutationMutationVariables>;