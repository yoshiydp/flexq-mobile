import { BridgeExtension } from '@10play/tentap-editor';
import { COLORS } from '@/globalStyles';

export const AppEditorThemeBridge = new BridgeExtension({
  extendCSS: `
    html, body {
      background-color: ${COLORS.base.bgDefault};
      margin: 0;
      padding: 0;
    }
    .ProseMirror {
      color: ${COLORS.form.default.text};
      font-size: 18px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
      caret-color: ${COLORS.form.default.text};
      background-color: ${COLORS.base.bgDefault};
      padding: 16px 0;
    }
    .ProseMirror p {
      margin: 0;
    }
    .is-editor-empty:first-child::before {
      color: ${COLORS.form.placeholder} !important;
      font-weight: 400 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif !important;
    }
  `,
});
