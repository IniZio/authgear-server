import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { RoleResourcePermissionsForm } from "./RoleResourcePermissionsForm";
import { ErrorMessageBarContextProvider } from "../../../ErrorMessageBar";
import { SystemConfigContext } from "../../../context/SystemConfigContext";
import {
  defaultSystemConfig,
  instantiateSystemConfig,
} from "../../../system-config";

const systemConfig = instantiateSystemConfig(defaultSystemConfig);

const scopes = [
  { scope: "orders:read", description: "View orders and their line items" },
  { scope: "orders:write", description: "Create and update orders" },
  { scope: "orders:refund", description: "Issue refunds on paid orders" },
  { scope: "reports:read", description: null },
];

const meta = {
  title: "components/v1/roles-and-groups/RoleResourcePermissionsForm",
  component: RoleResourcePermissionsForm,
  tags: ["autodocs"],
  decorators: [
    (Story) => {
      // A data router: the form's unsaved-changes blocker needs useBlocker.
      const router = createMemoryRouter(
        [
          {
            path: "/project/:appID",
            element: (
              <SystemConfigContext.Provider value={systemConfig}>
                <ErrorMessageBarContextProvider>
                  <div style={{ width: 640, maxWidth: "calc(100vw - 2rem)" }}>
                    <Story />
                  </div>
                </ErrorMessageBarContextProvider>
              </SystemConfigContext.Provider>
            ),
          },
        ],
        { initialEntries: ["/project/my-app"] }
      );
      return <RouterProvider router={router} />;
    },
  ],
  args: {
    resourceID: "UmVzb3VyY2U6MQ",
    scopes,
    grantedScopes: [],
    isTruncated: false,
    onSave: async () => Promise.resolve(),
  },
} satisfies Meta<typeof RoleResourcePermissionsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoScopes: Story = {
  args: {
    scopes: [],
  },
};

export const SomeGranted: Story = {
  args: {
    grantedScopes: ["orders:read", "reports:read"],
  },
};

export const AllGranted: Story = {
  args: {
    grantedScopes: scopes.map((s) => s.scope),
  },
};

export const Truncated: Story = {
  args: {
    grantedScopes: ["orders:read"],
    isTruncated: true,
  },
};
