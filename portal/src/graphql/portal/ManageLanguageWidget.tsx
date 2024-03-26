import React, {
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  CSSProperties,
} from "react";
import cn from "classnames";
import {
  Checkbox,
  Label,
  IconButton,
  SearchBox,
  Dialog,
  DialogFooter,
  Dropdown,
  IDialogProps,
  IDropdownOption,
  IListProps,
  List,
  Text,
  IRenderFunction,
  useTheme,
} from "@fluentui/react";
import { Context, FormattedMessage } from "@oursky/react-messageformat";

import { useSystemConfig } from "../../context/SystemConfigContext";
import { LanguageTag } from "../../util/resource";
import { useExactKeywordSearch } from "../../util/search";

import styles from "./ManageLanguageWidget.module.css";
import PrimaryButton from "../../PrimaryButton";
import DefaultButton from "../../DefaultButton";
import LinkButton from "../../LinkButton";
import ReplaceLanguagesConfirmationDialog from "./ReplaceLanguagesConfirmationDialog";

interface ManageLanguageWidgetProps {
  className?: string;

  // The supported languages.
  existingLanguages: LanguageTag[];
  supportedLanguages: LanguageTag[];

  // The selected language.
  selectedLanguage: LanguageTag;
  onChangeSelectedLanguage: (newSelectedLanguage: LanguageTag) => void;

  // The fallback language.
  fallbackLanguage: LanguageTag;

  onChangeLanguages: (
    supportedLanguages: LanguageTag[],
    fallbackLanguage: LanguageTag
  ) => void;
  onChangeAndSaveLanguages: (
    supportedLanguages: LanguageTag[],
    fallbackLanguage: LanguageTag
  ) => void;
}

interface ManageLanguageWidgetDialogProps {
  presented: boolean;
  onDismiss: () => void;
  fallbackLanguage: LanguageTag;
  existingLanguages: LanguageTag[];
  supportedLanguages: LanguageTag[];
  onChangeLanguages: (
    supportedLanguages: LanguageTag[],
    fallbackLanguage: LanguageTag
  ) => void;
  onChangeAndSaveLanguages: (
    supportedLanguages: LanguageTag[],
    fallbackLanguage: LanguageTag
  ) => void;
}

interface CellProps {
  language: LanguageTag;
  fallbackLanguage: LanguageTag;
  checked: boolean;
  onChange: (locale: LanguageTag) => void;
  onClickSetAsFallback: (locale: LanguageTag) => void;
}

const DIALOG_STYLES = {
  main: {
    maxWidth: "533px !important",
  },
};

function getLanguageLocaleKey(locale: LanguageTag) {
  return `Locales.${locale}`;
}

const Cell: React.VFC<CellProps> = function Cell(props: CellProps) {
  const {
    language,
    checked,
    fallbackLanguage,
    onChange: onChangeProp,
    onClickSetAsFallback: onClickSetAsFallbackProp,
  } = props;
  const disabled = language === fallbackLanguage;

  const { renderToString } = useContext(Context);

  const onChange = useCallback(() => {
    onChangeProp(language);
  }, [language, onChangeProp]);

  const onClickSetAsFallback = useCallback(() => {
    onClickSetAsFallbackProp(language);
  }, [language, onClickSetAsFallbackProp]);

  return (
    <div className={styles.cellRoot}>
      <Checkbox
        className={styles.cellCheckbox}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <Text className={styles.cellText}>
        <FormattedMessage
          id="ManageLanguageWidget.language-label"
          values={{
            LANG: renderToString(getLanguageLocaleKey(language)),
            IS_FALLBACK: String(fallbackLanguage === language),
          }}
        />
      </Text>
      {checked && !disabled ? (
        <LinkButton onClick={onClickSetAsFallback}>
          <FormattedMessage id="ManageLanguageWidget.set-as-default" />
        </LinkButton>
      ) : null}
    </div>
  );
};

