import classnames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { updateActivePreferencesTab } from 'providers/ReduxStore/slices/app';
import {
  IconSettings,
  IconPalette,
  IconBrowser,
  IconUserCircle,
  IconKeyboard,
  IconZoomQuestion,
  IconSquareLetterB,
  IconDatabase,
  IconCertificate
} from '@tabler/icons';

import IconSparkles from 'components/Icons/IconSparkles';
import Support from './Support';
import General from './General';
import Themes from './Themes';
import Proxy from './ProxySettings';
import Display from './Display';
import Keybindings from './Keybindings';
import Beta from './Beta';
import AI from './AI';

import ClientCertSettings from './ClientCertSettings';

import StyledWrapper from './StyledWrapper';
import Cache from './Cache/index';

const Preferences = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const tab = useSelector((state) => state.app.activePreferencesTab);

  const setTab = (tab) => {
    dispatch(updateActivePreferencesTab({ tab }));
  };

  const getTabClassname = (tabName) => {
    return classnames(`tab select-none ${tabName}`, {
      active: tabName === tab
    });
  };

  const getTabPanel = (tab) => {
    switch (tab) {
      case 'general': {
        return <General />;
      }

      case 'themes': {
        return <Themes />;
      }

      case 'proxy': {
        return <Proxy />;
      }

      case 'display': {
        return <Display />;
      }

      case 'keybindings': {
        return <Keybindings />;
      }

      case 'beta': {
        return <Beta />;
      }

      case 'ai': {
        return <AI />;
      }

      case 'support': {
        return <Support />;
      }

      case 'cache': {
        return <Cache />;
      }

      case 'clientCert': {
        return <ClientCertSettings />;
      }
    }
  };

  return (
    <StyledWrapper className="h-full">
      <div className="flex flex-row gap-2 h-full">
        <div className="flex flex-col items-center tabs tablist" role="tablist">
          <div className={getTabClassname('general')} role="tab" onClick={() => setTab('general')}>
            <IconSettings size={16} strokeWidth={1.5} />
            {t('PREFERENCES.GENERAL')}
          </div>
          <div className={getTabClassname('themes')} role="tab" onClick={() => setTab('themes')}>
            <IconPalette size={16} strokeWidth={1.5} />
            {t('PREFERENCES.THEMES')}
          </div>
          <div className={getTabClassname('display')} role="tab" onClick={() => setTab('display')}>
            <IconBrowser size={16} strokeWidth={1.5} />
            {t('PREFERENCES.DISPLAY')}
          </div>
          <div className={getTabClassname('proxy')} role="tab" onClick={() => setTab('proxy')}>
            <IconUserCircle size={16} strokeWidth={1.5} />
            {t('PREFERENCES.PROXY')}
          </div>
          <div className={getTabClassname('clientCert')} role="tab" onClick={() => setTab('clientCert')}>
            <IconCertificate size={16} strokeWidth={1.5} />
            {t('PREFERENCES.CLIENT_CERTIFICATES')}
          </div>
          <div className={getTabClassname('keybindings')} role="tab" onClick={() => setTab('keybindings')}>
            <IconKeyboard size={16} strokeWidth={1.5} />
            {t('PREFERENCES.KEYBINDINGS')}
          </div>
          <div className={getTabClassname('ai')} role="tab" onClick={() => setTab('ai')}>
            <IconSparkles size={16} strokeWidth={1.5} />
            {t('PREFERENCES.AI')}
          </div>
          <div className={getTabClassname('cache')} role="tab" onClick={() => setTab('cache')}>
            <IconDatabase size={16} strokeWidth={1.5} />
            {t('PREFERENCES.CACHE')}
          </div>
          <div className={getTabClassname('support')} role="tab" onClick={() => setTab('support')}>
            <IconZoomQuestion size={16} strokeWidth={1.5} />
            {t('PREFERENCES.SUPPORT')}
          </div>
          <div className={getTabClassname('beta')} role="tab" onClick={() => setTab('beta')}>
            <IconSquareLetterB size={16} strokeWidth={1.5} />
            {t('PREFERENCES.BETA')}
          </div>
        </div>
        <section
          className="flex flex-grow ps-2 pe-4 pt-2 pb-6 p-[12px] tab-panel"
          role="tabpanel"
          id={`${tab}-panel`}
          aria-labelledby={`${tab}-tab`}
        >
          {getTabPanel(tab)}
        </section>
      </div>
    </StyledWrapper>
  );
};

export default Preferences;
