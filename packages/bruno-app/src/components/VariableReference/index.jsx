import React, { useMemo, useState } from 'react';
import { IconBraces, IconWand } from '@tabler/icons';
import { mockDataFunctions } from '@usebruno/common';
import { useTranslation } from 'react-i18next';
import { getAllVariables } from 'utils/collections';
import { insertTextAtActiveEditor } from 'utils/codemirror/activeEditor';
import toast from 'react-hot-toast';
import ActionIcon from 'ui/ActionIcon';
import Modal from 'components/Modal';
import SearchInput from 'components/SearchInput';
import ToolHint from 'components/ToolHint';

const INTERNAL_VARIABLES = new Set(['pathParams', 'maskedEnvVariables']);

const GENERATOR_DESCRIPTION_KEYS = {
  guid: 'GUID',
  timestamp: 'TIMESTAMP',
  isoTimestamp: 'ISO_TIMESTAMP',
  randomUUID: 'RANDOM_UUID',
  randomNanoId: 'RANDOM_NANO_ID',
  randomAlphaNumeric: 'RANDOM_ALPHA_NUMERIC',
  randomBoolean: 'RANDOM_BOOLEAN',
  randomInt: 'RANDOM_INT',
  randomEmail: 'RANDOM_EMAIL',
  randomUserName: 'RANDOM_USERNAME',
  randomFirstName: 'RANDOM_FIRST_NAME',
  randomLastName: 'RANDOM_LAST_NAME',
  randomFullName: 'RANDOM_FULL_NAME',
  randomPhoneNumber: 'RANDOM_PHONE',
  randomCity: 'RANDOM_CITY',
  randomCountry: 'RANDOM_COUNTRY',
  randomUrl: 'RANDOM_URL',
  randomPassword: 'RANDOM_PASSWORD',
  randomIP: 'RANDOM_IP',
  randomColor: 'RANDOM_COLOR',
  randomCompanyName: 'RANDOM_COMPANY',
  randomProductName: 'RANDOM_PRODUCT',
  randomDateFuture: 'RANDOM_DATE_FUTURE',
  randomDatePast: 'RANDOM_DATE_PAST',
  randomLoremSentence: 'RANDOM_LOREM_SENTENCE'
};

const GENERATOR_EXAMPLES = {
  guid: '550e8400-e29b-41d4-a716-446655440000',
  timestamp: '1710000000',
  isoTimestamp: '2024-03-09T12:00:00.000Z',
  randomUUID: '550e8400-e29b-41d4-a716-446655440000',
  randomNanoId: 'V1StGXR8_Z5jdHi6B-myT',
  randomAlphaNumeric: 'aB3xYz9K',
  randomBoolean: 'true',
  randomInt: '42',
  randomEmail: 'alex@example.com',
  randomUserName: 'alex_chen',
  randomFirstName: 'Alex',
  randomLastName: 'Chen',
  randomFullName: 'Alex Chen',
  randomPhoneNumber: '+1 202-555-0147',
  randomCity: 'Shanghai',
  randomCountry: 'China',
  randomUrl: 'https://example.com',
  randomPassword: 'pA9!xK2#mQ',
  randomIP: '192.168.1.42',
  randomColor: '#3B82F6',
  randomCompanyName: 'Acme Inc.',
  randomProductName: 'Ergonomic Chair',
  randomDateFuture: '2025-06-15T10:30:00.000Z',
  randomDatePast: '2023-06-15T10:30:00.000Z',
  randomLoremSentence: 'The quick brown fox jumps over the lazy dog.'
};