const ManageLanguageWidgetDialog: React.VFC<ManageLanguageWidgetDialogProps> =
  function ManageLanguageWidgetDialog(props: ManageLanguageWidgetDialogProps) {
    const {
      presented,
      onDismiss,
      fallbackLanguage,
      existingLanguages,
      supportedLanguages,
      onChangeLanguages,
      onChangeAndSaveLanguages,
    } = props;

    const { renderToString } = useContext(Context);

    const { availableLanguages } = useSystemConfig();

    const originalItems = useMemo(() => {
      return availableLanguages.map((a) => {
        return {
          language: a,
          text: renderToString(getLanguageLocaleKey(a)),
        };
      });
    }, [availableLanguages, renderToString]);

    const [newSupportedLanguages, setNewSupportedLanguages] =
      useState<LanguageTag[]>(supportedLanguages);

    const [newFallbackLanguage, setNewFallbackLanguage] =
      useState<LanguageTag>(fallbackLanguage);

    const [searchString, setSearchString] = useState<string>("");
    const { search } = useExactKeywordSearch(originalItems, ["text"]);
    const filteredItems = useMemo(() => {
      return search(searchString);
    }, [search, searchString]);

    const [
      isClearLocalizationConfirmationDialogVisible,
      setIsClearLocalizationConfirmationDialogVisible,
    ] = useState(false);

    const dismissClearLocalizationConfirmationDialog = useCallback(() => {
      setIsClearLocalizationConfirmationDialogVisible(false);
    }, []);

    const allExistingLanguageAreRemoved = useMemo(() => {
      return existingLanguages.every(
        (locale) => !newSupportedLanguages.includes(locale)
      );
    }, [existingLanguages, newSupportedLanguages]);

    const onSearch = useCallback((_e, value?: string) => {
      if (value == null) {
        return;
      }
      setSearchString(value);
    }, []);

    const onClear = useCallback((_e) => {
      setSearchString("");
    }, []);

    useEffect(() => {
      if (presented) {
        setNewSupportedLanguages(supportedLanguages);
        setNewFallbackLanguage(fallbackLanguage);
        setSearchString("");
      }
    }, [presented, supportedLanguages, fallbackLanguage]);

    const onToggleLanguage = useCallback((locale: LanguageTag) => {
      setNewSupportedLanguages((prev) => {
        const idx = prev.findIndex((item) => item === locale);
        if (idx >= 0) {
          return prev.filter((item) => item !== locale);
        }
        return [...prev, locale];
      });
    }, []);

    const onClickSetAsFallback = useCallback((locale: LanguageTag) => {
      setNewFallbackLanguage(locale);
    }, []);

    const listItems = useMemo(() => {
      const items: CellProps[] = [];
      for (const listItem of filteredItems) {
        const { language } = listItem;
        items.push({
          language,
          checked: newSupportedLanguages.includes(language),
          fallbackLanguage: newFallbackLanguage,
          onChange: onToggleLanguage,
          onClickSetAsFallback,
        });
      }
      return items;
    }, [
      onToggleLanguage,
      onClickSetAsFallback,
      newSupportedLanguages,
      newFallbackLanguage,
      filteredItems,
    ]);

    const renderLocaleListItemCell = useCallback<
      Required<IListProps<CellProps>>["onRenderCell"]
    >((item?: CellProps) => {
      if (item == null) {
        return null;
      }
      return <Cell {...item} />;
    }, []);

    const onCancel = useCallback(() => {
      onDismiss();
    }, [onDismiss]);

    const onApplyClick = useCallback(() => {
      if (allExistingLanguageAreRemoved) {
        setIsClearLocalizationConfirmationDialogVisible(true);
        return;
      }

      onChangeLanguages(newSupportedLanguages, newFallbackLanguage);
      onDismiss();
    }, [
      allExistingLanguageAreRemoved,
      onChangeLanguages,
      newSupportedLanguages,
      newFallbackLanguage,
      onDismiss,
    ]);

    const onConfirmReplaceLanguages = useCallback(() => {
      onChangeAndSaveLanguages(newSupportedLanguages, newFallbackLanguage);
      dismissClearLocalizationConfirmationDialog();
      onDismiss();
    }, [
      onChangeAndSaveLanguages,
      newSupportedLanguages,
      newFallbackLanguage,
      dismissClearLocalizationConfirmationDialog,
      onDismiss,
    ]);

    const modalProps = useMemo<IDialogProps["modalProps"]>(() => {
      return {
        isBlocking: true,
        topOffsetFixed: true,
        onDismissed: () => {
          setNewSupportedLanguages(supportedLanguages);
          setNewFallbackLanguage(fallbackLanguage);
        },
      };
    }, [supportedLanguages, fallbackLanguage]);

    return (
      <>
        <Dialog
          hidden={!presented}
          onDismiss={onCancel}
          title={
            <FormattedMessage id="ManageLanguageWidget.add-or-remove-languages" />
          }
          modalProps={modalProps}
          styles={DIALOG_STYLES}
        >
          <Text className={styles.dialogDesc}>
            <FormattedMessage id="ManageLanguageWidget.default-language-description" />
          </Text>
          <SearchBox
            className={styles.searchBox}
            placeholder={renderToString("search")}
            value={searchString}
            onChange={onSearch}
            onClear={onClear}
          />
          <Text variant="small" className={styles.dialogColumnHeader}>
            <FormattedMessage id="ManageLanguageWidget.languages" />
          </Text>
          <div className={styles.dialogListWrapper}>
            <List items={listItems} onRenderCell={renderLocaleListItemCell} />
          </div>
          <DialogFooter>
            <PrimaryButton
              onClick={onApplyClick}
              text={<FormattedMessage id="apply" />}
            />
            <DefaultButton
              onClick={onCancel}
              text={<FormattedMessage id="cancel" />}
            />
          </DialogFooter>
        </Dialog>
        <ReplaceLanguagesConfirmationDialog
          visible={isClearLocalizationConfirmationDialogVisible}
          onDismiss={dismissClearLocalizationConfirmationDialog}
          onConfirm={onConfirmReplaceLanguages}
        />
      </>
    );
  };

