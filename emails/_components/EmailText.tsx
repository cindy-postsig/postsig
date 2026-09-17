import * as React from 'react';

type TextProps = React.HTMLAttributes<HTMLParagraphElement>;

export function Text({ style, ...props }: TextProps) {
  return (
    <p
      style={{
        fontSize: '14px',
        lineHeight: '22px',
        margin: '16px 0',
        ...style,
      }}
      {...props}
    />
  );
}
