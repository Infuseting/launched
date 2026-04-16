import * as React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'sl-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { name?: string; library?: string; }, HTMLElement>;
      'sl-button': any;
      'sl-dialog': any;
      'sl-input': any;
      'sl-select': any;
      'sl-option': any;
      'sl-switch': any;
      'sl-tooltip': any;
      'sl-spinner': any;
      'sl-progress-bar': any;
      'sl-avatar': any;
      'sl-tab-group': any;
      'sl-tab': any;
      'sl-tab-panel': any;
      'sl-range': any;
      'sl-textarea': any;
    }
  }
}