const ManageLanguageWidget: React.VFC<ManageLanguageWidgetProps> =
  function ManageLanguageWidget(props: ManageLanguageWidgetProps) {
    const {
      className,
      supportedLanguages,
      existingLanguages,
      selectedLanguage,
      onChangeSelectedLanguage,
      fallbackLanguage,
      onChangeLanguages,
      onChangeAndSaveLanguages,
    } = props;

    const { renderToString } = useContext(Context);
    const theme = useTheme();

    const [isDialogPresented, setIsDialogPresented] = useState(false);

    const displayTemplateLocale = useCallback(
      (locale: LanguageTag) => {
        return renderToString(getLanguageLocaleKey(locale));
      },
      [renderToString]
    );

    const presentDialog = useCallback(() => {
      setIsDialogPresented(true);
    }, []);

    const dismissDialog = useCallback(() => {
      setIsDialogPresented(false);
    }, []);

    const templateLocaleOptions: IDropdownOption[] = useMemo(() => {
      const options = [];

      const combinedLocales = new Set([
        ...existingLanguages,
        ...supportedLanguages,
      ]);

      for (const locale of combinedLocales) {
        const isNew = !existingLanguages.includes(locale);
        const isRemoved = !supportedLanguages.includes(locale);

        let localeDisplay = displayTemplateLocale(locale);
        if (isRemoved) {
          localeDisplay = renderToString(
            "ManageLanguageWidget.option-removed",
            {
              LANG: localeDisplay,
            }
          );
        }

        options.push({
          key: locale,
          text: localeDisplay,
          data: {
            isFallbackLanguage: fallbackLanguage === locale,
          },
          disabled: isRemoved || isNew,
        });
      }

      return options;
    }, [
      existingLanguages,
      supportedLanguages,
      displayTemplateLocale,
      fallbackLanguage,
      renderToString,
    ]);

    const hasNewLanguage = useMemo(() => {
      return supportedLanguages.some(
        (locale) => !existingLanguages.includes(locale)
      );
    }, [existingLanguages, supportedLanguages]);

    const onChangeTemplateLocale = useCallback(
      (_e: unknown, option?: IDropdownOption) => {
        if (option != null) {
          onChangeSelectedLanguage(option.key.toString());
        }
      },
      [onChangeSelectedLanguage]
    );

    const onRenderOption: IRenderFunction<IDropdownOption> = useCallback(
      (option?: IDropdownOption) => {
        const style: CSSProperties | undefined = option?.disabled
          ? {
              fontStyle: "italic",
              color: theme.semanticColors.disabledText,
            }
          : undefined;

        return (
          <Text style={style}>
            <FormattedMessage
              id="ManageLanguageWidget.language-label"
              values={{
                LANG: option?.text ?? "",
                IS_FALLBACK: String(option?.data.isFallbackLanguage ?? false),
              }}
            />
          </Text>
        );
      },
      [theme.semanticColors.disabledText]
    );

    const onRenderTitle: IRenderFunction<IDropdownOption[]> = useCallback(
      (options?: IDropdownOption[]) => {
        const option = options?.[0];
        return (
          <Text>
            <FormattedMessage
              id="ManageLanguageWidget.language-label"
              values={{
                LANG: option?.text ?? "",
                IS_FALLBACK: String(option?.data.isFallbackLanguage ?? false),
              }}
            />
          </Text>
        );
      },
      []
    );

    return (
      <>
        <ManageLanguageWidgetDialog
          presented={isDialogPresented}
          onDismiss={dismissDialog}
          existingLanguages={existingLanguages}
          supportedLanguages={supportedLanguages}
          fallbackLanguage={fallbackLanguage}
          onChangeLanguages={onChangeLanguages}
          onChangeAndSaveLanguages={onChangeAndSaveLanguages}
        />
        <div className={cn(className, styles.root)}>
          <div className={styles.container}>
            <Label className={styles.titleLabel}>
              <FormattedMessage id="ManageLanguageWidget.title" />
            </Label>
            <div className={styles.control}>
              <Dropdown
                id="language-widget"
                className={styles.dropdown}
                options={templateLocaleOptions}
                onChange={onChangeTemplateLocale}
                selectedKey={selectedLanguage}
                onRenderTitle={onRenderTitle}
                onRenderOption={onRenderOption}
              />
              <IconButton
                iconProps={{
                  iconName: "Settings",
                }}
                onClick={presentDialog}
              />
            </div>
          </div>
          {hasNewLanguage ? (
            <Text className={styles.hint} variant="small">
              <FormattedMessage id="ManageLanguageWidget.save-to-select-new-language" />
            </Text>
          ) : null}
        </div>
      </>
    );
  };

export default ManageLanguageWidget;
