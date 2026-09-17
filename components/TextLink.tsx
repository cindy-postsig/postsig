import { ReactNode } from 'react';

type TextLinkProps = {
  children?: ReactNode;
  href?: string;
  text: string;
  onClick?: () => void;
};

export default function TextLink({
  children,
  href,
  text,
  onClick,
}: TextLinkProps) {
  return (
    <a
      href={href || '#'}
      className="mr-4 inline-flex text-sm text-muted-foreground"
      onClick={(e) => {
        e.preventDefault();
        if (onClick) {
          onClick();
        }
      }}
    >
      {children}
      {text}
    </a>
  );
}
