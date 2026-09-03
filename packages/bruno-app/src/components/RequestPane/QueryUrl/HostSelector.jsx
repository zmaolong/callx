import React from 'react';
import { useTranslation } from 'react-i18next';
import ToggleSelector from 'components/RequestPane/Settings/ToggleSelector';

const HostSelector = ({ host, enabled, onChange }) => {
  const { t } = useTranslation();
  const available = Boolean(host);

  return (
    <div className="flex items-center px-2 min-w-fit" data-testid="request-host-selector">
      <ToggleSelector
        checked={enabled && available}
        onChange={onChange}
        disabled={!available}
        label={t('REQUEST.HOST')}
        description={available
          ? (enabled ? t('REQUEST.HOST_ENABLED', { host }) : t('REQUEST.HOST_DISABLED'))
          : t('REQUEST.HOST_UNAVAILABLE')}
        size="small"
        data-testid="request-host-toggle"
      />
    </div>
  );
};

export default HostSelector;
