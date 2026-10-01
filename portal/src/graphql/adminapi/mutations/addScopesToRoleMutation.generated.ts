import * as Types from '../globalTypes.generated';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type AddScopesToRoleMutationMutationVariables = Types.Exact<{
  roleKey: Types.Scalars['String']['input'];
  resourceURI: Types.Scalars['String']['input'];
  scopes: Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input'];
}>;


export type AddScopesToRoleMutationMutation = { __typename?: 'Mutation', addScopesToRole: { __typename?: 'AddScopesToRolePayload', role: { __typename?: 'Role', id: string, key: string, name?: string | null, description?: string | null, createdAt: any, updatedAt: any } } };


export const AddScopesToRoleMutationDocument = gql`
    mutation addScopesToRoleMutation($roleKey: String!, $resourceURI: String!, $scopes: [String!]!) {
  addScopesToRole(
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
export type AddScopesToRoleMutationMutationFn = Apollo.MutationFunction<AddScopesToRoleMutationMutation, AddScopesToRoleMutationMutationVariables>;

/**
 * __useAddScopesToRoleMutationMutation__
 *
 * To run a mutation, you first call `useAddScopesToRoleMutationMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAddScopesToRoleMutationMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [addScopesToRoleMutationMutation, { data, loading, error }] = useAddScopesToRoleMutationMutation({
 *   variables: {
 *      roleKey: // value for 'roleKey'
 *      resourceURI: // value for 'resourceURI'
 *      scopes: // value for 'scopes'
 *   },
 * });
 */
export function useAddScopesToRoleMutationMutation(baseOptions?: Apollo.MutationHookOptions<AddScopesToRoleMutationMutation, AddScopesToRoleMutationMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<AddScopesToRoleMutationMutation, AddScopesToRoleMutationMutationVariables>(AddScopesToRoleMutationDocument, options);
      }
export type AddScopesToRoleMutationMutationHookResult = ReturnType<typeof useAddScopesToRoleMutationMutation>;
export type AddScopesToRoleMutationMutationResult = Apollo.MutationResult<AddScopesToRoleMutationMutation>;
export type AddScopesToRoleMutationMutationOptions = Apollo.BaseMutationOptions<AddScopesToRoleMutationMutation, AddScopesToRoleMutationMutationVariables>;