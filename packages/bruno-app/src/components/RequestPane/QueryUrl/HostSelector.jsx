import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconWorld, IconWorldOff } from '@tabler/icons';
import ToolHint from 'components/ToolHint';

const HostSelector = ({ host, enabled, onChange }) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  if (!host) {
    return null;
  }

  const label = enabled ? t('REQUEST.HOST_DISABLE') : t('REQUEST.HOST_ENABLE');
  const previewEnabled = isHovered || false;
  const displayEnabled = previewEnabled ? !enabled : enabled;
  const Icon = displayEnabled ? IconWorld : IconWorldOff;

  return (
    <div
      className="flex items-center h-full min-w-fit px-1 mr-1"
      data-testid="request-host-selector"
    >
      <ToolHint text={label} toolhintId="request-host-toggle" place="top" positionStrategy="fixed">
        <button
          type="button"
          className="group flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-1 dark:hover:bg-white/10"
          data-testid="request-host-toggle"
          aria-label={label}
          aria-pressed={enabled}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsHovered(true)}
          onBlur={() => setIsHovered(false)}
          onClick={onChange}
        >
          <Icon size={16} strokeWidth={1.5} />
        </button>
      </ToolHint>
      {enabled && <span className="ml-1 text-xs whitespace-nowrap text-muted">{host}</span>}
    </div>
  );
};

export default HostSelector;