const humanizeGeneratorName = (name) => name
  .replace(/^random/, '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/^./, (character) => character.toUpperCase());

const VariableReference = ({ collection, item }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState(null);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const variables = useMemo(() => {
    if (!collection) return [];
    return Object.keys(getAllVariables(collection, item) || {})
      .filter((name) => !INTERNAL_VARIABLES.has(name))
      .sort((a, b) => a.localeCompare(b));
  }, [collection, item]);

  const generators = useMemo(() => Object.keys(mockDataFunctions)
    .filter((name) => GENERATOR_DESCRIPTION_KEYS[name])
    .sort((a, b) => a.localeCompare(b)), []);
  const options = mode === 'variables' ? variables : generators;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = options.filter((name) => {
    if (mode === 'variables') return name.toLowerCase().includes(normalizedSearch);
    const description = t(`VARIABLE_REFERENCE.GENERATORS.${GENERATOR_DESCRIPTION_KEYS[name] || 'DEFAULT'}`, {
      defaultValue: humanizeGeneratorName(name)
    });
    return name.toLowerCase().includes(normalizedSearch) || description.toLowerCase().includes(normalizedSearch);
  });

  const closeModal = () => {
    setMode(null);
    setSearch('');
    setIsOpen(false);
  };

  const insertOrCopy = async (expression) => {
    closeModal();
    if (insertTextAtActiveEditor(expression)) return;

    try {
      await navigator.clipboard.writeText(expression);
      toast.success(t('VARIABLE_REFERENCE.COPIED'));
    } catch {
      toast.error(t('VARIABLE_REFERENCE.COPY_FAILED'));
    }
  };

  const openModal = () => {
    setMode(null);
    setSearch('');
    setIsOpen(true);
  };

  const selectMode = (nextMode) => {
    setMode(nextMode);
    setSearch('');
  };

  const menuItems = [
    {
      id: 'read-variable',
      label: t('VARIABLE_REFERENCE.READ_VARIABLE'),
      leftSection: IconBraces,
      onClick: () => selectMode('variables')
    },
    {
      id: 'data-generator',
      label: t('VARIABLE_REFERENCE.DATA_GENERATOR'),
      leftSection: IconWand,
      onClick: () => selectMode('generators')
    }
  ];

  return (
    <>
      <ToolHint text={t('VARIABLE_REFERENCE.TITLE')} toolhintId="VariableReferenceToolhintId" place="bottom">
        <ActionIcon
          aria-label={t('VARIABLE_REFERENCE.TITLE')}
          size="sm"
          data-testid="variable-reference-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openModal}
        >
          <IconWand size={16} strokeWidth={1.5} />
        </ActionIcon>
      </ToolHint>

      {isOpen && (
        <Modal
          size="md"
          centered
          title={mode === 'variables' ? t('VARIABLE_REFERENCE.READ_VARIABLE') : mode === 'generators' ? t('VARIABLE_REFERENCE.DATA_GENERATOR') : t('VARIABLE_REFERENCE.TITLE')}
          handleCancel={closeModal}
          hideFooter
          dataTestId="variable-reference-modal"
        >
          {!mode ? (
            <div className="flex flex-col gap-1" data-testid="variable-reference-mode-options">
              {menuItems.map(({ id, label, leftSection: Icon, onClick }) => (
                <button
                  key={id}
                  type="button"
                  className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-secondary text-primary"
                  data-testid={`variable-reference-mode-${id}`}
                  onClick={onClick}
                >
                  <Icon size={16} strokeWidth={1.5} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <SearchInput
                searchText={search}
                setSearchText={setSearch}
                placeholder={t('VARIABLE_REFERENCE.SEARCH')}
                className="mb-3"
                inputClassName="bg-transparent"
                data-testid="variable-reference-search"
              />
              <div className="max-h-96 overflow-y-auto" data-testid="variable-reference-options">
                {filteredOptions.length ? filteredOptions.map((name) => {
                  const description = t(`VARIABLE_REFERENCE.GENERATORS.${GENERATOR_DESCRIPTION_KEYS[name] || 'DEFAULT'}`, {
                    defaultValue: humanizeGeneratorName(name)
                  });
                  const example = GENERATOR_EXAMPLES[name];
                  return (
                    <button
                      key={name}
                      type="button"
                      className="w-full text-left px-3 py-2 rounded hover:bg-secondary text-primary"
                      data-testid={`variable-reference-option-${name}`}
                      title={mode === 'generators' ? `{{$${name}}}` : `{{${name}}}`}
                      onClick={() => insertOrCopy(mode === 'variables' ? `{{${name}}}` : `{{$${name}}}`)}
                    >
                      {mode === 'variables' ? name : (
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span>{description}</span>
                          {example && <span className="text-xs text-secondary opacity-70">{t('VARIABLE_REFERENCE.EXAMPLE', { value: example })}</span>}
                        </span>
                      )}
                    </button>
                  );
                }) : (
                  <div className="text-secondary text-sm py-2" data-testid="variable-reference-empty">
                    {t('VARIABLE_REFERENCE.EMPTY')}
                  </div>
                )}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
};

export default VariableReference;
