import * as React from 'react';

type ShoelaceStyle = React.CSSProperties & Record<`--${string}`, string | number>;

type ShoelaceElementProps = Omit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>, 'style'> & {
  style?: ShoelaceStyle;
  [key: string]: unknown;
};

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'sl-icon': ShoelaceElementProps;
        'sl-button': ShoelaceElementProps;
        'sl-dialog': ShoelaceElementProps;
        'sl-input': ShoelaceElementProps;
        'sl-select': ShoelaceElementProps;
        'sl-option': ShoelaceElementProps;
        'sl-switch': ShoelaceElementProps;
        'sl-tooltip': ShoelaceElementProps;
        'sl-spinner': ShoelaceElementProps;
        'sl-progress-bar': ShoelaceElementProps;
        'sl-avatar': ShoelaceElementProps;
        'sl-tab-group': ShoelaceElementProps;
        'sl-tab': ShoelaceElementProps;
        'sl-tab-panel': ShoelaceElementProps;
        'sl-range': ShoelaceElementProps;
        'sl-textarea': ShoelaceElementProps;
      }
    }
  }
}

export {};
