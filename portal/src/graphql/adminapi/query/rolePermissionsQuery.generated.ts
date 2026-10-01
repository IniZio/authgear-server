import * as Types from '../globalTypes.generated';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type RolePermissionsQueryQueryVariables = Types.Exact<{
  roleID: Types.Scalars['ID']['input'];
  resourceID: Types.Scalars['ID']['input'];
  resourceURI: Types.Scalars['String']['input'];
  first?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;


export type RolePermissionsQueryQuery = { __typename?: 'Query', role?: { __typename?: 'AuditLog' } | { __typename?: 'Authenticator' } | { __typename?: 'Authorization' } | { __typename?: 'FraudProtectionDecisionRecord' } | { __typename?: 'Group' } | { __typename?: 'Identity' } | { __typename?: 'InitialAccessToken' } | { __typename?: 'OAuthClient' } | { __typename?: 'Resource' } | { __typename?: 'Role', id: string, scopes?: { __typename?: 'ScopeConnection', totalCount?: number | null, edges?: Array<{ __typename?: 'ScopeEdge', cursor: string, node?: { __typename?: 'Scope', id: string, scope: string } | null } | null> | null, pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, endCursor?: string | null } } | null } | { __typename?: 'Scope' } | { __typename?: 'Session' } | { __typename?: 'User' } | null, resource?: { __typename?: 'AuditLog' } | { __typename?: 'Authenticator' } | { __typename?: 'Authorization' } | { __typename?: 'FraudProtectionDecisionRecord' } | { __typename?: 'Group' } | { __typename?: 'Identity' } | { __typename?: 'InitialAccessToken' } | { __typename?: 'OAuthClient' } | { __typename?: 'Resource', id: string, resourceURI: string, scopes?: { __typename?: 'ScopeConnection', totalCount?: number | null, edges?: Array<{ __typename?: 'ScopeEdge', cursor: string, node?: { __typename?: 'Scope', id: string, scope: string, description?: string | null } | null } | null> | null, pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, endCursor?: string | null } } | null } | { __typename?: 'Role' } | { __typename?: 'Scope' } | { __typename?: 'Session' } | { __typename?: 'User' } | null };


export const RolePermissionsQueryDocument = gql`
    query rolePermissionsQuery($roleID: ID!, $resourceID: ID!, $resourceURI: String!, $first: Int) {
  role: node(id: $roleID) {
    ... on Role {
      id
      scopes(resourceURI: $resourceURI, first: $first) {
        edges {
          node {
            id
            scope
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
        totalCount
      }
    }
  }
  resource: node(id: $resourceID) {
    ... on Resource {
      id
      resourceURI
      scopes(first: $first) {
        edges {
          node {
            id
            scope
            description
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
        totalCount
      }
    }
  }
}
    `;

/**
 * __useRolePermissionsQueryQuery__
 *
 * To run a query within a React component, call `useRolePermissionsQueryQuery` and pass it any options that fit your needs.
 * When your component renders, `useRolePermissionsQueryQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useRolePermissionsQueryQuery({
 *   variables: {
 *      roleID: // value for 'roleID'
 *      resourceID: // value for 'resourceID'
 *      resourceURI: // value for 'resourceURI'
 *      first: // value for 'first'
 *   },
 * });
 */
export function useRolePermissionsQueryQuery(baseOptions: Apollo.QueryHookOptions<RolePermissionsQueryQuery, RolePermissionsQueryQueryVariables> & ({ variables: RolePermissionsQueryQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<RolePermissionsQueryQuery, RolePermissionsQueryQueryVariables>(RolePermissionsQueryDocument, options);
      }
export function useRolePermissionsQueryLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<RolePermissionsQueryQuery, RolePermissionsQueryQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<RolePermissionsQueryQuery, RolePermissionsQueryQueryVariables>(RolePermissionsQueryDocument, options);
        }
// @ts-ignore
export function useRolePermissionsQuerySuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<RolePermissionsQueryQuery, RolePermissionsQueryQueryVariables>): Apollo.UseSuspenseQueryResult<RolePermissionsQueryQuery, RolePermissionsQueryQueryVariables>;
export function useRolePermissionsQuerySuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<RolePermissionsQueryQuery, RolePermissionsQueryQueryVariables>): Apollo.UseSuspenseQueryResult<RolePermissionsQueryQuery | undefined, RolePermissionsQueryQueryVariables>;
export function useRolePermissionsQuerySuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<RolePermissionsQueryQuery, RolePermissionsQueryQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<RolePermissionsQueryQuery, RolePermissionsQueryQueryVariables>(RolePermissionsQueryDocument, options);
        }
export type RolePermissionsQueryQueryHookResult = ReturnType<typeof useRolePermissionsQueryQuery>;
export type RolePermissionsQueryLazyQueryHookResult = ReturnType<typeof useRolePermissionsQueryLazyQuery>;
export type RolePermissionsQuerySuspenseQueryHookResult = ReturnType<typeof useRolePermissionsQuerySuspenseQuery>;
export type RolePermissionsQueryQueryResult = Apollo.QueryResult<RolePermissionsQueryQuery, RolePermissionsQueryQueryVariables>;