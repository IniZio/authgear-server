import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { RolePermissionsTab } from "./RolePermissionsTab";
import { ErrorMessageBarContextProvider } from "../../../ErrorMessageBar";
import { ToastProvider } from "../../v2/Toast/Toast";
import { SystemConfigContext } from "../../../context/SystemConfigContext";
import {
  defaultSystemConfig,
  instantiateSystemConfig,
} from "../../../system-config";
import { ResourcesQueryDocument } from "../../../graphql/adminapi/query/resourcesQuery.generated";
import { RolePermissionsQueryDocument } from "../../../graphql/adminapi/query/rolePermissionsQuery.generated";
import { RoleQueryNodeFragment } from "../../../graphql/adminapi/query/roleQuery.generated";

const systemConfig = instantiateSystemConfig(defaultSystemConfig);

const role: RoleQueryNodeFragment = {
  __typename: "Role",
  id: "Um9sZTox",
  key: "store_manager",
  name: "Store Manager",
  description: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const accessPolicy = {
  __typename: "AccessPolicy",
  allowStaticFirstPartyClientAccess: true,
  allowStaticThirdPartyClientAccess: false,
  allowDynamicFirstPartyClientAccess: false,
  allowDynamicThirdPartyClientAccess: false,
};

function resourceNode(id: string, name: string | null, resourceURI: string) {
  return {
    __typename: "Resource",
    id,
    name,
    clientIDs: [],
    resourceURI,
    accessPolicy,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function resourcesMock(
  nodes: ReturnType<typeof resourceNode>[]
): MockedResponse {
  return {
    request: { query: ResourcesQueryDocument },
    variableMatcher: () => true,
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: {
      data: {
        resources: {
          __typename: "ResourceConnection",
          edges: nodes.map((node, i) => ({
            __typename: "ResourceEdge",
            node,
            cursor: `offset:${i}`,
          })),
          pageInfo: {
            __typename: "PageInfo",
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: null,
            endCursor: null,
          },
          totalCount: nodes.length,
        },
      },
    },
  };
}

const scopeNodes = [
  { scope: "orders:read", description: "View orders and their line items" },
  { scope: "orders:write", description: "Create and update orders" },
  { scope: "orders:refund", description: "Issue refunds on paid orders" },
].map((s, i) => ({ __typename: "Scope", id: `U2NvcGU6${i}`, ...s }));

function connection<T>(nodes: T[]) {
  return {
    __typename: "ScopeConnection",
    edges: nodes.map((node, i) => ({
      __typename: "ScopeEdge",
      node,
      cursor: `offset:${i}`,
    })),
    pageInfo: { __typename: "PageInfo", hasNextPage: false, endCursor: null },
    totalCount: nodes.length,
  };
}

const permissionsMock: MockedResponse = {
  request: { query: RolePermissionsQueryDocument },
  variableMatcher: () => true,
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: {
    data: {
      role: {
        __typename: "Role",
        id: role.id,
        scopes: connection(
          scopeNodes
            .slice(0, 1)
            .map(({ __typename, id, scope }) => ({ __typename, id, scope }))
        ),
      },
      resource: {
        __typename: "Resource",
        id: "UmVzb3VyY2U6MQ",
        resourceURI: "https://api.example.com/orders",
        scopes: connection(scopeNodes),
      },
    },
  },
};

const meta = {
  title: "components/v1/roles-and-groups/RolePermissionsTab",
  component: RolePermissionsTab,
  tags: ["autodocs"],
  args: { role },
  parameters: { layout: "padded" },
} satisfies Meta<typeof RolePermissionsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

function withProviders(mocks: MockedResponse[]) {
  return (Story: React.ComponentType) => {
    const router = createMemoryRouter(
      [
        {
          path: "/project/:appID",
          element: (
            <SystemConfigContext.Provider value={systemConfig}>
              <ToastProvider>
                <ErrorMessageBarContextProvider>
                  <Story />
                </ErrorMessageBarContextProvider>
              </ToastProvider>
            </SystemConfigContext.Provider>
          ),
        },
      ],
      { initialEntries: ["/project/my-app"] }
    );
    return (
      <MockedProvider mocks={mocks}>
        <RouterProvider router={router} />
      </MockedProvider>
    );
  };
}

export const Default: Story = {
  decorators: [
    withProviders([
      resourcesMock([
        resourceNode(
          "UmVzb3VyY2U6MQ",
          "Orders API",
          "https://api.example.com/orders"
        ),
        resourceNode("UmVzb3VyY2U6Mg", null, "https://api.example.com/reports"),
      ]),
      permissionsMock,
    ]),
  ],
};

export const NoResources: Story = {
  decorators: [withProviders([resourcesMock([])])],
};
