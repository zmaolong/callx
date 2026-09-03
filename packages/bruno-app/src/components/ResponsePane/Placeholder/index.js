import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconSend } from '@tabler/icons';
import { useSelector } from 'react-redux';
import StyledWrapper from './StyledWrapper';
import { isMacOS } from 'utils/common/platform';
import { getKeyBindingDisplayTextByOS } from 'providers/Hotkeys/keyMappings';

const KEY_BINDING_ACTIONS = [
  { labelKey: 'REQUEST.SEND_REQUEST', action: 'sendRequest' },
  { labelKey: 'REQUEST.NEW_REQUEST', action: 'newRequest' },
  { labelKey: 'REQUEST.EDIT_ENVIRONMENTS', action: 'editEnvironment' }
];

const Placeholder = () => {
  const { t } = useTranslation();
  const isMac = isMacOS();
  const os = isMac ? 'mac' : 'windows';
  const preferences = useSelector((state) => state.app.preferences);
  const isVerticalLayout
    = preferences?.layout?.responsePaneOrientation === 'vertical';
  const keyBindingActions = useMemo(() => {
    return KEY_BINDING_ACTIONS.map(({ labelKey, action }) => ({
      label: t(labelKey),
      action,
      shortcut: getKeyBindingDisplayTextByOS(
        action,
        preferences?.keyBindings,
        os
      )
    }));
  }, [preferences?.keyBindings, os, t]);

  const iconSize = isVerticalLayout ? 80 : 150;

  return (
    <StyledWrapper
      className={`${isVerticalLayout ? 'vertical-layout' : ''}`}
      data-testid="response-pane-shortcut-placeholder"
    >
      <div
        className="send-icon flex justify-center"
        style={{ fontSize: isVerticalLayout ? 100 : 200 }}
      >
        <IconSend size={iconSize} strokeWidth={1} />
      </div>
      <div className={`flex ${isVerticalLayout ? 'mt-2' : 'mt-4'}`}>
        <div className="flex flex-1 flex-col items-end px-1">
          {keyBindingActions.map(({ label, action }) => (
            <div
              key={label}
              className="px-1 py-2"
              data-testid={`response-placeholder-shortcut-label-${action}`}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="flex flex-1 flex-col px-1">
          {keyBindingActions.map(({ label, action, shortcut }) => (
            <div
              key={label}
              className="px-1 py-2"
              data-testid={`response-placeholder-shortcut-value-${action}`}
            >
              {shortcut}
            </div>
          ))}
        </div>
      </div>
    </StyledWrapper>
  );
};

export default Placeholder;
