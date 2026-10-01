import React, { useCallback, useContext, useMemo, useState } from "react";
import cn from "classnames";
import { Text } from "@radix-ui/themes";
import { ChevronRightIcon, Cross2Icon } from "@radix-ui/react-icons";
import { useParams } from "react-router-dom";
import { FormattedMessage, Context as MessageContext } from "../../../intl";
import { RoleQueryNodeFragment } from "../../../graphql/adminapi/query/roleQuery.generated";
import { useResourcesQueryQuery } from "../../../graphql/adminapi/query/resourcesQuery.generated";
import { useRolePermissionsQueryQuery } from "../../../graphql/adminapi/query/rolePermissionsQuery.generated";
import { useAddScopesToRoleMutationMutation } from "../../../graphql/adminapi/mutations/addScopesToRoleMutation.generated";
import { useRemoveScopesFromRoleMutationMutation } from "../../../graphql/adminapi/mutations/removeScopesFromRoleMutation.generated";
import { TextField, TextFieldIcon } from "../../v2/TextField/TextField";
import { useCalloutToast } from "../../v2/Callout/Callout";
import { useDebounced } from "../../../hook/useDebounced";
import { encodeOffsetToCursor } from "../../../util/pagination";
import PaginationWidget from "../../../PaginationWidget";
import ShowError from "../../../ShowError";
import ShowLoading from "../../../ShowLoading";
import Link from "../../../Link";
import {
  RoleResourcePermissionsChanges,
  RoleResourcePermissionsForm,
} from "./RoleResourcePermissionsForm";
import styles from "./RolePermissionsTab.module.css";

const PAGE_SIZE = 10;
// The Admin API caps a page at 100.
const SCOPES_PAGE_SIZE = 100;

interface ResourceRowData {
  id: string;
  name?: string | null;
  resourceURI: string;
}

function RoleResourcePermissionsPanel({
  role,
  resource,
}: {
  role: RoleQueryNodeFragment;
  resource: ResourceRowData;
}) {
  const { showToast } = useCalloutToast();
  const { data, loading, error, refetch } = useRolePermissionsQueryQuery({
    variables: {
      roleID: role.id,
      resourceID: resource.id,
      resourceURI: resource.resourceURI,
      first: SCOPES_PAGE_SIZE,
    },
    fetchPolicy: "network-only",
  });
  const [addScopesToRole] = useAddScopesToRoleMutationMutation();
  const [removeScopesFromRole] = useRemoveScopesFromRoleMutationMutation();

  const { scopes, scopesTotalCount } = useMemo(() => {
    const node = data?.resource;
    if (node?.__typename !== "Resource") {
      return { scopes: [], scopesTotalCount: 0 };
    }
    return {
      scopes:
        node.scopes?.edges?.flatMap((edge) =>
          edge?.node != null ? [edge.node] : []
        ) ?? [],
      scopesTotalCount: node.scopes?.totalCount ?? 0,
    };
  }, [data?.resource]);

  const grantedScopes = useMemo(() => {
    const node = data?.role;
    if (node?.__typename !== "Role") {
      return [];
    }
    return (
      node.scopes?.edges?.flatMap((edge) =>
        edge?.node != null ? [edge.node.scope] : []
      ) ?? []
    );
  }, [data?.role]);

  const onSave = useCallback(
    async ({ added, removed }: RoleResourcePermissionsChanges) => {
      const variables = {
        roleKey: role.key,
        resourceURI: resource.resourceURI,
      };
      if (added.length > 0) {
        await addScopesToRole({ variables: { ...variables, scopes: added } });
      }
      if (removed.length > 0) {
        await removeScopesFromRole({
          variables: { ...variables, scopes: removed },
        });
      }
      await refetch();
      showToast({
        type: "success",
        text: (
          <FormattedMessage
            id="RolePermissionsTab.toast.saved"
            values={{ resource: resource.name ?? resource.resourceURI }}
          />
        ),
      });
    },
    [
      addScopesToRole,
      refetch,
      removeScopesFromRole,
      resource.name,
      resource.resourceURI,
      role.key,
      showToast,
    ]
  );

  if (error != null) {
    return (
      <ShowError
        error={error}
        onRetry={() => {
          refetch().finally(() => {});
        }}
      />
    );
  }

  if (loading && data == null) {
    return <ShowLoading />;
  }

  return (
    <RoleResourcePermissionsForm
      resourceID={resource.id}
      scopes={scopes}
      grantedScopes={grantedScopes}
      isTruncated={scopesTotalCount > scopes.length}
      onSave={onSave}
    />
  );
}

