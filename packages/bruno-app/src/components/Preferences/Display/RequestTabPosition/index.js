import React from 'react';
import get from 'lodash/get';
import { useDispatch, useSelector } from 'react-redux';
import { savePreferences } from 'providers/ReduxStore/slices/app';
import { useTranslation } from 'react-i18next';

const RequestTabPosition = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const preferences = useSelector((state) => state.app.preferences);
  const tabPosition = get(preferences, 'general.tabPosition', 'top') === 'right' ? 'right' : 'top';

  const handleChange = (event) => {
    const nextPosition = event.target.value;
    if (!['top', 'right'].includes(nextPosition) || nextPosition === tabPosition) {
      return;
    }

    dispatch(savePreferences({
      ...preferences,
      general: {
        ...preferences.general,
        tabPosition: nextPosition
      }
    })).catch(() => {});
  };

  return (
    <div className="flex flex-col mt-2">
      <span className="block select-none">{t('PREFERENCES.TAB_POSITION')}</span>
      <p className="text-muted mt-1 text-xs">{t('PREFERENCES.TAB_POSITION_HELP')}</p>
      <div className="flex items-center gap-4 mt-2">
        <label className="flex items-center gap-2 select-none" htmlFor="tabPositionTop">
          <input
            id="tabPositionTop"
            type="radio"
            name="tabPosition"
            value="top"
            checked={tabPosition === 'top'}
            onChange={handleChange}
            className="mousetrap"
          />
          {t('PREFERENCES.TAB_POSITION_TOP')}
        </label>
        <label className="flex items-center gap-2 select-none" htmlFor="tabPositionRight">
          <input
            id="tabPositionRight"
            type="radio"
            name="tabPosition"
            value="right"
            checked={tabPosition === 'right'}
            onChange={handleChange}
            className="mousetrap"
          />
          {t('PREFERENCES.TAB_POSITION_RIGHT')}
        </label>
      </div>
    </div>
  );
};

export default RequestTabPosition;
