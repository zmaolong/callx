import React from 'react';
import { IconAlertTriangle } from '@tabler/icons';
import Modal from 'components/Modal';
import Button from 'ui/Button';
import Portal from 'ui/Portal';

/**
 * Flow 关闭确认：画布有未保存修改时，关闭 Tab 前提供 保存并关闭 / 放弃修改 / 取消。
 */
const ConfirmFlowClose = ({ flowName, onCancel, onCloseWithoutSave, onSaveAndClose }) => {
  return (
    <Portal>
      <Modal
        size="md"
        title="Unsaved changes"
        confirmText="Save and Close"
        cancelText="Close without saving"
        disableEscapeKey={true}
        disableCloseOnOutsideClick={true}
        closeModalFadeTimeout={150}
        handleCancel={onCancel}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        hideFooter={true}
      >
        <div className="flex items-center font-normal">
          <IconAlertTriangle size={32} strokeWidth={1.5} className="text-yellow-600" />
          <h1 className="ml-2 text-lg font-medium">Hold on..</h1>
        </div>
        <div className="font-normal mt-4">
          You have unsaved changes in flow <span className="font-medium">{flowName}</span>.
        </div>

        <div className="flex justify-between mt-6">
          <div>
            <Button color="danger" onClick={onCloseWithoutSave}>
              Don't Save
            </Button>
          </div>
          <div className="flex gap-2">
            <Button color="secondary" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onSaveAndClose}>Save</Button>
          </div>
        </div>
      </Modal>
    </Portal>
  );
};

export default ConfirmFlowClose;