function ResourceRow({
  role,
  resource,
  isExpanded,
  onToggle,
}: {
  role: RoleQueryNodeFragment;
  resource: ResourceRowData;
  isExpanded: boolean;
  onToggle: (resourceID: string) => void;
}) {
  const panelID = `role-permissions-${resource.id}`;
  const onClick = useCallback(() => {
    onToggle(resource.id);
  }, [onToggle, resource.id]);

  return (
    <li className={cn(styles.resource, isExpanded && styles.resourceExpanded)}>
      <button
        type="button"
        className={styles.resourceHeader}
        aria-expanded={isExpanded}
        aria-controls={panelID}
        onClick={onClick}
      >
        <ChevronRightIcon
          className={cn(styles.chevron, isExpanded && styles.chevronExpanded)}
        />
        <span className={styles.resourceText}>
          <Text as="span" size="2" weight="medium" className={styles.name}>
            {resource.name ?? resource.resourceURI}
          </Text>
          {resource.name != null ? (
            <Text as="span" size="1" color="gray" className={styles.uri}>
              {resource.resourceURI}
            </Text>
          ) : null}
        </span>
      </button>
      {isExpanded ? (
        <div id={panelID} className={styles.resourcePanel}>
          <RoleResourcePermissionsPanel role={role} resource={resource} />
        </div>
      ) : null}
    </li>
  );
}

export const RolePermissionsTab: React.VFC<{ role: RoleQueryNodeFragment }> =
  function RolePermissionsTab({ role }) {
    const { appID } = useParams() as { appID: string };
    const { renderToString } = useContext(MessageContext);
    const [offset, setOffset] = useState(0);
    const [searchKeyword, setSearchKeyword] = useState("");
    const [debouncedSearchKeyword] = useDebounced(searchKeyword, 300);
    // One Resource open at a time keeps a single form, and its unsaved
    // changes, on screen.
    const [expandedResourceID, setExpandedResourceID] = useState<string | null>(
      null
    );

    const { data, loading, error, refetch } = useResourcesQueryQuery({
      variables: {
        first: PAGE_SIZE,
        after: encodeOffsetToCursor(offset),
        searchKeyword:
          debouncedSearchKeyword === "" ? undefined : debouncedSearchKeyword,
      },
      fetchPolicy: "network-only",
    });

    const onChangeSearchKeyword = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setOffset(0);
        setSearchKeyword(e.target.value);
      },
      []
    );
    const onClearSearchKeyword = useCallback(() => {
      setOffset(0);
      setSearchKeyword("");
    }, []);
    const onToggle = useCallback((resourceID: string) => {
      setExpandedResourceID((prev) =>
        prev === resourceID ? null : resourceID
      );
    }, []);

    const resources = useMemo<ResourceRowData[]>(
      () =>
        data?.resources?.edges?.flatMap((edge) =>
          edge?.node != null ? [edge.node] : []
        ) ?? [],
      [data?.resources?.edges]
    );
    const totalCount = data?.resources?.totalCount ?? 0;
    const hasNoResources =
      !loading && debouncedSearchKeyword === "" && totalCount === 0;

    const description = (
      <Text as="p" size="2" color="gray" className={styles.description}>
        <FormattedMessage id="RolePermissionsTab.description" />
      </Text>
    );

    if (error != null) {
      return (
        <ShowError
          error={error}
          onRetry={() => {
            refetch().finally(() => {});
          }}
        />
      );
    }

    if (hasNoResources) {
      return (
        <section className={styles.root}>
          {description}
          <div className={styles.emptyCard}>
            <Text as="p" size="3" weight="medium">
              <FormattedMessage id="RolePermissionsTab.empty.title" />
            </Text>
            <Text as="p" size="2" color="gray">
              <FormattedMessage
                id="RolePermissionsTab.empty.description"
                values={{
                  // eslint-disable-next-line react/no-unstable-nested-components
                  resourcesLink: (chunks: React.ReactNode) => (
                    <Link to={`/project/${appID}/api-resources`}>{chunks}</Link>
                  ),
                }}
              />
            </Text>
          </div>
        </section>
      );
    }

    return (
      <section className={styles.root}>
        {description}
        <div className={styles.searchField}>
          <TextField
            size="2"
            type="search"
            value={searchKeyword}
            placeholder={renderToString("RolePermissionsTab.search")}
            iconStart={TextFieldIcon.MagnifyingGlass}
            onChange={onChangeSearchKeyword}
            suffixPlain={true}
            suffix={
              searchKeyword !== "" ? (
                <button
                  type="button"
                  className={styles.searchClearButton}
                  aria-label={renderToString("APIResourcesScreen.clear-search")}
                  onClick={onClearSearchKeyword}
                >
                  <Cross2Icon width="0.875rem" height="0.875rem" />
                </button>
              ) : undefined
            }
          />
        </div>
        {loading && data == null ? (
          <ShowLoading />
        ) : resources.length === 0 ? (
          <Text as="p" size="2" color="gray" className={styles.noResults}>
            <FormattedMessage id="RolePermissionsTab.no-results" />
          </Text>
        ) : (
          <ul className={styles.resourceList}>
            {resources.map((resource) => (
              <ResourceRow
                key={resource.id}
                role={role}
                resource={resource}
                isExpanded={expandedResourceID === resource.id}
                onToggle={onToggle}
              />
            ))}
          </ul>
        )}
        {totalCount > PAGE_SIZE ? (
          <PaginationWidget
            className={styles.pagination}
            offset={offset}
            pageSize={PAGE_SIZE}
            totalCount={totalCount}
            onChangeOffset={setOffset}
          />
        ) : null}
      </section>
    );
  };
