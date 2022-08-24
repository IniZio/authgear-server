import React from "react";
import ReactDOM from "react-dom";
import { ScrollablePane } from "@fluentui/react";

import { ModifiedIndicator, ModifiedIndicatorProps } from "./ModifiedIndicator";

import styles from "./ModifiedIndicator.module.css";

interface ModifiedIndicatorWrapperProps {
  className?: string;
}

const MODIFIED_INDICATOR_CONTAINER_ID = "__modified-indicator-container";

export const ModifiedIndicatorContainer: React.VFC =
  function ModifiedIndicatorContainer() {
    return <div id={MODIFIED_INDICATOR_CONTAINER_ID} />;
  };

export const ModifiedIndicatorWrapper: React.VFC<ModifiedIndicatorWrapperProps> =
  function ModifiedIndicatorWrapper(props) {
    const { className } = props;

    return (
      <div className={styles.wrapper}>
        <ModifiedIndicatorContainer />
        <div className={styles.scrollWrapper}>
          <ScrollablePane>
            <div className={className}>{props.children}</div>
          </ScrollablePane>
        </div>
      </div>
    );
  };

export const ModifiedIndicatorPortal: React.VFC<ModifiedIndicatorProps> =
  function ModifiedIndicatorPortal(props: ModifiedIndicatorProps) {
    const container = document.getElementById(MODIFIED_INDICATOR_CONTAINER_ID);

    // NOTE: when portal is rendered for first time, container would be null
    return container != null
      ? ReactDOM.createPortal(<ModifiedIndicator {...props} />, container)
      : null;
  };
